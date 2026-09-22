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

| E-Mail | Passwort | Rolle |
|--------|----------|-------|
| admin@tenderpro.de | test123 | Admin |
| vergabe@tenderpro.de | test123 | Vergabestelle |
| finanzen@tenderpro.de | test123 | Finanzen |
| recht@tenderpro.de | test123 | Recht |
| bereichsleitung@tenderpro.de | test123 | Bereichsleitung |
| gf@tenderpro.de | test123 | Geschäftsführung |
| beantragend@tenderpro.de | test123 | Beantragend |

## Funktionen

- **Vergabe-Advisor:** 7-Schritte-Assistent zur Anlage neuer Vergaben mit automatischer Leistungsart-Erkennung und Schwellenwert-Berechnung
- **Dashboard:** Übersicht mit Statistiken, Fristen und Aktivitäten
- **Vergabenliste:** Suche, Filter, Detail-Ansicht mit Tabs
- **Freigabenkette:** Dynamisch berechnete Genehmigungsworkflows
- **Fristenrechner:** Berechnung von Vergabefristen nach VgV/UVgO/VOB/A
- **Audit-Trail:** Lückenlose Dokumentation aller Aktionen
