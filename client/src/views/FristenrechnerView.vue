<script setup>
import { ref, computed } from 'vue'

const verfahrensart = ref('')
const startdatum = ref('')
const dringlichkeit = ref('normal')
const eVergabe = ref(false)

const verfahrensarten = [
  { value: 'offenes_verfahren', label: 'Offenes Verfahren (VgV)', regime: 'eu' },
  { value: 'nicht_offenes_verfahren', label: 'Nicht offenes Verfahren (VgV)', regime: 'eu' },
  { value: 'verhandlungsverfahren', label: 'Verhandlungsverfahren (VgV)', regime: 'eu' },
  { value: 'oeffentliche_ausschreibung', label: 'Öffentliche Ausschreibung (UVgO)', regime: 'national' },
  { value: 'beschraenkte_ausschreibung', label: 'Beschränkte Ausschreibung (UVgO)', regime: 'national' },
  { value: 'verhandlungsvergabe', label: 'Verhandlungsvergabe (UVgO)', regime: 'national' },
  { value: 'direktvergabe', label: 'Direktvergabe (UVgO § 14)', regime: 'direkt' },
  { value: 'offenes_verfahren_bau', label: 'Offenes Verfahren (VOB/A-EU)', regime: 'eu' },
  { value: 'oeffentliche_ausschreibung_bau', label: 'Öffentliche Ausschreibung (VOB/A)', regime: 'national' },
]

