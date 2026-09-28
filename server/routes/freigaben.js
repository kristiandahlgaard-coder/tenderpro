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

// Ein Kettenglied darf nur entschieden werden, wenn
// - es dem angemeldeten Nutzer zugewiesen und noch offen ist,
// - die Vergabe zur eigenen Organisation gehört und eingereicht ist (in_freigabe),
// - der Nutzer nicht der Ersteller ist (Vier-Augen-Prinzip),
// - bei linearer Reihenfolge alle niedrigeren Stufen genehmigt sind.
const ENTSCHEIDBAR = `
  fk.id = $2 AND fk.freigeber_id = $3 AND fk.status = 'ausstehend'
  AND v.id = fk.vergabe_id AND v.organisation_id = $4 AND v.status = 'in_freigabe'
  AND v.ersteller_id <> $3
  AND NOT EXISTS (
    SELECT 1 FROM freigabenkette vor
    WHERE vor.vergabe_id = fk.vergabe_id AND vor.stufe < fk.stufe AND vor.status <> 'genehmigt'
  )`;

// Vergabezeile sperren, damit parallele Entscheidungen (z.B. zwei Freigeber derselben Stufe,
// Genehmigung und Ablehnung gleichzeitig) nacheinander und auf aktuellem Stand ablaufen.
async function sperreVergabe(client, freigabeId, organisationId) {
  await client.query(
    `SELECT v.id FROM vergaben v
     WHERE v.id = (SELECT vergabe_id FROM freigabenkette WHERE id = $1)
       AND v.organisation_id = $2
     FOR UPDATE`,
    [freigabeId, organisationId]
  );
}

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
        AND v.status = 'in_freigabe' AND v.organisation_id = $2
        AND v.ersteller_id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM freigabenkette vor
          WHERE vor.vergabe_id = fk.vergabe_id AND vor.stufe < fk.stufe AND vor.status <> 'genehmigt'
        )
      ORDER BY v.updated_at DESC
    `, [req.user.id, req.user.organisation_id]);

    res.json(rows);
  } catch (err) {
    console.error('Freigaben-Liste Fehler:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Genehmigen
router.post('/:id/approve', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await sperreVergabe(client, req.params.id, req.user.organisation_id);

    const { kommentar } = req.body;

    // Prüfen ob dieser User diese Freigabe jetzt erteilen darf
    const { rows } = await client.query(
      `UPDATE freigabenkette fk
       SET status = 'genehmigt', kommentar = $1, entschieden_at = NOW()
       FROM vergaben v
       WHERE ${ENTSCHEIDBAR}
       RETURNING fk.*`,
      [kommentar || null, req.params.id, req.user.id, req.user.organisation_id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Freigabe nicht möglich (nicht zugewiesen, Vergabe nicht eingereicht oder vorherige Stufe offen)' });
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
        `UPDATE vergaben SET status = 'genehmigt', genehmigt_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'in_freigabe'`,
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
    console.error('Genehmigung Fehler:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  } finally {
    client.release();
  }
});

// Ablehnen
router.post('/:id/reject', requireAuth, async (req, res) => {
  const { kommentar } = req.body;
  if (!kommentar) {
    return res.status(400).json({ error: 'Ablehnungsgrund ist Pflichtfeld' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await sperreVergabe(client, req.params.id, req.user.organisation_id);

    const { rows } = await client.query(
      `UPDATE freigabenkette fk
       SET status = 'abgelehnt', kommentar = $1, entschieden_at = NOW()
       FROM vergaben v
       WHERE ${ENTSCHEIDBAR}
       RETURNING fk.*`,
      [kommentar, req.params.id, req.user.id, req.user.organisation_id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ablehnung nicht möglich' });
    }

    // Vergabe als abgelehnt markieren
    await client.query(
      `UPDATE vergaben SET status = 'abgelehnt', ablehnungsgrund = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'in_freigabe'`,
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
    console.error('Ablehnung Fehler:', err.message);
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
    console.error('Regeln Fehler:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
