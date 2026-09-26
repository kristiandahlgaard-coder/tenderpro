/**
 * TenderPro — KI-Assistent API
 * POST /api/ai/chat  — Vergaberecht-Chat + Formular-Hilfe
 *
 * Nutzt die Anthropic Claude API für kontextuelle Vergabeberatung.
 * Unterstützt Streaming (SSE) für flüssige Antworten.
 */
const express = require('express');
const https = require('https');
const { requireAuth } = require('../middleware/auth');

const { ermittleOptionen, alsKiKontext, schwellenwertUebersicht } = require('../services/optionskatalog');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ─── Wissensbasis (Klartext-Karten) ─────────────────
// Dateien unter server/wissen/karten/*.md werden beim Start geladen.
const KARTEN_DIR = path.join(__dirname, '..', 'wissen', 'karten');
function ladeWissenskarten() {
  try {
    return fs.readdirSync(KARTEN_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => fs.readFileSync(path.join(KARTEN_DIR, f), 'utf8'))
      .join('\n\n---\n\n');
  } catch {
    return '';
  }
}
const WISSENSKARTEN = ladeWissenskarten();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-20250514';

// ─── System-Prompt ──────────────────────────────────
const SYSTEM_PROMPT = `Du bist der KI-Assistent der Vergabeplattform TenderPro. Du hilfst Mitarbeiterinnen und Mitarbeitern öffentlicher Auftraggeber bei der Vorbereitung, Durchführung und Dokumentation von Vergabeverfahren.

## Deine Expertise

Du verfügst über vertiefte Kenntnisse im deutschen und europäischen Vergaberecht, insbesondere:
- GWB (Teil 4: Vergabe von öffentlichen Aufträgen und Konzessionen)
- VgV (Vergabeverordnung)
- UVgO (Unterschwellenvergabeordnung)
- VOB/A und VOB/A-EU (Vergabe- und Vertragsordnung für Bauleistungen)
- KonzVgV (Konzessionsvergabeverordnung)
- SektVO (Sektorenverordnung)
- VSVgV (Vergabeverordnung für die Bereiche Verteidigung und Sicherheit)
- Relevante Landesvergabegesetze

## Schwellenwerte, Wertgrenzen und Verfahrenswahl

Die aktuell gültigen Schwellenwerte, Landes-Wertgrenzen und die priorisierten Handlungsoptionen erhältst du unten aus der Wissensbasis und – bei einer konkreten Vergabe – im Block [OPTIONSKATALOG]. Verwende ausschließlich diese Werte, nicht dein Trainingswissen. Wertgrenzen unterhalb der EU-Schwelle sind Landes- bzw. Bundesrecht und unterscheiden sich je nach Auftraggeber.

Wenn ein [OPTIONSKATALOG] vorliegt:
- Nenne zuerst die empfohlene Option und begründe sie in einem Satz.
- Zeige Alternativen mit ihren Voraussetzungen und Risiken.
- Weise auf offene Klärungsfragen hin, wenn deren Antwort die Empfehlung ändern würde.
- Gib den Sicherheitsgrad an, wenn er nicht "gruen" ist (gelb = Einzelentscheidung/Sekundärquelle, rot = offen).

## Kommunikationsstil

- Antworte auf Deutsch, professionell und präzise
- Nenne relevante Rechtsgrundlagen mit §, Absatz und ggf. Nummer
- Unterscheide klar zwischen geltendem Recht, Rechtsprechung und eigener Einschätzung
- Gib bei Unsicherheiten oder umstrittenen Rechtsfragen einen klaren Hinweis
- Halte Antworten kompakt — fokussiere auf das Wesentliche
- Schreibe verständlich für Sachbearbeitende ohne juristische Ausbildung: Fachbegriffe beim ersten Auftreten kurz erklären, am Ende die Rechtsgrundlage in einer Zeile
- Keine Einzelfall-Rechtsberatung: bei hohem Auftragswert, Rügen oder Nachprüfungsverfahren auf qualifizierte Rechtsberatung hinweisen
- Wenn du Formularfelder erklärst, sei besonders praxisnah
- Erfinde niemals Aktenzeichen, Fundstellen oder Rechtsnormen

## Formular-Kontext

Wenn der Nutzer gerade ein Formular ausfüllt, erhältst du den aktuellen Kontext (Schritt, eingegebene Werte). Nutze diesen, um:
- Felder zu erklären und praxisnahe Hinweise zu geben
- Auf vergaberechtliche Implikationen der Eingaben hinzuweisen
- Empfehlungen für die nächsten Schritte zu geben
- Auf mögliche Probleme oder Risiken aufmerksam zu machen`;

