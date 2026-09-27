/**
 * TenderPro — Seed Data
 * Erstellt Testdaten für Entwicklung.
 * Usage: node server/sql/seed.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('🌱 Erstelle Testdaten...');

    // Nur einmal ausführen: existieren bereits Benutzer, gibt es nichts zu tun.
    // (organisationen hat keinen Unique-Key, ON CONFLICT greift dort nicht.)
    const vorhanden = await client.query('SELECT 1 FROM users LIMIT 1');
    if (vorhanden.rows.length > 0) {
      console.log('ℹ️  Testdaten existieren bereits.');
      client.release();
      return;
    }

    // 1. Organisation
    const orgResult = await client.query(`
      INSERT INTO organisationen (name, typ, ort, bundesland)
      VALUES ('Muster-Vergabestelle', 'klassisch', 'Berlin', 'Berlin')
      RETURNING id
    `);
    const orgId = orgResult.rows[0].id;

    // 2. Benutzer
    const hash = await bcrypt.hash('test123', 10);
    const users = [
      ['admin@tenderpro.de', 'Admin', 'User', 'admin', 'IT'],
      ['vergabe@tenderpro.de', 'Marie', 'Schmidt', 'vergabestelle', 'Vergabestelle'],
      ['finanzen@tenderpro.de', 'Thomas', 'Müller', 'finanzen', 'Finanzen'],
      ['recht@tenderpro.de', 'Sarah', 'Weber', 'recht', 'Rechtsabteilung'],
      ['leitung@tenderpro.de', 'Klaus', 'Fischer', 'bereichsleitung', 'Bereichsleitung'],
      ['gf@tenderpro.de', 'Eva', 'Hoffmann', 'geschaeftsfuehrung', 'Geschäftsführung'],
      ['antrag@tenderpro.de', 'Jan', 'Becker', 'beantragend', 'Facility Management'],
    ];

    for (const [email, vorname, nachname, rolle, abt] of users) {
      await client.query(`
        INSERT INTO users (organisation_id, email, password_hash, vorname, nachname, rolle, abteilung)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [orgId, email, hash, vorname, nachname, rolle, abt]);
    }

    // 3. Freigabe-Regeln
    const regeln = [
      ['Kleine Vergabe (≤ €20k)', 0, 20000, 'vergabestelle', 1, 'linear'],
      ['Kleine Vergabe (≤ €20k)', 0, 20000, 'finanzen', 2, 'linear'],
      ['Mittlere Vergabe (€20k–€100k)', 20000, 100000, 'vergabestelle', 1, 'linear'],
      ['Mittlere Vergabe (€20k–€100k)', 20000, 100000, 'finanzen', 2, 'linear'],
      ['Mittlere Vergabe (€20k–€100k)', 20000, 100000, 'bereichsleitung', 3, 'linear'],
      ['Große Vergabe (> €100k)', 100000, null, 'vergabestelle', 1, 'linear'],
      ['Große Vergabe (> €100k)', 100000, null, 'finanzen', 2, 'linear'],
      ['Große Vergabe (> €100k)', 100000, null, 'recht', 3, 'linear'],
      ['Große Vergabe (> €100k)', 100000, null, 'bereichsleitung', 4, 'parallel'],
      ['Große Vergabe (> €100k)', 100000, null, 'geschaeftsfuehrung', 4, 'parallel'],
    ];

    for (const [name, min, max, rolle, stufe, reihenfolge] of regeln) {
      await client.query(`
        INSERT INTO freigabe_regeln
          (organisation_id, name, bedingung_volumen_min, bedingung_volumen_max, erforderliche_rolle, stufe, reihenfolge)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [orgId, name, min, max, rolle, stufe, reihenfolge]);
    }

    // 4. Formularvorlagen
    const formulare = [
      ['Bekanntmachung (national)', 'Bekanntmachung', 'bekanntmachung', true, 'national', null],
      ['EU-Bekanntmachung (TED)', 'Bekanntmachung', 'bekanntmachung', true, 'eu', null],
      ['Bewerbungsbedingungen', 'Bewerbung', 'vorbereitung', true, null, null],
      ['Leistungsverzeichnis', 'Leistung', 'vorbereitung', true, null, null],
      ['Vertragsentwurf', 'Vertrag', 'vorbereitung', false, null, null],
      ['Eignungskriterien', 'Eignung', 'vorbereitung', true, 'eu', null],
      ['Zuschlagskriterien / Wertungsmatrix', 'Wertung', 'wertung', true, null, null],
      ['Vergabevermerk', 'Dokumentation', 'zuschlag', true, null, null],
      ['Vorabinformation § 134 GWB', 'Zuschlag', 'zuschlag', true, 'eu', null],
      ['Absageschreiben', 'Zuschlag', 'zuschlag', true, null, null],
      ['Auftragsbekanntmachung', 'Bekanntmachung', 'zuschlag', false, 'eu', null],
      ['Nachforderungsschreiben', 'Kommunikation', 'wertung', false, null, null],
      ['Aufklärungsschreiben', 'Kommunikation', 'wertung', false, null, null],
      ['Angebotseröffnungsprotokoll', 'Öffnung', 'oeffnung', true, null, null],
    ];

    for (const [name, kat, phase, pflicht, regime, la] of formulare) {
      await client.query(`
        INSERT INTO formular_vorlagen (name, kategorie, phase, pflicht, schwellenwert_regime, leistungsart)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [name, kat, phase, pflicht, regime, la]);
    }

    console.log('✅ Testdaten erstellt:');
    console.log(`   - 1 Organisation`);
    console.log(`   - ${users.length} Benutzer (Passwort: test123)`);
    console.log(`   - ${regeln.length} Freigabe-Regeln`);
    console.log(`   - ${formulare.length} Formularvorlagen`);

    client.release();
  } catch (err) {
    console.error('❌ Seed fehlgeschlagen:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
