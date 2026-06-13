require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes      = require('./routes/auth');
const branchRoutes    = require('./routes/branches');
const inventoryRoutes = require('./routes/inventory');
const scanRoutes      = require('./routes/scan');

// ── Abort immediately if JWT secret is missing in production ─────────────────
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}

const app = express();

// ── Security headers (Helmet) ────────────────────────────────────────────────
app.use(helmet());

// ── CORS — only allow the known frontend origin ──────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server / curl (no origin) only in development
    if (!origin && process.env.NODE_ENV !== 'production') return cb(null, true);
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Body parsing — cap at 20 KB to block payload-flooding ───────────────────
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

// ── Global rate limit: 200 req / 15 min per IP ───────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
}));

// ── Strict rate limit on auth endpoints: 10 attempts / 15 min ───────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// ── Scan rate limit: 60 scans / min (prevents scanner spam) ─────────────────
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scan rate limit exceeded. Please slow down.' },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/branches',  branchRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/scan',      scanLimiter, scanRoutes);

// ── Health check (no auth, not rate-limited tightly) ─────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler — never leak stack traces to client ─────────────────
app.use((err, req, res, next) => {
  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin not allowed' });
  }
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});
