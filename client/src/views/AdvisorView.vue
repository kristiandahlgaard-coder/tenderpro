<script setup>
import { ref, computed, watch, inject, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/index.js'
import OptionenPanel from '../components/OptionenPanel.vue'

const router = useRouter()
const setAiContext = inject('setAiContext', () => {})
const saving = ref(false)
const error = ref('')

// ─── Form State ──────────────────────────────────
const form = ref({
  auftraggeber_typ: '',
  leistungsbeschreibung: '',
  leistungsart: '',
  volumen_netto: '',
  struktur: 'einzelvergabe',
  laufzeit_monate: '',
  verlaengerung_optionen: '',
  besonderheiten: [],
  anfordernde_stelle: '',
  ansprechpartner_name: '',
  ansprechpartner_email: '',
  begruendung: '',
  risikobewertung: 'gering',
  zusaetzliche_notizen: '',
  projektbezeichnung: '',
})

// ─── Leistungsart Auto-Erkennung ─────────────────
const erkannteArt = ref('')
const artConfidence = ref(0)

const keywords = {
  'Bauleistung': ['bau', 'hochbau', 'tiefbau', 'sanierung', 'renovierung', 'neubau', 'umbau', 'abriss', 'fassade', 'dach', 'aufzug', 'elektroinstallation', 'heizung', 'lüftung', 'sanitär', 'trockenbau', 'brandschutz', 'instandsetzung', 'estrich', 'malerarbeit', 'bodenbelag'],
  'Dienstleistung': ['reinigung', 'wartung', 'beratung', 'schulung', 'transport', 'catering', 'sicherheit', 'versicherung', 'entsorgung', 'bewachung', 'postdienst', 'dolmetscher'],
  'Lieferleistung': ['lieferung', 'möbel', 'computer', 'hardware', 'fahrzeug', 'büromaterial', 'kopierer', 'lebensmittel', 'medizinprodukt', 'software-lizenz'],
  'Freiberufliche Leistung': ['architekt', 'ingenieur', 'planung', 'gutachten', 'tragwerk', 'statik', 'vermessung', 'energieberatung', 'projektsteuerung', 'bauleitung', 'tga', 'hls'],
  'Konzession': ['konzession', 'betreibermodell', 'öpnv', 'wasserversorgung', 'abfallwirtschaft', 'parkraumbewirtschaftung'],
}

watch(() => form.value.leistungsbeschreibung, (text) => {
  if (!text || text.length < 3) { erkannteArt.value = ''; artConfidence.value = 0; return }
  const lower = text.toLowerCase()
  let best = ''; let bestScore = 0
  for (const [art, words] of Object.entries(keywords)) {
    const score = words.filter(w => lower.includes(w)).length
    if (score > bestScore) { bestScore = score; best = art }
  }
  if (bestScore > 0) {
    erkannteArt.value = best
    artConfidence.value = bestScore
    form.value.leistungsart = best
  }
})

// ─── Optionskatalog & Schwellenwert (aus dem Backend) ─
// Schwellenwerte und Landes-Wertgrenzen werden zentral in server/wissen/rechtsstand.json gepflegt.
const merkmale = ref({})
const optionen = ref(null)
const optionenLaden = ref(false)
let optionenTimer = null

async function ladeOptionen() {
  const vol = parseFloat(form.value.volumen_netto)
  const art = form.value.leistungsart
  if (!vol || !art) { optionen.value = null; return }
  optionenLaden.value = true
  try {
    const { data } = await api.get('/optionen', {
      params: { leistungsart: art, volumen: vol, merkmale: JSON.stringify(merkmale.value) },
    })
    optionen.value = data
  } catch (err) {
    console.error('Optionskatalog nicht erreichbar', err)
    optionen.value = null
  } finally {
    optionenLaden.value = false
  }
}

watch(
  () => [form.value.leistungsart, form.value.volumen_netto, merkmale.value],
  () => {
    clearTimeout(optionenTimer)
    optionenTimer = setTimeout(ladeOptionen, 350)
  },
  { deep: true }
)

const schwellenwertInfo = computed(() => {
  const vol = parseFloat(form.value.volumen_netto)
  const o = optionen.value
  if (!vol || !o) return null
  const volText = `€ ${vol.toLocaleString('de-DE')}`
  const schwelleText = `€ ${Number(o.schwelle).toLocaleString('de-DE')}`
  const verfahren = o.empfohlenesVerfahren?.titel || null
  if (o.regime === 'direkt') {
    return { type: 'success', regime: 'direkt', label: 'Direktauftrag möglich', text: `Volumen ${volText} liegt unter der Direktauftragsgrenze (${o.landesPack?.name}).`, verfahren }
  }
  if (o.regime === 'eu') {
    return { type: 'danger', regime: 'eu', label: 'EU-weite Vergabe', text: `Volumen ${volText} erreicht den EU-Schwellenwert (${schwelleText}).`, verfahren }
  }
  const pct = Math.round(vol / o.schwelle * 100)
  return { type: 'info', regime: 'national', label: 'Nationale Vergabe', text: `Volumen ${volText} unter EU-Schwellenwert (${schwelleText}).${pct >= 85 ? ' ⚠️ Schwellenwertnähe: ' + pct + ' %' : ''}`, verfahren }
})

// ─── Steps ───────────────────────────────────────
const currentStep = ref(1)
const totalSteps = 7

const stepTitles = [
  'Auftraggeber',
  'Leistung beschreiben',
  'Kostenschätzung',
  'Struktur & Laufzeit',
  'Besonderheiten',
  'Anforderung & Begründung',
  'Zusammenfassung',
]

function nextStep() {
  if (currentStep.value < totalSteps) currentStep.value++
}
function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

// ─── KI-Kontext aktualisieren ───────────────────────
watch([currentStep, form, schwellenwertInfo, merkmale], () => {
  setAiContext({
    view: 'advisor',
    step: currentStep.value,
    formData: { ...form.value },
    schwellenwertInfo: schwellenwertInfo.value,
    merkmale: { ...merkmale.value },
  })
}, { immediate: true, deep: true })

onUnmounted(() => { setAiContext({}); clearTimeout(optionenTimer) })

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1: return !!form.value.auftraggeber_typ
    case 2: return form.value.leistungsbeschreibung.length >= 5 && !!form.value.leistungsart
    case 3: return !!form.value.volumen_netto
    default: return true
  }
})

