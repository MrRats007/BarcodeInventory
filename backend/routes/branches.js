const express = require('express');
const router  = express.Router();
const bwip    = require('bwip-js');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const auth    = require('../middleware/auth');

// ── Constants ────────────────────────────────────────────────────────────────
const NAME_MAX   = 80;   // max branch name length
const PATH_MAX   = 500;  // max total path string length
const TREE_DEPTH = 10;   // max nesting levels

// ── Barcode generation ───────────────────────────────────────────────────────
function generateBarcode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'INV';
  for (let i = 0; i < 9; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makeUniqueBarcode() {
  for (let i = 0; i < 20; i++) {
    const barcode = generateBarcode();
    if (!db.prepare('SELECT id FROM branches WHERE barcode = ?').get(barcode)) return barcode;
  }
  throw new Error('Could not generate unique barcode');
}

// ── Input helpers ────────────────────────────────────────────────────────────
function safeInt(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const t = name.trim();
  if (t.length === 0 || t.length > NAME_MAX) return null;
  return t;
}

// ── Special auth for barcode image endpoint (accepts ?token= query param) ────
function barcodeAuth(req, res, next) {
  const header = req.headers.authorization;
  const token  = (header?.startsWith('Bearer ') ? header.split(' ')[1] : null)
               || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── GET /api/branches ────────────────────────────────────────────────────────
router.get('/', auth, (req, res) => {
  const parentId = req.query.parentId ? safeInt(req.query.parentId) : null;

  // If parentId was provided but invalid, reject
  if (req.query.parentId !== undefined && req.query.parentId !== '' && parentId === null) {
    return res.status(400).json({ error: 'Invalid parentId' });
  }

  const branches = parentId
    ? db.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) as child_count,
          COALESCE(i.quantity, 0) as quantity
        FROM branches b
        LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
        WHERE b.user_id = ? AND b.parent_id = ?
        ORDER BY b.name
      `).all([req.user.userId, parentId])
    : db.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) as child_count,
          COALESCE(i.quantity, 0) as quantity
        FROM branches b
        LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
        WHERE b.user_id = ? AND b.parent_id IS NULL
        ORDER BY b.name
      `).all([req.user.userId]);

  res.json(branches);
});

// ── GET /api/branches/all ────────────────────────────────────────────────────
router.get('/all', auth, (req, res) => {
  const branches = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) as child_count,
      COALESCE(i.quantity, 0) as quantity
    FROM branches b
    LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
    WHERE b.user_id = ?
    ORDER BY b.path
  `).all([req.user.userId]);
  res.json(branches);
});

// ── GET /api/branches/:id ────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid branch id' });

  const branch = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM branches c WHERE c.parent_id = b.id) as child_count,
      COALESCE(i.quantity, 0) as quantity
    FROM branches b
    LEFT JOIN inventory i ON i.branch_id = b.id AND i.user_id = b.user_id
    WHERE b.id = ? AND b.user_id = ?
  `).get([id, req.user.userId]);

  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  res.json(branch);
});

// ── GET /api/branches/:id/ancestors ──────────────────────────────────────────
router.get('/:id/ancestors', auth, (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid branch id' });

  const ancestors = [];
  let currentId = id;

  while (currentId) {
    const branch = db.prepare(
      'SELECT id, name, path, parent_id FROM branches WHERE id = ? AND user_id = ?'
    ).get([currentId, req.user.userId]);
    if (!branch) break;
    ancestors.unshift(branch);
    currentId = branch.parent_id;
    if (ancestors.length > TREE_DEPTH + 1) break; // safety
  }

  res.json(ancestors);
});

// ── GET /api/branches/:id/barcode — PNG image ─────────────────────────────────
router.get('/:id/barcode', barcodeAuth, async (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).send('Invalid id');

  const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND user_id = ?')
    .get([id, req.user.userId]);
  if (!branch) return res.status(404).send('Not found');

  try {
    const png = await bwip.toBuffer({
      bcid: 'code128', text: branch.barcode,
      scale: 4, height: 16, includetext: true,
      textxalign: 'center', textsize: 11,
      paddingwidth: 10, paddingheight: 6,
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (err) {
    res.status(500).send('Barcode generation failed');
  }
});

// ── POST /api/branches — create ───────────────────────────────────────────────
router.post('/', auth, (req, res) => {
  const name = sanitizeName(req.body.name);
  if (!name) {
    return res.status(400).json({ error: `Branch name must be 1–${NAME_MAX} characters` });
  }

  // Reject control characters / HTML tags in names
  if (/[<>]/.test(name)) {
    return res.status(400).json({ error: 'Branch name contains invalid characters' });
  }

  const parentId = req.body.parentId ? safeInt(req.body.parentId) : null;
  if (req.body.parentId !== undefined && req.body.parentId !== null && parentId === null) {
    return res.status(400).json({ error: 'Invalid parentId' });
  }

  // Verify parent belongs to this user
  let path = name;
  if (parentId) {
    const parent = db.prepare('SELECT path, id FROM branches WHERE id = ? AND user_id = ?')
      .get([parentId, req.user.userId]);
    if (!parent) return res.status(404).json({ error: 'Parent branch not found' });

    // Depth check — count separators in current path
    const currentDepth = (parent.path.match(/›/g) || []).length + 1;
    if (currentDepth >= TREE_DEPTH) {
      return res.status(400).json({ error: `Maximum nesting depth of ${TREE_DEPTH} levels reached` });
    }

    path = parent.path + ' › ' + name;
    if (path.length > PATH_MAX) {
      return res.status(400).json({ error: 'Category path is too long. Use shorter names.' });
    }
  }

  // Duplicate name under same parent
  const existing = db.prepare(
    'SELECT id FROM branches WHERE user_id = ? AND parent_id IS ? AND name = ?'
  ).get([req.user.userId, parentId || null, name]);
  if (existing) {
    return res.status(409).json({ error: 'A category with this name already exists here' });
  }

  try {
    const barcode = makeUniqueBarcode();
    const result  = db.prepare(
      'INSERT INTO branches (user_id, parent_id, name, path, barcode) VALUES (?, ?, ?, ?, ?)'
    ).run([req.user.userId, parentId || null, name, path, barcode]);

    const branch = db.prepare(
      'SELECT b.*, 0 as child_count, 0 as quantity FROM branches b WHERE b.id = ?'
    ).get(result.lastInsertRowid);

    res.status(201).json(branch);
  } catch (err) {
    console.error('[branch create]', err.message);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ── DELETE /api/branches/:id ──────────────────────────────────────────────────
router.delete('/:id', auth, (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid branch id' });

  const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND user_id = ?')
    .get([id, req.user.userId]);
  if (!branch) return res.status(404).json({ error: 'Branch not found' });

  const { count } = db.prepare('SELECT COUNT(*) as count FROM branches WHERE parent_id = ?')
    .get(id);
  if (count > 0) {
    return res.status(400).json({ error: 'Delete all sub-categories first before deleting this one' });
  }

  db.prepare('DELETE FROM inventory WHERE branch_id = ?').run(id);
  db.prepare('DELETE FROM transactions WHERE branch_id = ?').run(id);
  db.prepare('DELETE FROM branches WHERE id = ?').run(id);

  res.json({ success: true });
});

module.exports = router;