// Fristenregeln nach VgV / UVgO / VOB/A
const fristenRegeln = {
  offenes_verfahren: {
    angebotsfrist: { normal: 35, verkuerzt: 15, dringend: 15 },
    wartefrist: 10,
    bindefrist: 60,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  nicht_offenes_verfahren: {
    teilnahmefrist: { normal: 30, verkuerzt: 15, dringend: 15 },
    angebotsfrist: { normal: 30, verkuerzt: 10, dringend: 10 },
    wartefrist: 10,
    bindefrist: 60,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  verhandlungsverfahren: {
    teilnahmefrist: { normal: 30, verkuerzt: 15, dringend: 15 },
    angebotsfrist: { normal: 30, verkuerzt: 10, dringend: 10 },
    wartefrist: 10,
    bindefrist: 60,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  oeffentliche_ausschreibung: {
    angebotsfrist: { normal: 20, verkuerzt: 10, dringend: 10 },
    wartefrist: 0,
    bindefrist: 30,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  beschraenkte_ausschreibung: {
    teilnahmefrist: { normal: 14, verkuerzt: 7, dringend: 7 },
    angebotsfrist: { normal: 20, verkuerzt: 10, dringend: 10 },
    wartefrist: 0,
    bindefrist: 30,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  verhandlungsvergabe: {
    angebotsfrist: { normal: 14, verkuerzt: 7, dringend: 7 },
    wartefrist: 0,
    bindefrist: 30,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  direktvergabe: {
    angebotsfrist: { normal: 0, verkuerzt: 0, dringend: 0 },
    wartefrist: 0,
    bindefrist: 14,
    zuschlagsfrist: 14,
    bekanntmachung: 0,
  },
  offenes_verfahren_bau: {
    angebotsfrist: { normal: 35, verkuerzt: 15, dringend: 15 },
    wartefrist: 10,
    bindefrist: 60,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
  oeffentliche_ausschreibung_bau: {
    angebotsfrist: { normal: 20, verkuerzt: 10, dringend: 10 },
    wartefrist: 0,
    bindefrist: 30,
    zuschlagsfrist: 30,
    bekanntmachung: 0,
  },
}

function addWorkdays(date, days) {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

function addCalendarDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDatum(d) {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

const berechneteTermine = computed(() => {
  if (!verfahrensart.value || !startdatum.value) return null

  const regeln = fristenRegeln[verfahrensart.value]
  if (!regeln) return null

  const start = new Date(startdatum.value)
  const termine = []
  let currentDate = new Date(start)

  // Bekanntmachung
  termine.push({
    label: 'Bekanntmachung / Versand',
    datum: new Date(currentDate),
    tage: 0,
    typ: 'start',
    hinweis: 'Veröffentlichung der Bekanntmachung',
  })

  // Teilnahmefrist (falls vorhanden)
  if (regeln.teilnahmefrist) {
    const tage = regeln.teilnahmefrist[dringlichkeit.value] || regeln.teilnahmefrist.normal
    const adjustedTage = eVergabe.value ? Math.max(tage - 5, 10) : tage
    currentDate = addCalendarDays(currentDate, adjustedTage)
    termine.push({
      label: 'Ende Teilnahmefrist',
      datum: new Date(currentDate),
      tage: adjustedTage,
      typ: 'frist',
      hinweis: `${adjustedTage} Kalendertage${eVergabe.value ? ' (eVergabe: -5 Tage)' : ''}`,
    })
  }

  // Angebotsfrist
  if (regeln.angebotsfrist) {
    const tage = regeln.angebotsfrist[dringlichkeit.value] || regeln.angebotsfrist.normal
    if (tage > 0) {
      const adjustedTage = eVergabe.value ? Math.max(tage - 5, 10) : tage
      currentDate = addCalendarDays(currentDate, adjustedTage)
      termine.push({
        label: 'Ende Angebotsfrist',
        datum: new Date(currentDate),
        tage: adjustedTage,
        typ: 'frist',
        hinweis: `${adjustedTage} Kalendertage${eVergabe.value ? ' (eVergabe: -5 Tage)' : ''}`,
      })
    }
  }

  // Öffnung & Wertung (~ 5 Werktage)
  currentDate = addWorkdays(currentDate, 5)
  termine.push({
    label: 'Öffnung & Wertung (ca.)',
    datum: new Date(currentDate),
    tage: 5,
    typ: 'phase',
    hinweis: '~5 Werktage geschätzt',
  })

  // Zuschlagsfrist
  if (regeln.zuschlagsfrist > 0) {
    currentDate = addCalendarDays(currentDate, regeln.zuschlagsfrist)
    termine.push({
      label: 'Zuschlagsentscheidung',
      datum: new Date(currentDate),
      tage: regeln.zuschlagsfrist,
      typ: 'frist',
      hinweis: `Innerhalb von ${regeln.zuschlagsfrist} Kalendertagen`,
    })
  }

  // Wartefrist (Vorabinformation § 134 GWB)
  if (regeln.wartefrist > 0) {
    const warteLabel = eVergabe.value ? 10 : 15
    currentDate = addCalendarDays(currentDate, warteLabel)
    termine.push({
      label: 'Ende Wartefrist (§ 134 GWB)',
      datum: new Date(currentDate),
      tage: warteLabel,
      typ: 'frist',
      hinweis: `${warteLabel} Kalendertage Vorabinformation${eVergabe.value ? ' (elektronisch)' : ' (postalisch)'}`,
    })
  }

  // Vertragsschluss
  currentDate = addWorkdays(currentDate, 3)
  termine.push({
    label: 'Frühestmöglicher Vertragsschluss',
    datum: new Date(currentDate),
    tage: 3,
    typ: 'end',
    hinweis: 'Nach Ablauf aller Fristen',
  })

  // Gesamtdauer
  const gesamtTage = Math.ceil((currentDate - start) / (1000 * 60 * 60 * 24))

  return { termine, gesamtTage, start, ende: currentDate }
})
</script>

<template>
  <div>
    <div class="page-header">
      <h1>Fristenrechner</h1>
    </div>

    <div class="rechner-layout">
      <!-- Eingabe -->
      <div class="rechner-form card">
        <h3>Parameter</h3>

        <div class="form-group">
          <label for="verfahren">Verfahrensart</label>
          <select id="verfahren" v-model="verfahrensart" class="form-select">
            <option value="">Bitte wählen...</option>
            <optgroup label="EU-Schwellenwert">
              <option v-for="v in verfahrensarten.filter(v => v.regime === 'eu')" :key="v.value" :value="v.value">
                {{ v.label }}
              </option>
            </optgroup>
            <optgroup label="National (Unterschwellenwert)">
              <option v-for="v in verfahrensarten.filter(v => v.regime === 'national')" :key="v.value" :value="v.value">
                {{ v.label }}
              </option>
            </optgroup>
            <optgroup label="Direktvergabe">
              <option v-for="v in verfahrensarten.filter(v => v.regime === 'direkt')" :key="v.value" :value="v.value">
                {{ v.label }}
              </option>
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="start">Startdatum (Bekanntmachung)</label>
          <input id="start" v-model="startdatum" type="date" class="form-input" />
        </div>

        <div class="form-group">
          <label>Dringlichkeit</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" v-model="dringlichkeit" value="normal" />
              <span>Normal</span>
            </label>
            <label class="radio-label">
              <input type="radio" v-model="dringlichkeit" value="verkuerzt" />
              <span>Verkürzt</span>
            </label>
            <label class="radio-label">
              <input type="radio" v-model="dringlichkeit" value="dringend" />
              <span>Dringend</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="eVergabe" />
            <span>Elektronische Vergabe (eVergabe)</span>
          </label>
          <p class="form-hint">Verkürzt Fristen um bis zu 5 Tage (§ 10a EU VOB/A, § 13 VgV)</p>
        </div>

        <div class="rechner-hint">
          <strong>Hinweis:</strong> Die berechneten Fristen sind Mindestfristen nach VgV / UVgO / VOB/A.
          Feiertage und landesrechtliche Besonderheiten werden nicht berücksichtigt.
          Die tatsächlichen Fristen können abweichen.
        </div>
      </div>

      <!-- Ergebnis -->
      <div class="rechner-result">
        <div v-if="!berechneteTermine" class="empty card">
          Bitte wählen Sie eine Verfahrensart und ein Startdatum.
        </div>

        <template v-else>
          <!-- Summary -->
          <div class="result-summary card">
            <div class="summary-item">
              <div class="summary-value">{{ berechneteTermine.gesamtTage }}</div>
              <div class="summary-label">Kalendertage</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">{{ formatDatum(berechneteTermine.start) }}</div>
              <div class="summary-label">Start</div>
            </div>
            <div class="summary-item">
              <div class="summary-value accent">{{ formatDatum(berechneteTermine.ende) }}</div>
              <div class="summary-label">Frühester Vertragsschluss</div>
            </div>
          </div>

          <!-- Timeline -->
          <div class="timeline card">
            <h3>Zeitplan</h3>
            <div
              v-for="(termin, idx) in berechneteTermine.termine"
              :key="idx"
              class="timeline-item"
              :class="termin.typ"
            >
              <div class="timeline-marker">
                <div class="timeline-dot" :class="termin.typ"></div>
                <div v-if="idx < berechneteTermine.termine.length - 1" class="timeline-line"></div>
              </div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-label">{{ termin.label }}</span>
                  <span class="timeline-datum">{{ formatDatum(termin.datum) }}</span>
                </div>
                <div class="timeline-hinweis">{{ termin.hinweis }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rechner-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: start;
}

.rechner-form h3 {
  font-family: var(--font-data);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 20px;
}

.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.form-hint {
  font-size: 12px;
  color: var(--ink-muted);
  margin-top: 4px;
}

.rechner-hint {
  margin-top: 20px;
  padding: 12px;
  background: var(--surface-sunken);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.6;
}

/* Result */
.result-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  text-align: center;
  margin-bottom: 16px;
}
.summary-value {
  font-family: var(--font-data);
  font-size: 18px;
  font-weight: 700;
  color: var(--trust);
}
.summary-value.accent { color: var(--accent); }
.summary-label {
  font-size: 12px;
  color: var(--ink-muted);
  margin-top: 4px;
}

/* Timeline */
.timeline h3 {
  font-family: var(--font-data);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 20px;
}
.timeline-item {
  display: flex;
  gap: 16px;
  min-height: 60px;
}
.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
}
.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border);
  border: 2px solid var(--surface-raised);
  box-shadow: 0 0 0 2px var(--border);
  z-index: 1;
}
.timeline-dot.start { background: var(--trust); box-shadow: 0 0 0 2px var(--trust); }
.timeline-dot.frist { background: var(--warning); box-shadow: 0 0 0 2px var(--warning); }
.timeline-dot.phase { background: var(--ink-muted); box-shadow: 0 0 0 2px var(--ink-muted); }
.timeline-dot.end { background: var(--accent); box-shadow: 0 0 0 2px var(--accent); }

.timeline-line {
  width: 2px;
  flex: 1;
  background: var(--border);
  min-height: 20px;
}

.timeline-content {
  flex: 1;
  padding-bottom: 16px;
}
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.timeline-label { font-size: 14px; font-weight: 500; }
.timeline-datum {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink-secondary);
  white-space: nowrap;
}
.timeline-hinweis {
  font-size: 12px;
  color: var(--ink-muted);
  margin-top: 4px;
}

.empty {
  padding: 60px 24px;
  text-align: center;
  color: var(--ink-muted);
}

@media (max-width: 768px) {
  .rechner-layout {
    grid-template-columns: 1fr;
  }
  .result-summary {
    grid-template-columns: 1fr;
  }
  .radio-group {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