// ─── Besonderheiten Options ──────────────────────
const besonderheitenOptions = [
  'BerlAVG', 'Tariftreue', 'Nachhaltigkeit', 'Soziale Kriterien',
  'Barrierefreiheit', 'Innovation', 'Datenschutz (DSGVO)',
]

function toggleBesonderheit(b) {
  const idx = form.value.besonderheiten.indexOf(b)
  if (idx >= 0) form.value.besonderheiten.splice(idx, 1)
  else form.value.besonderheiten.push(b)
}

// ─── Submit ──────────────────────────────────────
async function submitVergabe(asDraft = true) {
  saving.value = true
  error.value = ''
  try {
    const payload = {
      ...form.value,
      volumen_netto: parseFloat(form.value.volumen_netto) || null,
      laufzeit_monate: parseInt(form.value.laufzeit_monate) || null,
      leistungsart_confidence: artConfidence.value,
      schwellenwert_regime: schwellenwertInfo.value?.regime || null,
      verfahrensart: schwellenwertInfo.value?.verfahren || null,
    }

    const { data } = await api.post('/vergaben', payload)

    if (!asDraft) {
      await api.post(`/vergaben/${data.id}/submit`)
    }

    router.push(`/vergaben/${data.id}`)
  } catch (err) {
    error.value = err.response?.data?.error || 'Fehler beim Speichern'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="advisor-layout">
    <!-- Form -->
    <div class="advisor-form">
      <div class="page-header">
        <h1>✦ Vergabe-Advisor</h1>
        <div class="step-indicator">
          Schritt {{ currentStep }} / {{ totalSteps }}
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: (currentStep / totalSteps * 100) + '%' }"></div>
      </div>

      <!-- Step Title -->
      <h2 class="step-title">{{ stepTitles[currentStep - 1] }}</h2>

      <!-- Step 1: Auftraggeber -->
      <div v-show="currentStep === 1" class="step-content">
        <div class="option-cards" role="radiogroup" aria-label="Auftraggeber-Typ">
          <div
            v-for="opt in [
              { value: 'klassisch', label: 'Klassischer öffentlicher Auftraggeber', desc: 'Bund, Länder, Kommunen, Körperschaften' },
              { value: 'paragraph98', label: 'Öffentlicher Auftraggeber nach § 98 GWB', desc: 'Einrichtungen mit besonderer Zweckbindung' },
              { value: 'sektoren', label: 'Sektorenauftraggeber', desc: 'Energie, Wasser, Verkehr, Post' },
            ]"
            :key="opt.value"
            role="radio"
            :aria-checked="form.auftraggeber_typ === opt.value"
            tabindex="0"
            class="option-card"
            :class="{ selected: form.auftraggeber_typ === opt.value }"
            @click="form.auftraggeber_typ = opt.value"
            @keydown.enter="form.auftraggeber_typ = opt.value"
            @keydown.space.prevent="form.auftraggeber_typ = opt.value"
          >
            <div class="option-radio" :class="{ checked: form.auftraggeber_typ === opt.value }"></div>
            <div>
              <div class="option-label">{{ opt.label }}</div>
              <div class="option-desc">{{ opt.desc }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Leistung -->
      <div v-show="currentStep === 2" class="step-content">
        <div class="form-group">
          <label>Konkrete Leistungsbeschreibung</label>
          <textarea
            v-model="form.leistungsbeschreibung"
            class="form-textarea"
            rows="4"
            placeholder="z.B. Renovierung der Büroräume im 3. OG, Gebäude Hauptstr. 12..."
          ></textarea>
        </div>

        <div v-if="erkannteArt" class="detection-box">
          <span class="detection-icon">✓</span>
          <div>
            <strong>Erkannte Leistungsart: {{ erkannteArt }}</strong>
            <span class="detection-score">({{ artConfidence }} Indikator{{ artConfidence > 1 ? 'en' : '' }})</span>
          </div>
        </div>

        <div class="form-group">
          <label>Leistungsart (manuell korrigieren)</label>
          <select v-model="form.leistungsart" class="form-select">
            <option value="">— Bitte wählen —</option>
            <option value="Bauleistung">Bauleistung</option>
            <option value="Lieferleistung">Lieferleistung</option>
            <option value="Dienstleistung">Dienstleistung</option>
            <option value="Freiberufliche Leistung">Freiberufliche Leistung</option>
            <option value="Konzession">Konzession</option>
          </select>
        </div>

        <div class="form-group">
          <label>Projektbezeichnung (optional)</label>
          <input v-model="form.projektbezeichnung" class="form-input" placeholder="z.B. Sanierung Hauptgebäude" />
        </div>
      </div>

      <!-- Step 3: Kosten -->
      <div v-show="currentStep === 3" class="step-content">
        <div class="form-group">
          <label>Geschätztes Auftragsvolumen (netto, EUR)</label>
          <input
            v-model="form.volumen_netto"
            type="number"
            class="form-input volume-input"
            placeholder="z.B. 150000"
            min="0"
            step="1000"
          />
        </div>

        <div v-if="schwellenwertInfo" class="info-box" :class="schwellenwertInfo.type">
          <div class="info-box-content">
            <strong>{{ schwellenwertInfo.label }}</strong>
            <p>{{ schwellenwertInfo.text }}</p>
            <div class="info-box-verfahren">→ {{ schwellenwertInfo.verfahren }}</div>
          </div>
        </div>

        <OptionenPanel
          v-if="optionen"
          :ergebnis="optionen"
          v-model:merkmale="merkmale"
          :nur-ids="['EP-01']"
          mit-fragen
          titel="Verfahrensart – Ihre Optionen"
        />
      </div>

      <!-- Step 4: Struktur -->
      <div v-show="currentStep === 4" class="step-content">
        <div class="form-group">
          <label>Vergabestruktur</label>
          <div class="option-cards horizontal">
            <div
              v-for="opt in [
                { value: 'einzelvergabe', label: 'Einzelvergabe' },
                { value: 'rahmenvereinbarung', label: 'Rahmenvereinbarung' },
                { value: 'dps', label: 'Dynamisches Beschaffungssystem' },
              ]"
              :key="opt.value"
              class="option-card compact"
              :class="{ selected: form.struktur === opt.value }"
              @click="form.struktur = opt.value"
            >
              {{ opt.label }}
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Laufzeit (Monate)</label>
            <input v-model="form.laufzeit_monate" type="number" class="form-input" placeholder="z.B. 24" />
          </div>
          <div class="form-group">
            <label>Verlängerungsoptionen</label>
            <input v-model="form.verlaengerung_optionen" class="form-input" placeholder="z.B. 2x 12 Monate" />
          </div>
        </div>
      
        <OptionenPanel
          v-if="optionen"
          :ergebnis="optionen"
          v-model:merkmale="merkmale"
          :ohne-ids="['EP-01']"
          titel="Gestaltung der Vergabe – Ihre Optionen"
        />
      </div>

      <!-- Step 5: Besonderheiten -->
      <div v-show="currentStep === 5" class="step-content">
        <p class="step-hint">Wählen Sie alle zutreffenden Besonderheiten:</p>
        <div class="chip-grid">
          <button
            v-for="b in besonderheitenOptions"
            :key="b"
            class="chip"
            :class="{ active: form.besonderheiten.includes(b) }"
            @click="toggleBesonderheit(b)"
          >
            {{ b }}
          </button>
        </div>
      </div>

      <!-- Step 6: Anforderung -->
      <div v-show="currentStep === 6" class="step-content">
        <div class="form-row">
          <div class="form-group">
            <label>Anfordernde Stelle / Fachbereich</label>
            <input v-model="form.anfordernde_stelle" class="form-input" placeholder="z.B. Facility Management" />
          </div>
          <div class="form-group">
            <label>Ansprechpartner</label>
            <input v-model="form.ansprechpartner_name" class="form-input" placeholder="Name" />
          </div>
        </div>

        <div class="form-group">
          <label>Begründung</label>
          <textarea v-model="form.begruendung" class="form-textarea" rows="3" placeholder="Warum ist diese Vergabe notwendig?"></textarea>
        </div>

        <div class="form-group">
          <label>Risikobewertung</label>
          <div class="option-cards horizontal">
            <div
              v-for="r in ['gering', 'mittel', 'hoch']"
              :key="r"
              class="option-card compact"
              :class="{ selected: form.risikobewertung === r, [`risk-${r}`]: true }"
              @click="form.risikobewertung = r"
            >
              {{ r }}
            </div>
          </div>
        </div>
      </div>

      <!-- Step 7: Zusammenfassung -->
      <div v-show="currentStep === 7" class="step-content">
        <div class="summary-final card">
          <h3>Vergabe-Zusammenfassung</h3>
          <div class="summary-grid">
            <div class="summary-item"><span class="summary-label">Auftraggeber</span><span>{{ form.auftraggeber_typ }}</span></div>
            <div class="summary-item"><span class="summary-label">Leistungsart</span><span>{{ form.leistungsart }}</span></div>
            <div class="summary-item"><span class="summary-label">Beschreibung</span><span>{{ form.leistungsbeschreibung }}</span></div>
            <div class="summary-item"><span class="summary-label">Volumen</span><span class="mono">€ {{ parseFloat(form.volumen_netto || 0).toLocaleString('de-DE') }}</span></div>
            <div class="summary-item" v-if="schwellenwertInfo"><span class="summary-label">Verfahrensart</span><span class="badge" :class="'badge-' + schwellenwertInfo.type">{{ schwellenwertInfo.verfahren }}</span></div>
            <div class="summary-item"><span class="summary-label">Struktur</span><span>{{ form.struktur }}</span></div>
            <div class="summary-item" v-if="form.besonderheiten.length"><span class="summary-label">Besonderheiten</span><span>{{ form.besonderheiten.join(', ') }}</span></div>
            <div class="summary-item" v-if="form.risikobewertung"><span class="summary-label">Risiko</span><span class="badge" :class="{ 'badge-success': form.risikobewertung === 'gering', 'badge-warning': form.risikobewertung === 'mittel', 'badge-danger': form.risikobewertung === 'hoch' }">{{ form.risikobewertung }}</span></div>
          </div>
        </div>

        <div v-if="error" class="error-box" role="alert">{{ error }}</div>

        <div class="submit-actions">
          <button class="btn btn-primary" @click="submitVergabe(true)" :disabled="saving">
            {{ saving ? 'Speichere...' : 'Als Entwurf speichern' }}
          </button>
          <button class="btn btn-accent" @click="submitVergabe(false)" :disabled="saving">
            {{ saving ? 'Speichere...' : 'Speichern & zur Freigabe' }}
          </button>
        </div>
      </div>

      <!-- Navigation -->
      <div class="step-nav" v-if="currentStep < 7">
        <button class="btn btn-outline" @click="prevStep" :disabled="currentStep === 1">Zurück</button>
        <button class="btn btn-primary" @click="nextStep" :disabled="!canProceed">Weiter</button>
      </div>
      <div class="step-nav" v-else>
        <button class="btn btn-outline" @click="prevStep">Zurück</button>
      </div>
    </div>

    <!-- Live Summary (Desktop) -->
    <aside class="advisor-summary">
      <h3 class="summary-title">Live-Zusammenfassung</h3>
      <div class="summary-list">
        <div class="summary-row" :class="{ filled: form.auftraggeber_typ }">
          <span class="summary-key">Auftraggeber</span>
          <span class="summary-val">{{ form.auftraggeber_typ || '—' }}</span>
        </div>
        <div class="summary-row" :class="{ filled: form.leistungsart }">
          <span class="summary-key">Leistungsart</span>
          <span class="summary-val">{{ form.leistungsart || '—' }}</span>
        </div>
        <div class="summary-row" :class="{ filled: form.volumen_netto }">
          <span class="summary-key">Volumen</span>
          <span class="summary-val mono">{{ form.volumen_netto ? '€ ' + parseFloat(form.volumen_netto).toLocaleString('de-DE') : '—' }}</span>
        </div>
        <div class="summary-row" :class="{ filled: schwellenwertInfo }">
          <span class="summary-key">Verfahren</span>
          <span class="summary-val">{{ schwellenwertInfo?.verfahren || '—' }}</span>
        </div>
        <div class="summary-row" :class="{ filled: schwellenwertInfo }">
          <span class="summary-key">Regime</span>
          <span class="summary-val">{{ schwellenwertInfo?.regime?.toUpperCase() || '—' }}</span>
        </div>
        <div class="summary-row" :class="{ filled: form.struktur !== 'einzelvergabe' }">
          <span class="summary-key">Struktur</span>
          <span class="summary-val">{{ form.struktur }}</span>
        </div>
        <div class="summary-row" :class="{ filled: form.besonderheiten.length }">
          <span class="summary-key">Besonderheiten</span>
          <span class="summary-val">{{ form.besonderheiten.length ? form.besonderheiten.join(', ') : '—' }}</span>
        </div>
        <div class="summary-row" :class="{ filled: form.risikobewertung !== 'gering' }">
          <span class="summary-key">Risiko</span>
          <span class="summary-val">{{ form.risikobewertung }}</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.advisor-layout {
  display: flex;
  gap: 32px;
  max-width: 1200px;
}

