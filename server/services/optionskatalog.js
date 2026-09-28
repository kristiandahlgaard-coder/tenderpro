/**
 * TenderPro — Optionskatalog-Service
 *
 * Ermittelt für eine Vergabe (Leistungsart, Volumen, Bundesland, Merkmale)
 * die zulässigen Handlungsoptionen je Entscheidungspunkt – priorisiert nach
 * 1. Rechtssicherheit, 2. Wirtschaftlichkeit, 3. Aufwand.
 *
 * Datenquellen (einzige Quelle der Wahrheit):
 *   server/wissen/rechtsstand.json         — Schwellenwerte, Landes-Wertgrenzen
 *   server/wissen/optionskatalog-*.json    — Entscheidungspunkte und Optionen
 */
const fs = require('fs');
const path = require('path');

const WISSEN_DIR = path.join(__dirname, '..', 'wissen');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(WISSEN_DIR, name), 'utf8'));
}

const rechtsstand = loadJson('rechtsstand.json');
const kataloge = fs.readdirSync(WISSEN_DIR)
  .filter(f => f.startsWith('optionskatalog-') && f.endsWith('.json'))
  .map(loadJson);

const RANG_LABEL = { 1: 'Empfohlen', 2: 'Alternative', 3: 'Möglich mit Risiko' };

// Bundesland-Bezeichnung → Landes-Pack
function resolvePack(bundesland) {
  const key = (bundesland || '').toLowerCase().trim();
  if (key === 'berlin' || key === 'be') return 'berlin';
  if (key === 'bund') return 'bund';
  return 'standard';
}

function euSchwelle(leistungsart, merkmale, orgTyp) {
  const w = rechtsstand.eu_schwellenwerte.werte;
  if (leistungsart === 'Bauleistung') return w.bau;
  if (leistungsart === 'Konzession') return w.konzession;
  if (merkmale.soziale_dl) return orgTyp === 'sektoren' ? w.soziale_besondere_dl_sektoren : w.soziale_besondere_dl;
  if (orgTyp === 'sektoren') return w.liefer_dienst_sektoren;
  // Oberste Bundesbehörden haben für Liefer-/Dienstleistungen eine niedrigere EU-Schwelle
  // (Art. 4 RL 2014/24/EU; Delegierte VO (EU) 2025/2152) als sonstige öffentliche Auftraggeber.
  if (orgTyp === 'oberste_bundesbehoerde') return w.liefer_dienst_oberste_bundesbehoerden;
  return w.liefer_dienst;
}

/**
 * Prüft die "wenn"-Bedingung einer Option.
 * Unbekannte Wertgrenzen (null) machen eine Option unanwendbar.
 */
function matches(wenn = {}, ctx) {
  if (wenn.regime && !wenn.regime.includes(ctx.regime)) return false;
  if (wenn.leistungsart && !wenn.leistungsart.includes(ctx.leistungsart)) return false;
  if (wenn.flag && !wenn.flag.every(f => ctx.merkmale[f] === true)) return false;
  if (wenn.flag_any && !wenn.flag_any.some(f => ctx.merkmale[f] === true)) return false;
  if (wenn.nicht_flag && wenn.nicht_flag.some(f => ctx.merkmale[f] === true)) return false;

  const wg = ctx.wertgrenzen;
  if (wenn.volumen_max_wg) {
    // "EU_SCHWELLE" verweist statt auf eine feste Zahl auf den für diesen Auftrag geltenden
    // EU-Schwellenwert (z.B. Bund: Verhandlungsvergabe mit TNW bis § 106 GWB) – wichtig, weil
    // für oberste Bundesbehörden 140.000 € statt 216.000 € gelten (siehe euSchwelle()).
    const grenze = wg[wenn.volumen_max_wg] === 'EU_SCHWELLE' ? ctx.euSchwelle : wg[wenn.volumen_max_wg];
    if (grenze == null || ctx.volumen == null || ctx.volumen > grenze) return false;
  }
  if (wenn.volumen_min_wg) {
    const roh = wg[wenn.volumen_min_wg];
    const grenze = roh === 'EU_SCHWELLE' ? ctx.euSchwelle : roh;
    // Fehlt die Untergrenze (z.B. kein Direktauftrag definiert), gilt die Option ab 0 €.
    if (grenze != null && ctx.volumen != null && ctx.volumen <= grenze) return false;
  }
  if (wenn.volumen_min_eu) {
    const s = rechtsstand.eu_schwellenwerte.werte[wenn.volumen_min_eu];
    if (ctx.volumen == null || ctx.volumen < s) return false;
  }
  return true;
}

