-- ═══════════════════════════════════════════════════
-- TenderPro — Vollständiges Datenbankschema
-- PostgreSQL 14+ (Neon-kompatibel)
-- ═══════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───────────────────────────────────────────────────
-- 1. BENUTZER & ORGANISATIONEN
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organisationen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  typ VARCHAR(50) NOT NULL DEFAULT 'klassisch'
    CHECK (typ IN ('klassisch', 'sektoren', 'konzession')),
  strasse VARCHAR(255),
  plz VARCHAR(10),
  ort VARCHAR(100),
  bundesland VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisationen(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  vorname VARCHAR(100) NOT NULL,
  nachname VARCHAR(100) NOT NULL,
  rolle VARCHAR(50) NOT NULL DEFAULT 'beantragend'
    CHECK (rolle IN (
      'beantragend', 'vergabestelle', 'finanzen',
      'recht', 'bereichsleitung', 'geschaeftsfuehrung', 'admin'
    )),
  abteilung VARCHAR(150),
  telefon VARCHAR(50),
  aktiv BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organisation_id);

-- ───────────────────────────────────────────────────
-- 2. VERGABEN (Kernentität)
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vergaben (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisationen(id),
  ersteller_id UUID REFERENCES users(id) NOT NULL,

  -- Kennung
  vergabenummer VARCHAR(50) UNIQUE,
  projektbezeichnung VARCHAR(255),

  -- Advisor Step 1: Auftraggeber
  auftraggeber_typ VARCHAR(50) NOT NULL DEFAULT 'klassisch'
    CHECK (auftraggeber_typ IN ('klassisch', 'paragraph98', 'sektoren')),

  -- Advisor Step 2: Leistung
  leistungsbeschreibung TEXT NOT NULL,
  leistungsart VARCHAR(50) NOT NULL
    CHECK (leistungsart IN (
      'Bauleistung', 'Lieferleistung', 'Dienstleistung',
      'Freiberufliche Leistung', 'Konzession'
    )),
  leistungsart_confidence INTEGER DEFAULT 0,

  -- Advisor Step 3: Kosten
  volumen_netto DECIMAL(15,2),
  schwellenwert_regime VARCHAR(20)
    CHECK (schwellenwert_regime IN ('direkt', 'national', 'eu')),

  -- Advisor Step 4: Verfahren
  verfahrensart VARCHAR(80),
  rechtsgrundlage VARCHAR(100),

  -- Advisor Step 5: Struktur & Laufzeit
  struktur VARCHAR(30) DEFAULT 'einzelvergabe'
    CHECK (struktur IN ('einzelvergabe', 'rahmenvereinbarung', 'dps')),
  laufzeit_monate INTEGER,
  verlaengerung_optionen TEXT,
  erfuellungszeitraum_start DATE,
  erfuellungszeitraum_ende DATE,

  -- Advisor Step 6: Besonderheiten
  besonderheiten JSONB DEFAULT '[]',
  -- z.B. ["BerlAVG", "Nachhaltigkeit", "Soziale Kriterien"]

  -- Advisor Step 7: Anforderung
  anfordernde_stelle VARCHAR(200),
  ansprechpartner_name VARCHAR(150),
  ansprechpartner_email VARCHAR(255),
  ansprechpartner_telefon VARCHAR(50),
  begruendung TEXT,
  risikobewertung VARCHAR(20) DEFAULT 'gering'
    CHECK (risikobewertung IN ('gering', 'mittel', 'hoch')),
  zusaetzliche_notizen TEXT,

  -- Zeitplanung
  geplanter_start DATE,

  -- Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'entwurf'
    CHECK (status IN (
      'entwurf', 'in_pruefung', 'in_freigabe',
      'genehmigt', 'abgelehnt', 'bekanntgemacht',
      'angebotsphase', 'oeffnung', 'wertung',
      'zuschlag', 'abgeschlossen', 'archiviert', 'storniert'
    )),
  ablehnungsgrund TEXT,

  -- Formularsatz
  formularsatz_id UUID,

  -- Timestamps
  submitted_at TIMESTAMPTZ,
  genehmigt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vergaben_org ON vergaben(organisation_id);
CREATE INDEX IF NOT EXISTS idx_vergaben_status ON vergaben(status);
CREATE INDEX IF NOT EXISTS idx_vergaben_ersteller ON vergaben(ersteller_id);

-- Automatische Vergabenummer
CREATE OR REPLACE FUNCTION generate_vergabenummer()
RETURNS TRIGGER AS $$
DECLARE
  jahr TEXT;
  lfd INTEGER;
BEGIN
  jahr := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(vergabenummer FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO lfd
  FROM vergaben
  WHERE vergabenummer LIKE 'VG-' || jahr || '-%';

  NEW.vergabenummer := 'VG-' || jahr || '-' || LPAD(lfd::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vergabenummer ON vergaben;
CREATE TRIGGER trg_vergabenummer
  BEFORE INSERT ON vergaben
  FOR EACH ROW
  WHEN (NEW.vergabenummer IS NULL)
  EXECUTE FUNCTION generate_vergabenummer();

-- ───────────────────────────────────────────────────
-- 3. FREIGABE-SYSTEM
-- ───────────────────────────────────────────────────

-- Regelwerk (Admin-konfigurierbar)
CREATE TABLE IF NOT EXISTS freigabe_regeln (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisationen(id),
  name VARCHAR(150) NOT NULL,
  prioritaet INTEGER DEFAULT 0,

  -- Bedingungen (alle müssen zutreffen, NULL = egal)
  bedingung_volumen_min DECIMAL(15,2),
  bedingung_volumen_max DECIMAL(15,2),
  bedingung_leistungsart VARCHAR(50),
  bedingung_struktur VARCHAR(30),
  bedingung_schwellenwert VARCHAR(20),
  bedingung_besonderheit VARCHAR(100),

  -- Erforderliche Freigabe
  erforderliche_rolle VARCHAR(50) NOT NULL,
  stufe INTEGER NOT NULL DEFAULT 1,
  reihenfolge VARCHAR(10) DEFAULT 'linear'
    CHECK (reihenfolge IN ('linear', 'parallel')),

  aktiv BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freigabe_regeln_org ON freigabe_regeln(organisation_id);

-- Berechnete Freigabenkette pro Vergabe
CREATE TABLE IF NOT EXISTS freigabenkette (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE CASCADE,

  stufe INTEGER NOT NULL,
  rolle VARCHAR(50) NOT NULL,
  reihenfolge VARCHAR(10) DEFAULT 'linear',

  freigeber_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ausstehend'
    CHECK (status IN ('ausstehend', 'genehmigt', 'abgelehnt', 'uebersprungen')),

  kommentar TEXT,
  entschieden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freigabenkette_vergabe ON freigabenkette(vergabe_id);

-- ───────────────────────────────────────────────────
-- 4. FORMULARE
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS formular_vorlagen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  beschreibung TEXT,
  kategorie VARCHAR(80) NOT NULL,
  -- z.B. 'Bekanntmachung', 'Bewerbungsbedingungen', 'Wertung', 'Zuschlag'
  phase VARCHAR(50),
  -- z.B. 'vorbereitung', 'bekanntmachung', 'angebote', 'wertung', 'zuschlag'
  pflicht BOOLEAN DEFAULT false,
  schwellenwert_regime VARCHAR(20),
  leistungsart VARCHAR(50),
  dateiname VARCHAR(255),
  vorlage_url TEXT,
  sortierung INTEGER DEFAULT 0,
  aktiv BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vergabe_formulare (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE CASCADE,
  vorlage_id UUID REFERENCES formular_vorlagen(id),
  name VARCHAR(200) NOT NULL,
  status VARCHAR(20) DEFAULT 'offen'
    CHECK (status IN ('offen', 'in_bearbeitung', 'fertig', 'geprueft')),
  ausgefuellt_von UUID REFERENCES users(id),
  ausgefuellt_at TIMESTAMPTZ,
  datei_pfad TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vergabe_formulare_vergabe ON vergabe_formulare(vergabe_id);

-- ───────────────────────────────────────────────────
-- 5. FRISTEN & TERMINE
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vergabe_fristen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE CASCADE,

  typ VARCHAR(80) NOT NULL,
  -- z.B. 'angebotsfrist', 'teilnahmefrist', 'bindefrist', 'vorabinformation', 'zuschlagsfrist'
  bezeichnung VARCHAR(200) NOT NULL,
  frist_datum DATE NOT NULL,
  frist_uhrzeit TIME DEFAULT '12:00',
  rechtsgrundlage VARCHAR(100),

  erledigt BOOLEAN DEFAULT false,
  erinnerung_tage INTEGER DEFAULT 3,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fristen_vergabe ON vergabe_fristen(vergabe_id);
CREATE INDEX IF NOT EXISTS idx_fristen_datum ON vergabe_fristen(frist_datum);

-- ───────────────────────────────────────────────────
-- 6. KOMMUNIKATION (Bieterfragen)
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kommunikation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE CASCADE,

  typ VARCHAR(30) NOT NULL DEFAULT 'frage'
    CHECK (typ IN ('frage', 'antwort', 'nachforderung', 'aufklaerung', 'hinweis')),
  betreff VARCHAR(300),
  inhalt TEXT NOT NULL,

  absender_name VARCHAR(200),
  absender_typ VARCHAR(20) DEFAULT 'bieter'
    CHECK (absender_typ IN ('bieter', 'vergabestelle')),

  bezug_id UUID REFERENCES kommunikation(id),
  -- Antwort auf eine vorherige Nachricht

  gelesen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kommunikation_vergabe ON kommunikation(vergabe_id);

-- ───────────────────────────────────────────────────
-- 7. VERGABEAKTE (Dokumentation)
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vergabeakte (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE CASCADE,

  bereich VARCHAR(80) NOT NULL,
  -- z.B. 'Bedarfsfeststellung', 'Markterkundung', 'Vergabevermerk',
  -- 'Bekanntmachung', 'Angebotsöffnung', 'Wertung', 'Zuschlag', 'Vertrag'
  bezeichnung VARCHAR(300) NOT NULL,
  beschreibung TEXT,

  dokument_typ VARCHAR(20) DEFAULT 'system'
    CHECK (dokument_typ IN ('system', 'upload', 'generiert')),
  datei_pfad TEXT,
  datei_groesse INTEGER,
  mime_type VARCHAR(100),

  erstellt_von UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vergabeakte_vergabe ON vergabeakte(vergabe_id);

-- ───────────────────────────────────────────────────
-- 8. AUDIT-LOG
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  aktion VARCHAR(100) NOT NULL,
  -- z.B. 'vergabe_erstellt', 'status_geaendert', 'freigabe_erteilt', 'dokument_hochgeladen'
  details JSONB DEFAULT '{}',
  ip_adresse VARCHAR(45),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_vergabe ON audit_log(vergabe_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ───────────────────────────────────────────────────
-- 9. DATEIANHÄNGE
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anhaenge (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vergabe_id UUID REFERENCES vergaben(id) ON DELETE CASCADE,

  dateiname VARCHAR(300) NOT NULL,
  original_name VARCHAR(300) NOT NULL,
  mime_type VARCHAR(100),
  groesse INTEGER,
  pfad TEXT NOT NULL,

  hochgeladen_von UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anhaenge_vergabe ON anhaenge(vergabe_id);

-- ───────────────────────────────────────────────────
-- 10. ADRESSDATENBANK (Unternehmen)
-- ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS unternehmen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisationen(id),

  firma VARCHAR(300) NOT NULL,
  rechtsform VARCHAR(50),
  strasse VARCHAR(255),
  plz VARCHAR(10),
  ort VARCHAR(100),
  land VARCHAR(50) DEFAULT 'DE',

  ansprechpartner VARCHAR(200),
  email VARCHAR(255),
  telefon VARCHAR(50),
  website VARCHAR(300),

  branche VARCHAR(150),
  ust_id VARCHAR(30),

  notizen TEXT,
  aktiv BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unternehmen_org ON unternehmen(organisation_id);

-- ───────────────────────────────────────────────────
-- Updated-At Trigger
-- ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_vergaben_updated ON vergaben;
CREATE TRIGGER trg_vergaben_updated BEFORE UPDATE ON vergaben
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_organisationen_updated ON organisationen;
CREATE TRIGGER trg_organisationen_updated BEFORE UPDATE ON organisationen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_unternehmen_updated ON unternehmen;
CREATE TRIGGER trg_unternehmen_updated BEFORE UPDATE ON unternehmen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
