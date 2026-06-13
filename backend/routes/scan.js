const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

const QTY_MAX       = 100000;
const NOTES_MAX     = 200;
const BARCODE_REGEX = /^[A-Z0-9]{3,20}$/; // only uppercase alphanum, 3–20 chars

function safeInt(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function safeNotes(notes) {
  if (!notes || typeof notes !== 'string') return null;
  return notes.trim().slice(0, NOTES_MAX) || null;
}

// ── GET /api/scan/lookup/:barcode ─────────────────────────────────────────────
router.get('/lookup/:barcode', auth, (req, res) => {
  const barcode = req.params.barcode.trim().toUpperCase();

  if (!BARCODE_REGEX.test(barcode)) {
    return res.status(400).json({ error: 'Invalid barcode format' });
  }

  const branch = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) as child_count,
      COALESCE(i.quantity, 0) as quantity
    FROM branches b
    LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
    WHERE b.barcode = ? AND b.user_id = ?
  `).get([barcode, req.user.userId]);

  if (!branch) {
    return res.status(404).json({ error: 'No product found for this barcode.' });
  }

  res.json(branch);
});

// ── POST /api/scan/process ────────────────────────────────────────────────────
router.post('/process', auth, (req, res) => {
  const { barcode, notes, action = 'remove' } = req.body;

  if (!['add', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "add" or "remove"' });
  }

  if (!barcode || typeof barcode !== 'string') {
    return res.status(400).json({ error: 'Barcode is required' });
  }

  const code = barcode.trim().toUpperCase();
  if (!BARCODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Invalid barcode format' });
  }

  const qty = safeInt(req.body.quantity ?? 1);
  if (!qty)          return res.status(400).json({ error: 'Quantity must be a positive number' });
  if (qty > QTY_MAX) return res.status(400).json({ error: `Quantity cannot exceed ${QTY_MAX.toLocaleString()}` });

  const branch = db.prepare(`
    SELECT b.*, COALESCE(i.quantity, 0) as quantity
    FROM branches b
    LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
    WHERE b.barcode = ? AND b.user_id = ?
  `).get([code, req.user.userId]);

  if (!branch) {
    return res.status(404).json({ error: 'Product not found for this barcode' });
  }

  if (action === 'remove' && branch.quantity < qty) {
    return res.status(400).json({
      error: `Insufficient stock. Only ${branch.quantity} unit${branch.quantity !== 1 ? 's' : ''} available.`,
    });
  }

  if (action === 'add') {
    db.prepare(`
      INSERT INTO inventory (user_id, branch_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, branch_id) DO UPDATE SET
        quantity = quantity + excluded.quantity,
        updated_at = CURRENT_TIMESTAMP
    `).run([req.user.userId, branch.id, qty]);
  } else {
    db.prepare(`
      UPDATE inventory
      SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND branch_id = ?
    `).run([qty, req.user.userId, branch.id]);
  }

  db.prepare(`
    INSERT INTO transactions (user_id, branch_id, type, quantity, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run([req.user.userId, branch.id, action, qty, safeNotes(notes) || 'Barcode scan']);

  const updated = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND branch_id = ?')
    .get([req.user.userId, branch.id]);

  res.json({
    success: true,
    action,
    product: { id: branch.id, name: branch.name, path: branch.path, barcode: branch.barcode },
    changedQuantity: qty,
    remainingQuantity: updated?.quantity || 0,
  });
});

module.exports = router;