.advisor-form { flex: 1; min-width: 0; }

.advisor-summary {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.summary-title {
  font-family: var(--font-data);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--ink-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.summary-list { display: flex; flex-direction: column; gap: 10px; }

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  opacity: .5;
  transition: opacity var(--transition);
}
.summary-row.filled { opacity: 1; }
.summary-key { color: var(--ink-secondary); }
.summary-val { font-weight: 500; text-align: right; }

/* Progress */
.progress-bar {
  height: 4px;
  background: var(--surface-sunken);
  border-radius: 2px;
  margin-bottom: 24px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width .3s ease;
}

.step-indicator {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--ink-muted);
}

.step-title {
  font-family: var(--font-data);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
}

.step-content { min-height: 200px; }
.step-hint { color: var(--ink-secondary); font-size: 14px; margin-bottom: 16px; }

/* Option Cards */
.option-cards { display: flex; flex-direction: column; gap: 10px; }
.option-cards.horizontal { flex-direction: row; flex-wrap: wrap; }

.option-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition);
  background: var(--surface-raised);
}
.option-card:hover { border-color: var(--trust); }
.option-card.selected {
  border-color: var(--trust);
  background: var(--info-bg);
}
.option-card.compact {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  justify-content: center;
  flex: 1;
  text-align: center;
  text-transform: capitalize;
}

