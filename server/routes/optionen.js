/**
 * TenderPro — Optionskatalog API
 * GET /api/optionen              — priorisierte Handlungsoptionen für eine Vergabe
 *     ?leistungsart=Dienstleistung&volumen=150000[&bundesland=Berlin][&merkmale={"standardisiert":true}]
 * GET /api/optionen/rechtsstand  — Schwellenwerte und Landes-Wertgrenzen
 */
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ermittleOptionen, rechtsstand } = require('../services/optionskatalog');

const router = express.Router();

async function orgDaten(orgId) {
  if (!orgId) return {};
  try {
    const { rows } = await db.query('SELECT bundesland, typ FROM organisationen WHERE id = $1', [orgId]);
    return rows[0] || {};
  } catch (err) {
    console.error('Organisation laden fehlgeschlagen:', err.message);
    return {};
  }
}

function parseMerkmale(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Nur boolesche Werte übernehmen
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'boolean'));
  } catch {
    return {};
  }
}

router.get('/', requireAuth, async (req, res) => {
  const { leistungsart, volumen, bundesland, merkmale } = req.query;
  if (!leistungsart) return res.status(400).json({ error: 'Parameter leistungsart fehlt' });

  const org = await orgDaten(req.user.organisation_id);
  const ergebnis = ermittleOptionen({
    leistungsart,
    volumen: volumen ? parseFloat(volumen) : null,
    bundesland: bundesland || org.bundesland,
    orgTyp: org.typ,
    merkmale: parseMerkmale(merkmale),
  });
  res.json(ergebnis);
});

router.get('/rechtsstand', requireAuth, (req, res) => {
  res.json(rechtsstand);
});

module.exports = router;
