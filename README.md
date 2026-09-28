# TenderPro — Vergabeplattform für den öffentlichen Sektor

Vollständige SaaS-Plattform für die Verwaltung öffentlicher Vergabeverfahren.

## Tech-Stack

- **Backend:** Node.js + Express
- **Frontend:** Vue 3 + Vite + Pinia
- **Datenbank:** PostgreSQL (Neon)
- **Deploy:** Railway (Single Service)

## Schnellstart (lokal)

```bash
# 1. Dependencies installieren
npm install

# 2. .env erstellen (siehe .env.example)
cp .env.example .env
# DATABASE_URL, JWT_SECRET eintragen

# 3. Datenbank initialisieren
npm run db:migrate
npm run db:seed

# 4. Entwicklungsserver starten
npm run dev
# → Frontend: http://localhost:5173
# → API:     http://localhost:8080
```

## Deployment auf Railway

### 1. GitHub Repository erstellen

Lade diesen Ordner auf GitHub hoch:
- Erstelle ein neues Repository auf github.com
- Push den Code dorthin

### 2. Neon-Datenbank einrichten

1. Gehe zu [neon.tech](https://neon.tech) und erstelle einen Account (kostenlos)
2. Erstelle ein neues Projekt → kopiere die `DATABASE_URL`

### 3. Datenbank-Schema anlegen

```bash
# In GitHub Codespaces oder lokal:
DATABASE_URL="deine-neon-url" npm run db:migrate
DATABASE_URL="deine-neon-url" npm run db:seed
```

### 4. Railway-Projekt erstellen

1. Gehe zu [railway.app](https://railway.app)
2. „New Project" → „Deploy from GitHub repo"
3. Wähle dein Repository
4. Unter **Variables** setzen:
   - `DATABASE_URL` = Neon Connection String
   - `JWT_SECRET` = ein langer zufälliger String (z.B. `openssl rand -hex 32`)
   - `NODE_ENV` = `production`
   - `PORT` = `8080`
5. Deploy starten → fertig!

## Test-Zugänge

In der lokalen Entwicklung legt `npm run db:seed` Testzugänge mit einem Entwicklungspasswort an.
Im Produktivbetrieb (`NODE_ENV=production`) gilt:

- `JWT_SECRET` muss gesetzt sein (mindestens 32 Zeichen), sonst startet der Server nicht.
- `NODE_ENV=production` muss gesetzt sein – alle Schutzmaßnahmen hängen daran.
- Testzugänge erhalten bei jedem Start das Passwort aus `TESTZUGANG_PASSWORT` (mindestens 12 Zeichen). Ist die Variable nicht gesetzt, werden sie deaktiviert. Der Admin-Testzugang ist im Produktivbetrieb immer deaktiviert.
- Die Selbstregistrierung ist gesperrt (freischalten nur mit `ALLOW_REGISTRATION=true`).

## Funktionen

- **Vergabe-Advisor:** 7-Schritte-Assistent zur Anlage neuer Vergaben mit automatischer Leistungsart-Erkennung und Schwellenwert-Berechnung
- **Dashboard:** Übersicht mit Statistiken, Fristen und Aktivitäten
- **Vergabenliste:** Suche, Filter, Detail-Ansicht mit Tabs
- **Freigabenkette:** Dynamisch berechnete Genehmigungsworkflows
- **Fristenrechner:** Berechnung von Vergabefristen nach VgV/UVgO/VOB/A
- **Audit-Trail:** Lückenlose Dokumentation aller Aktionen
