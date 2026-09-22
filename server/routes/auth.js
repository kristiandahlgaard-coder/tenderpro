/**
 * TenderPro — Auth Routes
 * POST /api/auth/login
 * POST /api/auth/register
 * GET  /api/auth/me
 */
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
    }

    const result = await db.query(
      `SELECT u.*, o.name as org_name
       FROM users u
       LEFT JOIN organisationen o ON u.organisation_id = o.id
       WHERE u.email = $1 AND u.aktiv = true`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Last login aktualisieren
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        vorname: user.vorname,
        nachname: user.nachname,
        rolle: user.rolle,
        abteilung: user.abteilung,
        organisation_id: user.organisation_id,
        org_name: user.org_name,
      }
    });
  } catch (err) {
    console.error('Login-Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Registrierung (vereinfacht — für MVP)
router.post('/register', async (req, res) => {
  try {
    const { email, password, vorname, nachname, organisation_id } = req.body;
    if (!email || !password || !vorname || !nachname) {
      return res.status(400).json({ error: 'Alle Pflichtfelder ausfüllen' });
    }

    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'E-Mail bereits registriert' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, vorname, nachname, organisation_id, rolle)
       VALUES ($1, $2, $3, $4, $5, 'beantragend')
       RETURNING id, email, vorname, nachname, rolle`,
      [email.toLowerCase(), hash, vorname, nachname, organisation_id || null]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Registrierung-Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Profil
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.vorname, u.nachname, u.rolle, u.abteilung,
              u.organisation_id, o.name as org_name
       FROM users u
       LEFT JOIN organisationen o ON u.organisation_id = o.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profil-Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