// ─── Kontext-Anreicherung ───────────────────────────
function buildContextMessage(context) {
  if (!context || !context.view) return '';

  const parts = ['[AKTUELLER KONTEXT]'];

  if (context.view === 'advisor') {
    parts.push(`Ansicht: Vergabe-Advisor (Schritt ${context.step || '?'} von 7)`);
    if (context.formData) {
      const f = context.formData;
      if (f.auftraggeber_typ) parts.push(`Auftraggeber-Typ: ${f.auftraggeber_typ}`);
      if (f.leistungsbeschreibung) parts.push(`Leistungsbeschreibung: ${f.leistungsbeschreibung}`);
      if (f.leistungsart) parts.push(`Leistungsart: ${f.leistungsart}`);
      if (f.volumen_netto) parts.push(`Geschätztes Volumen (netto): € ${Number(f.volumen_netto).toLocaleString('de-DE')}`);
      if (f.struktur) parts.push(`Vergabestruktur: ${f.struktur}`);
      if (f.laufzeit_monate) parts.push(`Vertragslaufzeit: ${f.laufzeit_monate} Monate`);
      if (f.besonderheiten?.length) parts.push(`Besonderheiten: ${f.besonderheiten.join(', ')}`);
      if (f.projektbezeichnung) parts.push(`Projekt: ${f.projektbezeichnung}`);
    }
    if (context.schwellenwertInfo) {
      const s = context.schwellenwertInfo;
      parts.push(`Schwellenwert-Ergebnis: ${s.label} (${s.regime})`);
      if (s.verfahren) parts.push(`Empfohlenes Verfahren: ${s.verfahren}`);
    }
  } else if (context.view === 'vergabe-detail') {
    parts.push(`Ansicht: Vergabe-Detail`);
    if (context.vergabe) {
      const v = context.vergabe;
      if (v.titel) parts.push(`Vergabe: ${v.titel}`);
      if (v.status) parts.push(`Status: ${v.status}`);
      if (v.verfahrensart) parts.push(`Verfahrensart: ${v.verfahrensart}`);
      if (v.leistungsart) parts.push(`Leistungsart: ${v.leistungsart}`);
      if (v.volumen_netto) parts.push(`Volumen: € ${Number(v.volumen_netto).toLocaleString('de-DE')}`);
    }
  } else if (context.view === 'vergaben-list') {
    parts.push('Ansicht: Vergaben-Übersicht');
  } else if (context.view === 'dashboard') {
    parts.push('Ansicht: Dashboard');
  } else if (context.view === 'freigaben') {
    parts.push('Ansicht: Freigaben');
  } else if (context.view === 'fristenrechner') {
    parts.push('Ansicht: Fristenrechner');
    if (context.fristenData) {
      const f = context.fristenData;
      if (f.verfahrensart) parts.push(`Verfahrensart: ${f.verfahrensart}`);
      if (f.regime) parts.push(`Regime: ${f.regime}`);
    }
  }

  return parts.join('\n');
}

