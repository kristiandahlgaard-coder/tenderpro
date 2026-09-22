/**
 * TenderPro — Database Migration
 * Führt schema.sql gegen die Neon-Datenbank aus.
 * Usage: node server/sql/migrate.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔄 Verbinde mit Datenbank...');
    const client = await pool.connect();

    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📦 Führe Migration aus...');
    await client.query(sql);

    console.log('✅ Migration erfolgreich!');

    // Tabellen zählen
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log(`📊 ${result.rows.length} Tabellen erstellt:`);
    result.rows.forEach(r => console.log(`   - ${r.table_name}`));

    client.release();
  } catch (err) {
    console.error('❌ Migration fehlgeschlagen:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
