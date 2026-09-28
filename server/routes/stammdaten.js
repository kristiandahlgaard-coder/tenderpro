/**
 * TenderPro — Stammdaten Routes
 * GET /api/formulare/vorlagen  — Formularvorlagen-Bibliothek
 * GET /api/dashboard/stats     — Dashboard-Statistiken
 * GET /api/audit/:vergabe_id   — Audit-Trail
 */
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Formularvorlagen
router.get('/formulare/vorlagen', requireAuth, async (req, res) => {
  try {
    const { phase, kategorie, regime } = req.query;
    let where = ['aktiv = true'];
    let params = [];
    let idx = 1;

    if (phase) { where.push(`phase = $${idx++}`); params.push(phase); }
    if (kategorie) { where.push(`kategorie = $${idx++}`); params.push(kategorie); }
    if (regime) { where.push(`(schwellenwert_regime IS NULL OR schwellenwert_regime = $${idx++})`); params.push(regime); }

    const { rows } = await db.query(
      `SELECT * FROM formular_vorlagen WHERE ${where.join(' AND ')} ORDER BY sortierung, name`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('Formulare Fehler:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Dashboard-Statistiken
router.get('/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.organisation_id;

    const [gesamt, status, fristen, letzte] = await Promise.all([
      db.query('SELECT COUNT(*) FROM vergaben WHERE organisation_id = $1', [orgId]),
      db.query(`
        SELECT status, COUNT(*) as anzahl
        FROM vergaben WHERE organisation_id = $1
        GROUP BY status
      `, [orgId]),
      db.query(`
        SELECT vf.*, v.vergabenummer, v.leistungsbeschreibung
        FROM vergabe_fristen vf
        JOIN vergaben v ON vf.vergabe_id = v.id
        WHERE v.organisation_id = $1 AND vf.erledigt = false AND vf.frist_datum >= CURRENT_DATE
        ORDER BY vf.frist_datum
        LIMIT 10
      `, [orgId]),
      db.query(`
        SELECT al.*, v.vergabenummer,
               u.vorname || ' ' || u.nachname as user_name
        FROM audit_log al
        LEFT JOIN vergaben v ON al.vergabe_id = v.id
        LEFT JOIN users u ON al.user_id = u.id
        WHERE (v.organisation_id = $1 OR al.user_id IN (SELECT id FROM users WHERE organisation_id = $1))
        ORDER BY al.created_at DESC
        LIMIT 15
      `, [orgId]),
    ]);

    // Status-Map
    const statusMap = {};
    status.rows.forEach(r => { statusMap[r.status] = parseInt(r.anzahl); });

    res.json({
      gesamt: parseInt(gesamt.rows[0].count),
      status: statusMap,
      naechste_fristen: fristen.rows,
      letzte_aktivitaeten: letzte.rows,
      offene_freigaben: statusMap.in_freigabe || 0,
    });
  } catch (err) {
    console.error('Dashboard Fehler:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Audit-Trail
router.get('/audit/:vergabe_id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT al.*, u.vorname || ' ' || u.nachname as user_name
      FROM audit_log al
      JOIN vergaben v ON v.id = al.vergabe_id
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.vergabe_id = $1 AND v.organisation_id = $2
      ORDER BY al.created_at DESC
    `, [req.params.vergabe_id, req.user.organisation_id]);
    res.json(rows);
  } catch (err) {
    console.error('Audit Fehler:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