// Rang je nach Merkmalen anpassen ("flag": true → Rang; "flag_nein": explizit false → Rang)
function effektiverRang(option, merkmale) {
  let rang = option.rang;
  for (const [key, r] of Object.entries(option.rang_wenn || {})) {
    if (key.endsWith('_nein')) {
      if (merkmale[key.slice(0, -5)] === false) rang = r;
    } else if (merkmale[key] === true) {
      rang = r;
    }
  }
  return rang;
}

function formatWert(v) {
  return v == null ? null : `${Number(v).toLocaleString('de-DE')} €`;
}

/**
 * @param {object} input
 * @param {string} input.leistungsart
 * @param {number} input.volumen      netto EUR
 * @param {string} [input.bundesland]
 * @param {string} [input.orgTyp]     klassisch | sektoren | konzession | oberste_bundesbehoerde
 * @param {object} [input.merkmale]   { standardisiert: true|false, ... }
 */
function ermittleOptionen({ leistungsart, volumen, bundesland, orgTyp, merkmale = {} }) {
  const packKey = resolvePack(bundesland);
  const pack = rechtsstand.landes_packs[packKey];
  const vol = volumen == null || volumen === '' ? null : Number(volumen);
  const schwelle = euSchwelle(leistungsart, merkmale, orgTyp);
  const regime = vol != null && vol >= schwelle ? 'eu' : 'national';

  const katalog = kataloge.find(k => k.leistungsarten.includes(leistungsart));
  const hinweise = [];

  if (orgTyp === 'sektoren') {
    hinweise.push('Sektorenauftraggeber: Oberhalb der Schwelle gilt die SektVO mit freier Verfahrenswahl – der Katalog bildet derzeit die VgV ab.');
  }
  if (packKey === 'standard') hinweise.push(pack.hinweis);
  if (merkmale.soziale_dl && regime === 'national') {
    hinweise.push('Soziale und besondere Dienstleistungen unterhalb von 750.000 €: nationale Regeln; Sonderregelungen der UVgO für besondere Dienstleistungen prüfen.');
  }
  if (vol != null && regime === 'national' && vol >= schwelle * 0.85) {
    hinweise.push(`Schwellenwertnähe: ${Math.round(vol / schwelle * 100)} % des EU-Schwellenwerts. Auftragswert sorgfältig schätzen und dokumentieren (inkl. Optionen und Verlängerungen, § 3 VgV).`);
  }

  if (!katalog) {
    return {
      regime, schwelle, landesPack: { key: packKey, name: pack.name, stand: pack.stand, quelle: pack.quelle },
      katalogVerfuegbar: false,
      hinweise: [...hinweise, `Für „${leistungsart || 'unbekannt'}" ist der Optionskatalog in Vorbereitung.`],
      entscheidungspunkte: [], offeneFragen: [],
    };
  }

  const ctx = { regime, leistungsart, volumen: vol, merkmale, wertgrenzen: pack.wertgrenzen, euSchwelle: schwelle };

  const entscheidungspunkte = katalog.entscheidungspunkte.map(ep => {
    const optionen = ep.optionen
      .filter(o => matches(o.wenn, ctx))
      .map(o => {
        const rang = effektiverRang(o, merkmale);
        return {
          id: o.id, titel: o.titel, rang, rangLabel: RANG_LABEL[rang],
          kurz: o.kurz, voraussetzungen: o.voraussetzungen, pflichten: o.pflichten,
          risiken: o.risiken, rechtsgrundlage: o.rechtsgrundlage, sicherheitsgrad: o.sicherheitsgrad,
        };
      })
      .sort((a, b) => a.rang - b.rang);
    // Genau eine Empfehlung je Entscheidungspunkt: weitere Rang-1-Optionen werden Alternativen
    optionen.forEach((o, i) => {
      if (i > 0 && o.rang === 1) { o.rang = 2; o.rangLabel = RANG_LABEL[2]; }
    });
    return { id: ep.id, titel: ep.titel, frage: ep.frage, empfohlen: optionen[0]?.id || null, optionen };
  }).filter(ep => ep.optionen.length > 0);

  // Welche Merkmale würden das Ergebnis verändern und sind noch unbeantwortet?
  const relevanteFlags = new Set();
  for (const ep of katalog.entscheidungspunkte) {
    for (const o of ep.optionen) {
      const w = o.wenn || {};
      if (w.regime && !w.regime.includes(regime)) continue;
      [...(w.flag || []), ...(w.flag_any || []), ...(w.nicht_flag || [])].forEach(f => relevanteFlags.add(f));
      Object.keys(o.rang_wenn || {}).forEach(k => relevanteFlags.add(k.replace(/_nein$/, '')));
    }
  }
  const offeneFragen = Object.keys(katalog.fragen)
    .filter(f => relevanteFlags.has(f) && merkmale[f] === undefined)
    .map(f => ({ key: f, frage: katalog.fragen[f] }));

  const verfahren = entscheidungspunkte.find(ep => ep.id === 'EP-01');
  const empfohlen = verfahren?.optionen[0];

  return {
    katalog: katalog.katalog,
    stand: katalog.stand,
    rechtsstand: katalog.rechtsstand,
    regime: empfohlen?.id?.startsWith('EP-01-DA') ? 'direkt' : regime,
    schwelle,
    landesPack: {
      key: packKey, name: pack.name, stand: pack.stand, quelle: pack.quelle,
      sicherheitsgrad: pack.sicherheitsgrad,
      wertgrenzen: Object.fromEntries(Object.entries(pack.wertgrenzen).map(([k, v]) => [
        k,
        typeof v === 'number' ? formatWert(v) : v === 'EU_SCHWELLE' ? `${formatWert(schwelle)} (EU-Schwellenwert)` : v,
      ])),
    },
    katalogVerfuegbar: true,
    empfohlenesVerfahren: empfohlen ? { id: empfohlen.id, titel: empfohlen.titel, kurz: empfohlen.kurz } : null,
    hinweise,
    entscheidungspunkte,
    offeneFragen,
  };
}

