const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const auth    = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET; // guaranteed set by server.js startup check

// ── Helpers ──────────────────────────────────────────────────────────────────
function validateEmail(email) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/.test(email);
}

function validatePassword(password) {
  if (password.length < 8)  return 'Password must be at least 8 characters';
  if (password.length > 72) return 'Password must be under 72 characters'; // bcrypt hard limit
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password))    return 'Password must contain at least one number';
  return null; // valid
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  // Presence check
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Length / format guards
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) {
    return res.status(400).json({ error: 'Name must be between 1 and 80 characters' });
  }
  if (typeof email !== 'string' || !validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid password' });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const safeName  = name.trim();
  const safeEmail = email.toLowerCase().trim();
  const hash      = bcrypt.hashSync(password, 12); // cost 12 (higher than default 10)

  try {
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run([safeName, safeEmail, hash]);

    const token = jwt.sign(
      { userId: result.lastInsertRowid, email: safeEmail },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, name: safeName, email: safeEmail },
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  if (password.length > 72) {
    // bcrypt silently truncates; reject early to prevent DoS via huge strings
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim());

  // Always run bcrypt even when user not found — prevents timing-based
  // enumeration of which emails are registered
  const dummyHash = '$2a$12$invalidhashusedtoblindtimingattacksonmissingemail00000';
  const match = bcrypt.compareSync(password, user?.password_hash || dummyHash);

  if (!user || !match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?')
    .get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
