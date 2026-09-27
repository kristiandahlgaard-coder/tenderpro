/**
 * TenderPro — Seed Data
 * Erstellt Grunddaten (Muster-Organisation, Freigabe-Regeln, Formularvorlagen) und Testzugänge.
 * Usage: node server/sql/seed.js
 *
 * Sicherheit im Produktivbetrieb (NODE_ENV=production):
 * - Testzugänge erhalten nie das öffentlich bekannte Entwicklungspasswort.
 * - Ist TESTZUGANG_PASSWORT (mind. 12 Zeichen) gesetzt, bekommen sie dieses Passwort,
 *   sonst werden sie deaktiviert.
 * - Bereits bestehende Testzugänge mit dem Entwicklungspasswort werden bei jedem Start
 *   entsprechend umgestellt.
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const IST_PRODUKTION = process.env.NODE_ENV === 'production';
const ENTWICKLUNGS_PASSWORT = 'test123';

const TESTZUGAENGE = [
  ['admin@tenderpro.de', 'Admin', 'User', 'admin', 'IT'],
  ['vergabe@tenderpro.de', 'Marie', 'Schmidt', 'vergabestelle', 'Vergabestelle'],
  ['finanzen@tenderpro.de', 'Thomas', 'Müller', 'finanzen', 'Finanzen'],
  ['recht@tenderpro.de', 'Sarah', 'Weber', 'recht', 'Rechtsabteilung'],
  ['leitung@tenderpro.de', 'Klaus', 'Fischer', 'bereichsleitung', 'Bereichsleitung'],
  ['gf@tenderpro.de', 'Eva', 'Hoffmann', 'geschaeftsfuehrung', 'Geschäftsführung'],
  ['antrag@tenderpro.de', 'Jan', 'Becker', 'beantragend', 'Facility Management'],
];

function produktivPasswort() {
  const pw = process.env.TESTZUGANG_PASSWORT;
  if (!pw) return null;
  if (pw.length < 12) {
    console.warn('⚠️  TESTZUGANG_PASSWORT ist kürzer als 12 Zeichen und wird ignoriert.');
    return null;
  }
  return pw;
}

// Bestehende Testzugänge mit dem Entwicklungspasswort im Produktivbetrieb absichern
async function sichereTestzugaenge(client) {
  const neuesPasswort = produktivPasswort();
  const neuerHash = neuesPasswort ? await bcrypt.hash(neuesPasswort, 10) : null;
  let umgestellt = 0;
  let gesperrt = 0;

  for (const [email] of TESTZUGAENGE) {
    const { rows } = await client.query('SELECT id, password_hash, aktiv FROM users WHERE email = $1', [email]);
    if (rows.length === 0) continue;
    const nutztEntwicklungsPasswort = await bcrypt.compare(ENTWICKLUNGS_PASSWORT, rows[0].password_hash);
    if (!nutztEntwicklungsPasswort) continue;

    if (neuerHash) {
      // Auch zuvor mangels Passwort gesperrte Testzugänge wieder freigeben
      await client.query('UPDATE users SET password_hash = $1, aktiv = true WHERE id = $2', [neuerHash, rows[0].id]);
      umgestellt++;
    } else if (rows[0].aktiv) {
      await client.query('UPDATE users SET aktiv = false WHERE id = $1', [rows[0].id]);
      gesperrt++;
    }
  }
  if (umgestellt) console.log(`🔒 ${umgestellt} Testzugänge auf TESTZUGANG_PASSWORT umgestellt.`);
  if (gesperrt) console.log(`🔒 ${gesperrt} Testzugänge deaktiviert (TESTZUGANG_PASSWORT nicht gesetzt).`);
}

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();

    if (IST_PRODUKTION) {
      await sichereTestzugaenge(client);
    }

    // Nur einmal ausführen: existieren bereits Benutzer, gibt es nichts zu tun.
    // (organisationen hat keinen Unique-Key, ON CONFLICT greift dort nicht.)
    const vorhanden = await client.query('SELECT 1 FROM users LIMIT 1');
    if (vorhanden.rows.length > 0) {
      console.log('ℹ️  Grunddaten existieren bereits.');
      client.release();
      return;
    }
    console.log('🌱 Erstelle Grunddaten...');

    // 1. Organisation
    const orgResult = await client.query(`
      INSERT INTO organisationen (name, typ, ort, bundesland)
      VALUES ('Muster-Vergabestelle', 'klassisch', 'Berlin', 'Berlin')
      RETURNING id
    `);
    const orgId = orgResult.rows[0].id;

    // 2. Benutzer (Testzugänge)
    const passwort = IST_PRODUKTION ? produktivPasswort() : ENTWICKLUNGS_PASSWORT;
    const aktiv = !!passwort;
    // Ohne Passwort (Produktivbetrieb ohne TESTZUGANG_PASSWORT) werden die Konten deaktiviert angelegt.
    const hash = await bcrypt.hash(passwort || require('crypto').randomBytes(32).toString('hex'), 10);
    const users = TESTZUGAENGE;

    for (const [email, vorname, nachname, rolle, abt] of users) {
      await client.query(`
        INSERT INTO users (organisation_id, email, password_hash, vorname, nachname, rolle, abteilung, aktiv)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [orgId, email, hash, vorname, nachname, rolle, abt, aktiv]);
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

    console.log('✅ Grunddaten erstellt:');
    console.log(`   - 1 Organisation`);
    console.log(`   - ${users.length} Testzugänge (${aktiv ? 'aktiv' : 'deaktiviert'})`);
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
