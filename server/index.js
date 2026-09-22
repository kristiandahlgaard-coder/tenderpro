/**
 * TenderPro — Express Server
 * Serves API + Vue Frontend (production)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Middleware ───────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true  // Allow same-origin (Vue served from same server)
    : [process.env.CLIENT_URL || 'http://localhost:5173'],
  credentials: true,
}));

// ─── API Routes ──────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vergaben', require('./routes/vergaben'));
app.use('/api/freigaben', require('./routes/freigaben'));
app.use('/api', require('./routes/stammdaten'));

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./db');
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

// ─── Vue Frontend (Production) ───────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));

  // SPA Fallback — alle nicht-API-Routen → index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ─── Error Handler ───────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unbehandelter Fehler:', err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

// ─── Start ───────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🟢 TenderPro Server läuft auf Port ${PORT}`);
  console.log(`   Umgebung: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   API: http://localhost:${PORT}/api/health\n`);
});
