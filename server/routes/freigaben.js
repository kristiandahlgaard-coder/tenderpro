/**
 * TenderPro — Freigabe-Workflow Routes
 * GET  /api/freigaben              — Meine offenen Freigaben
 * POST /api/freigaben/:id/approve  — Genehmigen
 * POST /api/freigaben/:id/reject   — Ablehnen
 * GET  /api/freigabe-regeln        — Regeln anzeigen (Admin)
 */
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Meine offenen Freigaben
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT fk.*,
             v.vergabenummer, v.leistungsbeschreibung, v.leistungsart,
             v.volumen_netto, v.verfahrensart, v.status as vergabe_status,
             v.risikobewertung,
             u.vorname || ' ' || u.nachname as ersteller_name,
             u.abteilung as ersteller_abteilung
      FROM freigabenkette fk
      JOIN vergaben v ON fk.vergabe_id = v.id
      LEFT JOIN users u ON v.ersteller_id = u.id
      WHERE fk.freigeber_id = $1 AND fk.status = 'ausstehend'
        AND v.status = 'in_freigabe'
      ORDER BY v.updated_at DESC
    `, [req.user.id]);

    res.json(rows);
  } catch (err) {
    console.error('Freigaben-Liste Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Genehmigen
router.post('/:id/approve', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { kommentar } = req.body;

    // Prüfen ob dieser User diese Freigabe erteilen darf
    const { rows } = await client.query(
      `UPDATE freigabenkette
       SET status = 'genehmigt', kommentar = $1, entschieden_at = NOW()
       WHERE id = $2 AND freigeber_id = $3 AND status = 'ausstehend'
       RETURNING *, vergabe_id`,
      [kommentar || null, req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Freigabe nicht möglich' });
    }

    const vergabeId = rows[0].vergabe_id;

    // Prüfen ob alle Freigaben erteilt
    const { rows: offene } = await client.query(
      `SELECT COUNT(*) FROM freigabenkette WHERE vergabe_id = $1 AND status = 'ausstehend'`,
      [vergabeId]
    );

    if (parseInt(offene[0].count) === 0) {
      // Alle Freigaben erteilt → Status ändern
      await client.query(
        `UPDATE vergaben SET status = 'genehmigt', genehmigt_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [vergabeId]
      );
    }

    // Audit
    await client.query(
      `INSERT INTO audit_log (vergabe_id, user_id, aktion, details)
       VALUES ($1, $2, 'freigabe_erteilt', $3)`,
      [vergabeId, req.user.id, JSON.stringify({ stufe: rows[0].stufe, rolle: rows[0].rolle, kommentar })]
    );

    await client.query('COMMIT');
    res.json({ status: 'genehmigt', alle_erteilt: parseInt(offene[0].count) === 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Genehmigung Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  } finally {
    client.release();
  }
});

// Ablehnen
router.post('/:id/reject', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { kommentar } = req.body;
    if (!kommentar) {
      return res.status(400).json({ error: 'Ablehnungsgrund ist Pflichtfeld' });
    }

    const { rows } = await client.query(
      `UPDATE freigabenkette
       SET status = 'abgelehnt', kommentar = $1, entschieden_at = NOW()
       WHERE id = $2 AND freigeber_id = $3 AND status = 'ausstehend'
       RETURNING *, vergabe_id`,
      [kommentar, req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ablehnung nicht möglich' });
    }

    // Vergabe als abgelehnt markieren
    await client.query(
      `UPDATE vergaben SET status = 'abgelehnt', ablehnungsgrund = $1, updated_at = NOW() WHERE id = $2`,
      [kommentar, rows[0].vergabe_id]
    );

    // Audit
    await client.query(
      `INSERT INTO audit_log (vergabe_id, user_id, aktion, details)
       VALUES ($1, $2, 'freigabe_abgelehnt', $3)`,
      [rows[0].vergabe_id, req.user.id, JSON.stringify({ stufe: rows[0].stufe, kommentar })]
    );

    await client.query('COMMIT');
    res.json({ status: 'abgelehnt' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ablehnung Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  } finally {
    client.release();
  }
});

// Freigabe-Regeln anzeigen (Admin)
router.get('/regeln', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM freigabe_regeln WHERE organisation_id = $1 ORDER BY prioritaet, stufe`,
      [req.user.organisation_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Regeln Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
