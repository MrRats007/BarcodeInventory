const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

const QTY_MAX   = 100000; // max units per single transaction
const NOTES_MAX = 200;    // max notes length

function safeInt(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function safeNotes(notes) {
  if (!notes || typeof notes !== 'string') return null;
  return notes.trim().slice(0, NOTES_MAX) || null;
}

// ── GET /api/inventory — leaf products only ───────────────────────────────────
router.get('/', auth, (req, res) => {
  const items = db.prepare(`
    SELECT
      b.id, b.name, b.path, b.barcode,
      COALESCE(i.quantity, 0) as quantity,
      i.updated_at
    FROM branches b
    LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
    WHERE b.user_id = ?
      AND (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) = 0
    ORDER BY b.path
  `).all([req.user.userId]);
  res.json(items);
});

// ── GET /api/inventory/stats ──────────────────────────────────────────────────
router.get('/stats', auth, (req, res) => {
  const uid = req.user.userId;

  const totalProducts = db.prepare(
    'SELECT COUNT(*) as count FROM branches WHERE user_id = ?'
  ).get(uid).count;

  const totalStock = db.prepare(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM inventory WHERE user_id = ?'
  ).get(uid).total;

  const totalLeaves = db.prepare(`
    SELECT COUNT(*) as count FROM branches b
    WHERE b.user_id = ?
      AND (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) = 0
  `).get(uid).count;

  const recentTransactions = db.prepare(`
    SELECT t.*, b.name, b.path
    FROM transactions t
    JOIN branches b ON b.id = t.branch_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
    LIMIT 10
  `).all([uid]);

  const lowStock = db.prepare(`
    SELECT b.id, b.name, b.path, COALESCE(i.quantity, 0) as quantity
    FROM branches b
    LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
    WHERE b.user_id = ?
      AND (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) = 0
      AND COALESCE(i.quantity, 0) <= 5
    ORDER BY quantity ASC
    LIMIT 5
  `).all([uid]);

  res.json({ totalProducts, totalStock, totalLeaves, recentTransactions, lowStock });
});

// ── GET /api/inventory/history ────────────────────────────────────────────────
router.get('/history', auth, (req, res) => {
  const { type, startDate, endDate } = req.query;

  // Validate optional filters
  if (type && !['add', 'remove'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "add" or "remove"' });
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return res.status(400).json({ error: 'Invalid startDate format (use YYYY-MM-DD)' });
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: 'Invalid endDate format (use YYYY-MM-DD)' });
  }

  let query  = `SELECT t.*, b.name, b.path, b.barcode
                FROM transactions t
                JOIN branches b ON b.id = t.branch_id
                WHERE t.user_id = ?`;
  const params = [req.user.userId];

  if (type)      { query += ' AND t.type = ?';                params.push(type); }
  if (startDate) { query += ' AND DATE(t.created_at) >= ?';   params.push(startDate); }
  if (endDate)   { query += ' AND DATE(t.created_at) <= ?';   params.push(endDate); }

  query += ' ORDER BY t.created_at DESC LIMIT 1000'; // cap at 1000 rows

  res.json(db.prepare(query).all(params));
});

// ── POST /api/inventory/add ───────────────────────────────────────────────────
router.post('/add', auth, (req, res) => {
  const branchId = safeInt(req.body.branchId);
  if (!branchId) return res.status(400).json({ error: 'Valid branch ID is required' });

  const qty = safeInt(req.body.quantity);
  if (!qty)          return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (qty > QTY_MAX) return res.status(400).json({ error: `Quantity cannot exceed ${QTY_MAX.toLocaleString()} per transaction` });

  const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND user_id = ?')
    .get([branchId, req.user.userId]);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });

  db.prepare(`
    INSERT INTO inventory (user_id, branch_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, branch_id) DO UPDATE SET
      quantity = quantity + excluded.quantity,
      updated_at = CURRENT_TIMESTAMP
  `).run([req.user.userId, branchId, qty]);

  db.prepare(`
    INSERT INTO transactions (user_id, branch_id, type, quantity, notes)
    VALUES (?, ?, 'add', ?, ?)
  `).run([req.user.userId, branchId, qty, safeNotes(req.body.notes)]);

  const inv = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND branch_id = ?')
    .get([req.user.userId, branchId]);

  res.json({ success: true, quantity: inv.quantity });
});

// ── POST /api/inventory/remove ────────────────────────────────────────────────
router.post('/remove', auth, (req, res) => {
  const branchId = safeInt(req.body.branchId);
  if (!branchId) return res.status(400).json({ error: 'Valid branch ID is required' });

  const qty = safeInt(req.body.quantity);
  if (!qty)          return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (qty > QTY_MAX) return res.status(400).json({ error: `Quantity cannot exceed ${QTY_MAX.toLocaleString()} per transaction` });

  const inv = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND branch_id = ?')
    .get([req.user.userId, branchId]);
  const currentQty = inv?.quantity || 0;
  if (currentQty < qty) {
    return res.status(400).json({ error: `Insufficient stock. Available: ${currentQty}` });
  }

  db.prepare(`
    UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND branch_id = ?
  `).run([qty, req.user.userId, branchId]);

  db.prepare(`
    INSERT INTO transactions (user_id, branch_id, type, quantity, notes)
    VALUES (?, ?, 'remove', ?, ?)
  `).run([req.user.userId, branchId, qty, safeNotes(req.body.notes)]);

  const updated = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND branch_id = ?')
    .get([req.user.userId, branchId]);

  res.json({ success: true, quantity: updated.quantity });
});

module.exports = router;
