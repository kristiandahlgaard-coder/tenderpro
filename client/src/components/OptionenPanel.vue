<script setup>
/**
 * OptionenPanel — zeigt priorisierte Handlungsoptionen aus dem Optionskatalog.
 * Props:
 *   ergebnis  — Antwort von GET /api/optionen
 *   merkmale  — { standardisiert: true|false, ... } (v-model:merkmale)
 *   nurIds    — optional: nur diese Entscheidungspunkte anzeigen (z.B. ['EP-01'])
 *   ohneIds   — optional: diese Entscheidungspunkte ausblenden
 *   mitFragen — Klärungsfragen anzeigen
 */
import { ref, computed } from 'vue'

const props = defineProps({
  ergebnis: { type: Object, default: null },
  merkmale: { type: Object, default: () => ({}) },
  nurIds: { type: Array, default: null },
  ohneIds: { type: Array, default: null },
  mitFragen: { type: Boolean, default: false },
  titel: { type: String, default: 'Ihre Handlungsoptionen' },
})
const emit = defineEmits(['update:merkmale'])

const offen = ref({})

const punkte = computed(() => {
  const eps = props.ergebnis?.entscheidungspunkte || []
  return eps.filter(ep =>
    (!props.nurIds || props.nurIds.includes(ep.id)) &&
    (!props.ohneIds || !props.ohneIds.includes(ep.id))
  )
})

const fragen = computed(() => props.ergebnis?.offeneFragen?.slice(0, 4) || [])

// Bereits beantwortete Merkmale, damit sie korrigiert werden können
const beantwortet = computed(() =>
  Object.entries(props.merkmale).filter(([, v]) => typeof v === 'boolean')
)

function setMerkmal(key, value) {
  emit('update:merkmale', { ...props.merkmale, [key]: value })
}
function resetMerkmal(key) {
  const copy = { ...props.merkmale }
  delete copy[key]
  emit('update:merkmale', copy)
}

function toggle(id) {
  offen.value[id] = !offen.value[id]
}

const grad = { gruen: '🟢 gesichert', gelb: '🟡 Einzelentscheidung/Sekundärquelle', rot: '🔴 offen' }
</script>

<template>
  <section v-if="ergebnis" class="optionen" aria-live="polite">
    <header class="optionen-head">
      <h3>{{ titel }}</h3>
      <span class="optionen-meta">
        Landesregeln: {{ ergebnis.landesPack?.name }} · Stand {{ ergebnis.stand || ergebnis.landesPack?.stand }}
      </span>
    </header>

    <p v-if="!ergebnis.katalogVerfuegbar" class="optionen-hinweis">
      {{ ergebnis.hinweise?.[ergebnis.hinweise.length - 1] }}
    </p>

    <ul v-if="ergebnis.hinweise?.length && ergebnis.katalogVerfuegbar" class="optionen-hinweise">
      <li v-for="(h, i) in ergebnis.hinweise" :key="i">{{ h }}</li>
    </ul>

    <!-- Klärungsfragen -->
    <div v-if="mitFragen && (fragen.length || beantwortet.length)" class="fragen">
      <div class="fragen-titel">Präzisieren Sie – das verbessert die Empfehlung:</div>
      <div v-for="f in fragen" :key="f.key" class="frage">
        <span>{{ f.frage }}</span>
        <span class="frage-actions">
          <button type="button" class="chip-btn" @click="setMerkmal(f.key, true)">Ja</button>
          <button type="button" class="chip-btn" @click="setMerkmal(f.key, false)">Nein</button>
        </span>
      </div>
      <div v-if="beantwortet.length" class="beantwortet">
        <button
          v-for="[k, v] in beantwortet" :key="k" type="button" class="tag"
          :title="'Antwort zurücksetzen'" @click="resetMerkmal(k)"
        >{{ k.replace(/_/g, ' ') }}: {{ v ? 'ja' : 'nein' }} ✕</button>
      </div>
    </div>

    <!-- Entscheidungspunkte -->
    <div v-for="ep in punkte" :key="ep.id" class="ep">
      <div class="ep-titel">{{ ep.titel }}</div>
      <div class="ep-frage">{{ ep.frage }}</div>

      <div
        v-for="o in ep.optionen" :key="o.id"
        class="opt" :class="'rang-' + o.rang"
      >
        <button type="button" class="opt-head" :aria-expanded="!!offen[o.id]" @click="toggle(o.id)">
          <span class="badge" :class="'badge-rang-' + o.rang">{{ o.rangLabel }}</span>
          <span class="opt-titel">{{ o.titel }}</span>
          <span class="opt-chevron">{{ offen[o.id] ? '▾' : '▸' }}</span>
        </button>
        <p class="opt-kurz">{{ o.kurz }}</p>
        <div v-if="offen[o.id]" class="opt-details">
          <div v-if="o.voraussetzungen?.length">
            <strong>Voraussetzungen</strong>
            <ul><li v-for="(x, i) in o.voraussetzungen" :key="i">{{ x }}</li></ul>
          </div>
          <div v-if="o.pflichten?.length">
            <strong>Was dann zu tun ist</strong>
            <ul><li v-for="(x, i) in o.pflichten" :key="i">{{ x }}</li></ul>
          </div>
          <div v-if="o.risiken?.length">
            <strong>Risiken</strong>
            <ul><li v-for="(x, i) in o.risiken" :key="i">{{ x }}</li></ul>
          </div>
          <div class="opt-recht">
            <span>{{ o.rechtsgrundlage }}</span>
            <span class="opt-grad">{{ grad[o.sicherheitsgrad] || o.sicherheitsgrad }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.optionen {
  margin-top: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  padding: 16px;
}
.optionen-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: baseline; }
.optionen-head h3 { font-family: var(--font-data); font-size: var(--text-md); margin: 0; }
.optionen-meta { font-size: var(--text-xs); color: var(--ink-muted); }
.optionen-hinweis { color: var(--ink-secondary); font-size: var(--text-sm); }
.optionen-hinweise {
  margin: 12px 0 0; padding: 10px 12px 10px 28px;
  background: var(--warning-bg); border-radius: var(--radius);
  font-size: var(--text-sm); color: var(--ink);
}

