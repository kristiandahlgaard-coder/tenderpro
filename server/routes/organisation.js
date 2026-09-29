/**
 * TenderPro — Organisation Routes
 * GET /api/organisation  — Stammdaten der eigenen Organisation
 * PUT /api/organisation  — Stammdaten ändern (nur Rolle "admin")
 *
 * organisationen.bundesland und organisationen.typ steuern unmittelbar, welche
 * Wertgrenzen und EU-Schwellenwerte server/services/optionskatalog.js für diese
 * Organisation ansetzt (siehe server/wissen/rechtsstand.json). Bis zu dieser Route
 * gab es keine Oberfläche, um diese Felder zu setzen – nur direkt in der Datenbank.
 */
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Zulässige Werte für organisationen.typ (siehe server/sql/schema.sql CHECK-Constraint)
const TYP_OPTIONEN = ['klassisch', 'sektoren', 'konzession', 'oberste_bundesbehoerde'];

// Für die Zuordnung zu einem Landes-Pack (server/services/optionskatalog.js resolvePack):
// "Bund" löst den Bund-Pack aus, die 16 Länder fallen unter den jeweiligen Landes- bzw.
// Standard-Pack (aktuell hat nur Berlin einen eigenen Pack, sonst gilt UVgO/VOB/A pur).
const BUNDESLAND_OPTIONEN = [
  'Bund',
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
  'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen',
  'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein',
  'Thüringen',
];

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!req.user.organisation_id) {
      return res.status(403).json({ error: 'Ihr Konto ist keiner Organisation zugeordnet.' });
    }
    const { rows } = await db.query(
      `SELECT id, name, strasse, plz, ort, bundesland, typ, created_at, updated_at
       FROM organisationen WHERE id = $1`,
      [req.user.organisation_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Organisation nicht gefunden' });
    res.json({ organisation: rows[0], typ_optionen: TYP_OPTIONEN, bundesland_optionen: BUNDESLAND_OPTIONEN });
  } catch (err) {
    console.error('Organisation laden fehlgeschlagen:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!req.user.organisation_id) {
      return res.status(403).json({ error: 'Ihr Konto ist keiner Organisation zugeordnet.' });
    }
    const { name, strasse, plz, ort, bundesland, typ } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name ist ein Pflichtfeld' });
    }
    if (typ && !TYP_OPTIONEN.includes(typ)) {
      return res.status(400).json({ error: `Ungültiger Organisationstyp. Zulässig: ${TYP_OPTIONEN.join(', ')}` });
    }
    if (bundesland && !BUNDESLAND_OPTIONEN.includes(bundesland)) {
      return res.status(400).json({ error: 'Ungültiges Bundesland' });
    }

    const { rows } = await db.query(
      `UPDATE organisationen
       SET name = $1, strasse = $2, plz = $3, ort = $4, bundesland = $5, typ = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, strasse, plz, ort, bundesland, typ, created_at, updated_at`,
      [
        String(name).trim(),
        strasse || null,
        plz || null,
        ort || null,
        bundesland || null,
        typ || 'klassisch',
        req.user.organisation_id,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Organisation nicht gefunden' });
    res.json({ organisation: rows[0] });
  } catch (err) {
    console.error('Organisation speichern fehlgeschlagen:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