// ─── Quick-Actions pro View ─────────────────────────
router.get('/suggestions', requireAuth, (req, res) => {
  const view = req.query.view || 'dashboard';

  const suggestions = {
    dashboard: [
      'Welche Fristen laufen diese Woche ab?',
      'Was muss ich bei einer neuen Vergabe beachten?',
      'Erkläre die Freigabestufen',
    ],
    advisor: [
      'Welche Leistungsart trifft hier zu?',
      'Welches Verfahren ist bei diesem Volumen richtig?',
      'Was bedeutet EU-weite Vergabe?',
      'Welche Unterlagen brauche ich?',
    ],
    'vergabe-detail': [
      'Was ist der nächste Schritt?',
      'Welche Fristen gelten für diese Phase?',
      'Was muss im Vergabevermerk stehen?',
    ],
    'vergaben-list': [
      'Wie strukturiere ich eine neue Vergabe?',
      'Was ist der Unterschied zwischen Verfahrensarten?',
      'Wann darf ich freihändig vergeben?',
    ],
    freigaben: [
      'Wer muss hier freigeben?',
      'Was passiert bei einer Ablehnung?',
      'Welche Freigabestufen gibt es?',
    ],
    fristenrechner: [
      'Welche Mindestfristen gelten beim offenen Verfahren?',
      'Wann dürfen Fristen verkürzt werden?',
      'Was sind Standstill-Fristen nach § 134 GWB?',
    ],
  };

  res.json({ suggestions: suggestions[view] || suggestions.dashboard });
});

// ─── Chat-Endpunkt (Streaming) ──────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const { messages, context } = req.body;

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'KI-Assistent nicht konfiguriert',
      detail: 'Bitte ANTHROPIC_API_KEY in den Umgebungsvariablen setzen.'
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Keine Nachrichten übergeben' });
  }

  // Limit conversation to last 20 messages to control costs
  const recentMessages = messages.slice(-20);

  // Inject context as first user message if present
  let contextMsg = buildContextMessage(context);

  // Optionskatalog für die aktuelle Vergabe anhängen
  const f = context?.formData || context?.vergabe;
  if (f?.leistungsart) {
    try {
      let org = {};
      if (req.user?.organisation_id) {
        const { rows } = await db.query('SELECT bundesland, typ FROM organisationen WHERE id = $1', [req.user.organisation_id]);
        org = rows[0] || {};
      }
      const optionen = ermittleOptionen({
        leistungsart: f.leistungsart,
        volumen: f.volumen_netto ? Number(f.volumen_netto) : null,
        bundesland: org.bundesland,
        orgTyp: org.typ,
        merkmale: context.merkmale || {},
      });
      const katalogText = alsKiKontext(optionen);
      if (katalogText) contextMsg = (contextMsg ? contextMsg + '\n\n' : '') + katalogText;
    } catch (err) {
      console.error('Optionskatalog für KI fehlgeschlagen:', err.message);
    }
  }
  const apiMessages = [...recentMessages];
  if (contextMsg && apiMessages.length > 0) {
    // Prepend context to the last user message
    const lastIdx = apiMessages.length - 1;
    if (apiMessages[lastIdx].role === 'user') {
      apiMessages[lastIdx] = {
        role: 'user',
        content: contextMsg + '\n\n[FRAGE]\n' + apiMessages[lastIdx].content
      };
    }
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const requestBody = JSON.stringify({
    model: AI_MODEL,
    max_tokens: 2048,
    system: [
      SYSTEM_PROMPT,
      '## Aktueller Rechtsstand\n' + schwellenwertUebersicht(),
      WISSENSKARTEN ? '## Wissensbasis (Klartext-Karten)\n' + WISSENSKARTEN : '',
    ].filter(Boolean).join('\n\n'),
    messages: apiMessages,
    stream: true,
  });

  const apiReq = https.request({
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
  }, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let body = '';
      apiRes.on('data', chunk => body += chunk);
      apiRes.on('end', () => {
        console.error('Anthropic API Error:', apiRes.statusCode, body);
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'KI-Dienst vorübergehend nicht erreichbar' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
      return;
    }

    let buffer = '';
    apiRes.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: parsed.delta.text })}\n\n`);
            } else if (parsed.type === 'message_stop') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
          } catch (e) {
            // Skip unparseable lines
          }
        }
      }
    });

    apiRes.on('end', () => {
      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: parsed.delta.text })}\n\n`);
            }
          } catch (e) {}
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  apiReq.on('error', (err) => {
    console.error('API Request Error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Verbindung zum KI-Dienst fehlgeschlagen' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  // Handle client disconnect
  req.on('close', () => {
    apiReq.destroy();
  });

  apiReq.write(requestBody);
  apiReq.end();
});

module.exports = router;