/** Kompakte Textfassung für den KI-Assistenten (spart Tokens). */
function alsKiKontext(ergebnis) {
  if (!ergebnis?.katalogVerfuegbar) return '';
  const zeilen = [
    `[OPTIONSKATALOG – Stand ${ergebnis.stand}, Landesregeln: ${ergebnis.landesPack.name} (Stand ${ergebnis.landesPack.stand})]`,
    `Regime: ${ergebnis.regime.toUpperCase()} · EU-Schwelle: ${formatWert(ergebnis.schwelle)}`,
  ];
  for (const ep of ergebnis.entscheidungspunkte) {
    zeilen.push(`${ep.id} ${ep.titel}:`);
    for (const o of ep.optionen) {
      zeilen.push(`  - [${o.rangLabel}] ${o.titel} — ${o.kurz} (${o.rechtsgrundlage}; Sicherheit: ${o.sicherheitsgrad})`);
    }
  }
  if (ergebnis.hinweise.length) zeilen.push(`Hinweise: ${ergebnis.hinweise.join(' | ')}`);
  if (ergebnis.offeneFragen.length) zeilen.push(`Noch offene Klärungsfragen: ${ergebnis.offeneFragen.map(f => f.frage).join(' | ')}`);
  return zeilen.join('\n');
}

function schwellenwertUebersicht() {
  const w = rechtsstand.eu_schwellenwerte.werte;
  return [
    `EU-Schwellenwerte (gültig ${rechtsstand.eu_schwellenwerte.gueltig_ab} bis ${rechtsstand.eu_schwellenwerte.gueltig_bis}, netto):`,
    `- Liefer- und Dienstleistungen: ${formatWert(w.liefer_dienst)} (oberste Bundesbehörden: ${formatWert(w.liefer_dienst_oberste_bundesbehoerden)})`,
    `- Bauleistungen und Konzessionen: ${formatWert(w.bau)}`,
    `- Sektoren Liefer-/Dienstleistungen: ${formatWert(w.liefer_dienst_sektoren)}`,
    `- Soziale und andere besondere Dienstleistungen: ${formatWert(w.soziale_besondere_dl)}`,
  ].join('\n');
}

module.exports = { ermittleOptionen, alsKiKontext, schwellenwertUebersicht, rechtsstand, kataloge };
