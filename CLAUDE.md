# TenderPro — Hinweise für Claude Code

Vergabeplattform für öffentliche Auftraggeber (Node/Express + Vue 3, PostgreSQL auf Neon, Deployment über Railway bei Push auf `main`).

## Arbeitsweise
- Sprache in Code-Kommentaren, UI und Commits: Deutsch.
- Größere Änderungen zuerst kurz abstimmen; kleinere Änderungen direkt umsetzen, dann erklären.
- Stabil vor schnell: schrittweise erweitern, nach jeder Änderung `cd client && npx vite build` ausführen.
- Die Plattform ist allgemein gehalten: keine Bezüge zu einzelnen Auftraggebern im Code oder in Seed-Daten.

## Rechtswissen – einzige Quelle der Wahrheit
- `server/wissen/rechtsstand.json`: EU-Schwellenwerte und Landes-Wertgrenzen (Packs `berlin`, `bund`, `standard`).
- `server/wissen/optionskatalog-*.json`: Entscheidungspunkte mit priorisierten Optionen (Rang 1 Empfohlen, 2 Alternative, 3 Möglich mit Risiko).
- `server/wissen/karten/*.md`: Klartext-Wissenskarten, die der KI-Assistent (`server/routes/ai.js`) in den Systemprompt lädt.
- **Niemals Schwellenwerte oder Wertgrenzen im Code hart kodieren** – immer über `server/services/optionskatalog.js`.
- Nach Änderungen am Katalog: `node scripts/katalog-to-md.js docs` ausführen (lesbare Fassung in `docs/`).

## Qualitätsregeln für Rechtsinhalte
- Keine Normen, Entscheidungen oder Aktenzeichen erfinden. Jede neue Option braucht `rechtsgrundlage` und `sicherheitsgrad` (`gruen` gesichert, `gelb` Einzelentscheidung/Sekundärquelle, `rot` offen).
- Geltungszeitpunkt beachten: Vergabebeschleunigungsgesetz gilt für Verfahren ab 01.07.2026 (§ 187 Abs. 2 GWB).
- Texte (`kurz`, Wissenskarten) verständlich für Sachbearbeitende ohne juristische Ausbildung formulieren.

## Nützliche Befehle
- Szenario testen: `node -e "console.log(require('./server/services/optionskatalog').ermittleOptionen({leistungsart:'Dienstleistung',volumen:150000,bundesland:'Berlin'}).empfohlenesVerfahren)"`
- Frontend bauen: `cd client && npx vite build`

## Agenten (`.claude/agents/`)
Ablauf für Rechtsänderungen – immer auf einem eigenen Branch, nie direkt auf `main`:
1. **ross** – recherchiert und schreibt `docs/rechtsupdates/JJJJ-MM-TT.md` (ändert keine Plattform-Dateien)
2. **monica** – überträgt den belegten Änderungsbedarf in `server/wissen/` und führt die Checks aus
3. **joey** – macht Nutzer-Texte verständlich, ohne rechtliche Inhalte zu ändern
4. **chandler** – prüft unabhängig gegen die Quellen; nur bei „FREIGEGEBEN" wird der Pull Request zum Zusammenführen empfohlen

Zusammengeführt wird ausschließlich durch Kristian per Pull Request.
