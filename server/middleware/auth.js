/**
 * TenderPro — JWT Authentication Middleware
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');

const IST_PRODUKTION = process.env.NODE_ENV === 'production';

// Kein fest hinterlegtes Ersatz-Geheimnis: Im Produktivbetrieb muss JWT_SECRET gesetzt sein,
// sonst startet der Server nicht. In der Entwicklung wird pro Prozess ein Zufallswert erzeugt.
function ladeJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (IST_PRODUKTION) {
    throw new Error('JWT_SECRET fehlt oder ist kürzer als 32 Zeichen. Bitte in den Umgebungsvariablen setzen.');
  }
  console.warn('⚠️  JWT_SECRET nicht gesetzt – Entwicklungsmodus mit zufälligem Schlüssel (Anmeldungen gelten nur bis zum Neustart).');
  return crypto.randomBytes(48).toString('hex');
}

const JWT_SECRET = ladeJwtSecret();
const JWT_EXPIRES = '24h';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rolle: user.rolle, organisation_id: user.organisation_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware
// Rolle, Organisation und Aktiv-Status werden bei jeder Anfrage aus der Datenbank geladen,
// damit gesperrte oder geänderte Konten sofort wirken und nicht erst nach Ablauf des Tokens.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }
  let decoded;
  try {
    decoded = verifyToken(header.split(' ')[1]);
  } catch (err) {
    return res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
  try {
    const { rows } = await db.query(
      'SELECT id, email, rolle, organisation_id FROM users WHERE id = $1 AND aktiv = true',
      [decoded.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Konto nicht aktiv' });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    console.error('Auth-Prüfung fehlgeschlagen:', err.message);
    return res.status(500).json({ error: 'Serverfehler' });
  }
}

// Rollen-Check
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rolle)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    next();
  };
}

module.exports = { generateToken, verifyToken, requireAuth, requireRole, JWT_SECRET };