.option-radio {
  width: 18px; height: 18px;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all var(--transition);
}
.option-radio.checked {
  border-color: var(--trust);
  background: var(--trust);
  box-shadow: inset 0 0 0 3px var(--surface-raised);
}

.option-label { font-weight: 500; font-size: 14px; }
.option-desc { font-size: 12px; color: var(--ink-muted); margin-top: 2px; }

/* Detection */
.detection-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 2px solid var(--success);
  border-radius: var(--radius);
  background: var(--success-bg);
  margin: 12px 0;
}
.detection-icon { color: var(--success); font-size: 18px; font-weight: bold; }
.detection-score { color: var(--ink-muted); font-size: 12px; margin-left: 4px; }

/* Info Box */
.info-box {
  padding: 16px;
  border-radius: var(--radius-lg);
  margin-top: 16px;
}
.info-box.success { background: var(--success-bg); border: 1px solid var(--success); }
.info-box.warning { background: var(--warning-bg); border: 1px solid var(--warning); }
.info-box.info { background: var(--info-bg); border: 1px solid var(--info); }
.info-box.danger { background: var(--alert-bg); border: 1px solid var(--alert); }
.info-box p { margin-top: 4px; font-size: 13px; color: var(--ink-secondary); }
.info-box-verfahren {
  margin-top: 8px;
  font-family: var(--font-data);
  font-weight: 600;
  font-size: 14px;
}

