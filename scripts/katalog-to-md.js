#!/usr/bin/env node
/**
 * Erzeugt aus den Optionskatalog-JSON-Dateien eine lesbare Markdown-Fassung
 * (für Projekt-Dokumentation und Obsidian).
 *
 * Usage: node scripts/katalog-to-md.js [ausgabeordner]
 */
const fs = require('fs');
const path = require('path');

const WISSEN = path.join(__dirname, '..', 'server', 'wissen');
const out = process.argv[2] || path.join(__dirname, '..', 'docs');
fs.mkdirSync(out, { recursive: true });

const rechtsstand = JSON.parse(fs.readFileSync(path.join(WISSEN, 'rechtsstand.json'), 'utf8'));
const grad = { gruen: '🟢', gelb: '🟡', rot: '🔴' };
const eur = v => (v == null ? '–' : `${Number(v).toLocaleString('de-DE')} €`);

for (const file of fs.readdirSync(WISSEN).filter(f => f.startsWith('optionskatalog-') && f.endsWith('.json'))) {
  const k = JSON.parse(fs.readFileSync(path.join(WISSEN, file), 'utf8'));
  const L = [];
  L.push(`# ${k.titel}`, '');
  L.push(`**Stand:** ${k.stand} · **Rechtsstand:** ${k.rechtsstand}`, '');
  L.push(`**Priorisierung:** ${k.priorisierung}. Ränge: ⭐ Empfohlen · Alternative · ⚠️ Möglich mit Risiko. Je Entscheidungspunkt zeigt die Plattform genau eine Empfehlung; weitere gleichrangige Optionen erscheinen als Alternative.`, '');
  L.push(`**Sicherheitsgrade:** 🟢 ${k.sicherheitsgrade.gruen} · 🟡 ${k.sicherheitsgrade.gelb} · 🔴 ${k.sicherheitsgrade.rot}`, '');

  const w = rechtsstand.eu_schwellenwerte.werte;
  L.push('## Schwellen und Wertgrenzen', '');
  L.push(`EU-Schwellenwerte ${rechtsstand.eu_schwellenwerte.gueltig_ab} bis ${rechtsstand.eu_schwellenwerte.gueltig_bis}: Liefer-/Dienstleistungen ${eur(w.liefer_dienst)} (oberste Bundesbehörden ${eur(w.liefer_dienst_oberste_bundesbehoerden)}), Sektoren ${eur(w.liefer_dienst_sektoren)}, soziale/besondere Dienstleistungen ${eur(w.soziale_besondere_dl)}.`, '');
  L.push('| Wertgrenze (netto) | Berlin | Bund | ohne Landesregel |', '|---|---|---|---|');
  const labels = {
    direktauftrag_ld: 'Direktauftrag L/DL',
    direktauftrag_digital_innovation: 'Direktauftrag Digitalisierung/Innovation',
    direktauftrag_freiberuflich: 'Direktauftrag freiberuflich',
    vv_ohne_tnw_ld: 'Verhandlungsvergabe ohne TNW',
    vv_mit_tnw_ld: 'Verhandlungsvergabe mit TNW',
    ba_ohne_tnw_ld: 'Beschränkte Ausschreibung ohne TNW',
    evergabe_direktauftrag_ab: 'eVergabe-Pflicht auch für Direktaufträge ab',
  };
  const p = rechtsstand.landes_packs;
  for (const [key, label] of Object.entries(labels)) {
    L.push(`| ${label} | ${eur(p.berlin.wertgrenzen[key])} | ${eur(p.bund.wertgrenzen[key])} | ${eur(p.standard.wertgrenzen[key])} |`);
  }
  L.push('', `Quellen: Berlin – ${p.berlin.quelle} ${grad[p.berlin.sicherheitsgrad]}; Bund – ${p.bund.quelle} ${grad[p.bund.sicherheitsgrad]}.`, '');

  L.push('## Klärungsfragen, die die Empfehlung verändern', '');
  for (const [key, frage] of Object.entries(k.fragen)) L.push(`- **${key}:** ${frage}`);
  L.push('');

  for (const ep of k.entscheidungspunkte) {
    L.push(`## ${ep.id} ${ep.titel}`, '', `*${ep.frage}*`, '');
    for (const o of ep.optionen) {
      const rang = o.rang === 1 ? '⭐ Empfohlen' : o.rang === 2 ? 'Alternative' : '⚠️ Möglich mit Risiko';
      const abw = Object.entries(o.rang_wenn || {}).map(([f, r]) => `${f.replace(/_nein$/, ' = nein')} → Rang ${r}`).join('; ');
      L.push(`### ${o.titel}`);
      L.push(`**${rang}**${abw ? ` (abweichend: ${abw})` : ''} · ${grad[o.sicherheitsgrad] || ''}`, '');
      L.push(o.kurz, '');
      if (o.voraussetzungen?.length) L.push(`- **Voraussetzungen:** ${o.voraussetzungen.join('; ')}`);
      if (o.pflichten?.length) L.push(`- **Was dann zu tun ist:** ${o.pflichten.join('; ')}`);
      if (o.risiken?.length) L.push(`- **Risiken:** ${o.risiken.join('; ')}`);
      L.push(`- **Rechtsgrundlage:** ${o.rechtsgrundlage}`, '');
    }
  }

  const name = file.replace('.json', '.md');
  fs.writeFileSync(path.join(out, name), L.join('\n'));
  console.log(`✓ ${path.join(out, name)}`);
}