.fragen { margin-top: 14px; padding: 12px; background: var(--info-bg); border-radius: var(--radius); }
.fragen-titel { font-weight: 600; font-size: var(--text-sm); margin-bottom: 8px; }
.frage {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 6px 0; font-size: var(--text-sm); border-top: 1px solid var(--border);
}
.frage:first-of-type { border-top: none; }
.frage-actions { display: flex; gap: 6px; flex-shrink: 0; }
.chip-btn, .tag {
  border: 1px solid var(--border-strong); background: var(--surface-raised); color: var(--ink);
  border-radius: var(--radius-full); padding: 4px 12px; font-size: var(--text-xs);
  cursor: pointer; font-family: var(--font-body); min-height: 32px;
}
.chip-btn:hover, .tag:hover { border-color: var(--trust); }
.chip-btn:focus-visible, .tag:focus-visible, .opt-head:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.beantwortet { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }

.ep { margin-top: 18px; }
.ep-titel { font-weight: 700; font-size: var(--text-sm); }
.ep-frage { color: var(--ink-secondary); font-size: var(--text-xs); margin-bottom: 8px; }

.opt {
  border: 1px solid var(--border); border-left-width: 4px;
  border-radius: var(--radius); padding: 10px 12px; margin-bottom: 8px;
}
.opt.rang-1 { border-left-color: var(--success); background: var(--success-bg); }
.opt.rang-2 { border-left-color: var(--trust); }
.opt.rang-3 { border-left-color: var(--warning); }
.opt-head {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: none; border: none; padding: 0; cursor: pointer; text-align: left;
  color: var(--ink); font-family: var(--font-body);
}
.opt-titel { font-weight: 600; font-size: var(--text-sm); flex: 1; }
.opt-chevron { color: var(--ink-muted); }
.opt-kurz { margin: 6px 0 0; font-size: var(--text-sm); color: var(--ink-secondary); }
.opt-details { margin-top: 10px; font-size: var(--text-sm); display: grid; gap: 8px; }
.opt-details ul { margin: 4px 0 0; padding-left: 18px; }
.opt-recht {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px;
  font-size: var(--text-xs); color: var(--ink-muted); border-top: 1px solid var(--border); padding-top: 8px;
}
.badge {
  font-size: var(--text-xs); font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full);
  white-space: nowrap;
}
.badge-rang-1 { background: var(--success); color: var(--ink-on-solid); }
.badge-rang-2 { background: var(--info-bg); color: var(--trust); border: 1px solid var(--trust); }
.badge-rang-3 { background: var(--warning-bg); color: var(--ink); border: 1px solid var(--warning); }

@media (max-width: 600px) {
  .frage { flex-direction: column; align-items: flex-start; }
}
</style>