/* Chips */
.chip-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-raised);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
  font-family: var(--font-body);
}
.chip:hover { border-color: var(--trust); }
.chip.active { background: var(--trust); color: var(--ink-on-solid); border-color: var(--trust); }

/* Form */
.form-row { display: flex; gap: 16px; }
.form-row .form-group { flex: 1; }
.volume-input { font-family: var(--font-data); font-size: 18px; font-weight: 600; }

/* Nav */
.step-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

/* Summary Final */
.summary-final h3 { font-family: var(--font-data); margin-bottom: 16px; }
.summary-grid { display: flex; flex-direction: column; gap: 10px; }
.summary-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.summary-label { color: var(--ink-secondary); }

.submit-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.error-box {
  background: var(--alert-bg);
  color: var(--alert);
  padding: 12px;
  border-radius: var(--radius);
  margin-top: 16px;
}

.risk-gering.selected { border-color: var(--success); background: var(--success-bg); }
.risk-mittel.selected { border-color: var(--warning); background: var(--warning-bg); }
.risk-hoch.selected { border-color: var(--alert); background: var(--alert-bg); }

@media (max-width: 900px) {
  .advisor-layout { flex-direction: column; }
  .advisor-summary { width: 100%; position: static; }
  .form-row { flex-direction: column; }
}
</style>
