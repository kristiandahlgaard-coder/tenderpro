/**
 * TenderPro — Vergaben Routes
 * GET    /api/vergaben          — Liste (gefiltert nach Rolle/Org)
 * GET    /api/vergaben/:id      — Detail mit Freigabenkette
 * POST   /api/vergaben          — Neu erstellen (aus Advisor)
 * PUT    /api/vergaben/:id      — Bearbeiten (nur Entwurf)
 * POST   /api/vergaben/:id/submit   — Zur Freigabe einreichen
 * DELETE /api/vergaben/:id      — Löschen (nur Entwurf)
 */
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── Freigabenkette berechnen ────────────────────
async function berechneFreigabenkette(client, vergabe, organisationId) {
  const { rows: regeln } = await client.query(
    `SELECT * FROM freigabe_regeln
     WHERE organisation_id = $1 AND aktiv = true
     ORDER BY prioritaet, stufe`,
    [organisationId]
  );

  const matchingRoles = new Map();

  for (const regel of regeln) {
    // Bedingungen prüfen
    if (regel.bedingung_volumen_min !== null && vergabe.volumen_netto < regel.bedingung_volumen_min) continue;
    if (regel.bedingung_volumen_max !== null && vergabe.volumen_netto > regel.bedingung_volumen_max) continue;
    if (regel.bedingung_leistungsart && vergabe.leistungsart !== regel.bedingung_leistungsart) continue;
    if (regel.bedingung_struktur && vergabe.struktur !== regel.bedingung_struktur) continue;
    if (regel.bedingung_schwellenwert && vergabe.schwellenwert_regime !== regel.bedingung_schwellenwert) continue;

    const key = `${regel.stufe}-${regel.erforderliche_rolle}`;
    if (!matchingRoles.has(key)) {
      matchingRoles.set(key, {
        stufe: regel.stufe,
        rolle: regel.erforderliche_rolle,
        reihenfolge: regel.reihenfolge,
      });
    }
  }

  // Sortiert nach Stufe einfügen
  const kette = Array.from(matchingRoles.values()).sort((a, b) => a.stufe - b.stufe);

  for (const glied of kette) {
    // Passenden User für diese Rolle finden
    const { rows: freigeber } = await client.query(
      `SELECT id FROM users WHERE organisation_id = $1 AND rolle = $2 AND aktiv = true LIMIT 1`,
      [organisationId, glied.rolle]
    );

    await client.query(
      `INSERT INTO freigabenkette (vergabe_id, stufe, rolle, reihenfolge, freigeber_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [vergabe.id, glied.stufe, glied.rolle, glied.reihenfolge, freigeber[0]?.id || null]
    );
  }

  return kette;
}

// ─── Schwellenwert-Logik ─────────────────────────
function berechneSchwellenwert(volumen, leistungsart) {
  const schwellen = {
    'Bauleistung': 5538000,
    'Lieferleistung': 221000,
    'Dienstleistung': 221000,
    'Freiberufliche Leistung': 221000,
    'Konzession': 5538000,
  };
  const schwelle = schwellen[leistungsart] || 221000;

  if (volumen <= 15000) return { regime: 'direkt', verfahrensart: 'Direktvergabe', rechtsgrundlage: 'UVgO § 14' };
  if (volumen < schwelle) return { regime: 'national', verfahrensart: 'Öffentliche Ausschreibung', rechtsgrundlage: 'UVgO / VOB/A' };
  return { regime: 'eu', verfahrensart: 'Offenes Verfahren', rechtsgrundlage: 'VgV' };
}

// ─── CRUD ────────────────────────────────────────

// Liste
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, leistungsart, search, limit = 50, offset = 0 } = req.query;

    let where = ['v.organisation_id = $1'];
    let params = [req.user.organisation_id];
    let idx = 2;

    if (status) {
      where.push(`v.status = $${idx++}`);
      params.push(status);
    }
    if (leistungsart) {
      where.push(`v.leistungsart = $${idx++}`);
      params.push(leistungsart);
    }
    if (search) {
      where.push(`(v.leistungsbeschreibung ILIKE $${idx} OR v.vergabenummer ILIKE $${idx} OR v.projektbezeichnung ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const { rows } = await db.query(`
      SELECT v.*,
             u.vorname || ' ' || u.nachname as ersteller_name,
             (SELECT COUNT(*) FROM freigabenkette fk WHERE fk.vergabe_id = v.id AND fk.status = 'ausstehend') as offene_freigaben
      FROM vergaben v
      LEFT JOIN users u ON v.ersteller_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY v.updated_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), parseInt(offset)]);

    const countResult = await db.query(
      `SELECT COUNT(*) FROM vergaben v WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({
      vergaben: rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error('Vergaben-Liste Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.*,
             u.vorname || ' ' || u.nachname as ersteller_name,
             u.email as ersteller_email
      FROM vergaben v
      LEFT JOIN users u ON v.ersteller_id = u.id
      WHERE v.id = $1 AND v.organisation_id = $2
    `, [req.params.id, req.user.organisation_id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vergabe nicht gefunden' });
    }

    // Freigabenkette laden
    const { rows: kette } = await db.query(`
      SELECT fk.*,
             u.vorname || ' ' || u.nachname as freigeber_name,
             u.rolle as freigeber_rolle
      FROM freigabenkette fk
      LEFT JOIN users u ON fk.freigeber_id = u.id
      WHERE fk.vergabe_id = $1
      ORDER BY fk.stufe
    `, [req.params.id]);

    // Fristen laden
    const { rows: fristen } = await db.query(
      'SELECT * FROM vergabe_fristen WHERE vergabe_id = $1 ORDER BY frist_datum',
      [req.params.id]
    );

    // Formulare laden
    const { rows: formulare } = await db.query(`
      SELECT vf.*, fv.kategorie, fv.phase
      FROM vergabe_formulare vf
      LEFT JOIN formular_vorlagen fv ON vf.vorlage_id = fv.id
      WHERE vf.vergabe_id = $1
      ORDER BY fv.phase, fv.kategorie
    `, [req.params.id]);

    res.json({
      ...rows[0],
      freigabenkette: kette,
      fristen,
      formulare,
    });
  } catch (err) {
    console.error('Vergabe-Detail Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Erstellen (aus Advisor)
router.post('/', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      auftraggeber_typ, leistungsbeschreibung, leistungsart, leistungsart_confidence,
      volumen_netto, struktur, laufzeit_monate, verlaengerung_optionen,
      erfuellungszeitraum_start, erfuellungszeitraum_ende,
      besonderheiten, anfordernde_stelle, ansprechpartner_name,
      ansprechpartner_email, ansprechpartner_telefon, begruendung,
      risikobewertung, zusaetzliche_notizen, geplanter_start, projektbezeichnung,
    } = req.body;

    if (!leistungsbeschreibung || !leistungsart) {
      return res.status(400).json({ error: 'Leistungsbeschreibung und Leistungsart sind Pflichtfelder' });
    }

    // Schwellenwert berechnen
    const schwelle = volumen_netto ? berechneSchwellenwert(parseFloat(volumen_netto), leistungsart) : {};

    const { rows } = await client.query(`
      INSERT INTO vergaben (
        organisation_id, ersteller_id, auftraggeber_typ,
        leistungsbeschreibung, leistungsart, leistungsart_confidence,
        volumen_netto, schwellenwert_regime, verfahrensart, rechtsgrundlage,
        struktur, laufzeit_monate, verlaengerung_optionen,
        erfuellungszeitraum_start, erfuellungszeitraum_ende,
        besonderheiten, anfordernde_stelle, ansprechpartner_name,
        ansprechpartner_email, ansprechpartner_telefon, begruendung,
        risikobewertung, zusaetzliche_notizen, geplanter_start, projektbezeichnung
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25
      ) RETURNING *
    `, [
      req.user.organisation_id, req.user.id, auftraggeber_typ || 'klassisch',
      leistungsbeschreibung, leistungsart, leistungsart_confidence || 0,
      volumen_netto || null, schwelle.regime || null, schwelle.verfahrensart || null, schwelle.rechtsgrundlage || null,
      struktur || 'einzelvergabe', laufzeit_monate || null, verlaengerung_optionen || null,
      erfuellungszeitraum_start || null, erfuellungszeitraum_ende || null,
      JSON.stringify(besonderheiten || []), anfordernde_stelle || null, ansprechpartner_name || null,
      ansprechpartner_email || null, ansprechpartner_telefon || null, begruendung || null,
      risikobewertung || 'gering', zusaetzliche_notizen || null, geplanter_start || null,
      projektbezeichnung || null,
    ]);

    const vergabe = rows[0];

    // Freigabenkette berechnen
    if (req.user.organisation_id) {
      await berechneFreigabenkette(client, vergabe, req.user.organisation_id);
    }

    // Passende Formulare zuweisen
    const { rows: vorlagen } = await client.query(`
      SELECT * FROM formular_vorlagen
      WHERE aktiv = true
        AND pflicht = true
        AND (schwellenwert_regime IS NULL OR schwellenwert_regime = $1)
        AND (leistungsart IS NULL OR leistungsart = $2)
      ORDER BY sortierung
    `, [schwelle.regime, leistungsart]);

    for (const vorlage of vorlagen) {
      await client.query(
        `INSERT INTO vergabe_formulare (vergabe_id, vorlage_id, name) VALUES ($1, $2, $3)`,
        [vergabe.id, vorlage.id, vorlage.name]
      );
    }

    // Audit-Log
    await client.query(
      `INSERT INTO audit_log (vergabe_id, user_id, aktion, details)
       VALUES ($1, $2, 'vergabe_erstellt', $3)`,
      [vergabe.id, req.user.id, JSON.stringify({ vergabenummer: vergabe.vergabenummer })]
    );

    await client.query('COMMIT');
    res.status(201).json(vergabe);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Vergabe erstellen Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  } finally {
    client.release();
  }
});

// Bearbeiten
router.put('/:id', requireAuth, async (req, res) => {
  try {
    // Nur Entwürfe bearbeiten
    const check = await db.query(
      'SELECT status FROM vergaben WHERE id = $1 AND organisation_id = $2',
      [req.params.id, req.user.organisation_id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
    if (check.rows[0].status !== 'entwurf') {
      return res.status(400).json({ error: 'Nur Entwürfe können bearbeitet werden' });
    }

    const fields = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;

    const allowed = [
      'auftraggeber_typ', 'leistungsbeschreibung', 'leistungsart', 'volumen_netto',
      'struktur', 'laufzeit_monate', 'besonderheiten', 'anfordernde_stelle',
      'ansprechpartner_name', 'begruendung', 'risikobewertung', 'zusaetzliche_notizen',
      'geplanter_start', 'projektbezeichnung',
    ];

    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx++}`);
        vals.push(key === 'besonderheiten' ? JSON.stringify(fields[key]) : fields[key]);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Keine Änderungen' });

    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE vergaben SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      vals
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('Vergabe bearbeiten Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Zur Freigabe einreichen
router.post('/:id/submit', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE vergaben SET status = 'in_freigabe', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organisation_id = $2 AND status = 'entwurf'
       RETURNING *`,
      [req.params.id, req.user.organisation_id]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Vergabe nicht gefunden oder nicht im Entwurf-Status' });
    }

    await client.query(
      `INSERT INTO audit_log (vergabe_id, user_id, aktion, details)
       VALUES ($1, $2, 'zur_freigabe_eingereicht', '{}')`,
      [req.params.id, req.user.id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  } finally {
    client.release();
  }
});

// Löschen
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM vergaben WHERE id = $1 AND organisation_id = $2 AND status = 'entwurf' RETURNING id`,
      [req.params.id, req.user.organisation_id]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nur Entwürfe können gelöscht werden' });
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Löschen Fehler:', err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = router;
