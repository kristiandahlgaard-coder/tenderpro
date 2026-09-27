<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import api from '../api/index.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const vergabe = ref(null)
const audit = ref([])
const loading = ref(true)
const activeTab = ref('uebersicht')
const showDeleteConfirm = ref(false)
const submitting = ref(false)

const tabs = [
  { key: 'uebersicht', label: 'Übersicht', icon: '◫' },
  { key: 'formulare', label: 'Formularsatz', icon: '📄' },
  { key: 'freigabe', label: 'Freigabenkette', icon: '✓' },
  { key: 'fristen', label: 'Fristen', icon: '⏱' },
  { key: 'kommunikation', label: 'Kommunikation', icon: '💬' },
  { key: 'akte', label: 'Vergabeakte', icon: '📁' },
]

const statusLabels = {
  entwurf: 'Entwurf',
  in_pruefung: 'In Prüfung',
  in_freigabe: 'In Freigabe',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
  bekanntgemacht: 'Bekanntgemacht',
  angebotsphase: 'Angebotsphase',
  oeffnung: 'Öffnung',
  wertung: 'Wertung',
  zuschlag: 'Zuschlag',
  abgeschlossen: 'Abgeschlossen',
  archiviert: 'Archiviert',
  storniert: 'Storniert',
}

const statusFlow = [
  'entwurf', 'in_freigabe', 'genehmigt', 'bekanntgemacht',
  'angebotsphase', 'oeffnung', 'wertung', 'zuschlag', 'abgeschlossen'
]

const currentPhaseIndex = computed(() => {
  if (!vergabe.value) return -1
  const idx = statusFlow.indexOf(vergabe.value.status)
  return idx >= 0 ? idx : -1
})

const besonderheiten = computed(() => {
  if (!vergabe.value?.besonderheiten) return []
  try {
    const parsed = typeof vergabe.value.besonderheiten === 'string'
      ? JSON.parse(vergabe.value.besonderheiten)
      : vergabe.value.besonderheiten
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})

async function loadVergabe() {
  loading.value = true
  try {
    const { data } = await api.get(`/vergaben/${route.params.id}`)
    vergabe.value = data
  } catch (err) {
    console.error('Vergabe laden fehlgeschlagen:', err)
    if (err.response?.status === 404) router.push('/vergaben')
  } finally {
    loading.value = false
  }
}

async function loadAudit() {
  try {
    const { data } = await api.get(`/audit/${route.params.id}`)
    audit.value = data
  } catch (err) {
    console.error('Audit laden fehlgeschlagen:', err)
  }
}

onMounted(() => {
  loadVergabe()
  loadAudit()
})

async function submitForFreigabe() {
  if (submitting.value) return
  submitting.value = true
  try {
    await api.post(`/vergaben/${route.params.id}/submit`)
    await loadVergabe()
    await loadAudit()
  } catch (err) {
    alert(err.response?.data?.error || 'Einreichen fehlgeschlagen')
  } finally {
    submitting.value = false
  }
}

async function deleteVergabe() {
  try {
    await api.delete(`/vergaben/${route.params.id}`)
    router.push('/vergaben')
  } catch (err) {
    alert(err.response?.data?.error || 'Löschen fehlgeschlagen')
  }
}

function formatCurrency(val) {
  if (!val) return '—'
  return parseFloat(val).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE')
}

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function daysUntil(d) {
  return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24))
}

function regimeLabel(r) {
  const labels = { direkt: 'Direktvergabe', national: 'National', eu: 'EU-weit' }
  return labels[r] || r || '—'
}

function strukturLabel(s) {
  const labels = { einzelvergabe: 'Einzelvergabe', rahmen: 'Rahmenvertrag', dps: 'Dyn. Beschaffungssystem' }
  return labels[s] || s || '—'
}

function risikoLabel(r) {
  const labels = { gering: 'Gering', mittel: 'Mittel', hoch: 'Hoch', kritisch: 'Kritisch' }
  return labels[r] || r || '—'
}

function aktionLabel(a) {
  const labels = {
    vergabe_erstellt: 'Vergabe erstellt',
    zur_freigabe_eingereicht: 'Zur Freigabe eingereicht',
    freigabe_erteilt: 'Freigabe erteilt',
    freigabe_abgelehnt: 'Freigabe abgelehnt',
  }
  return labels[a] || a?.replace(/_/g, ' ') || '—'
}
</script>

<template>
  <div>
    <div v-if="loading" class="loading">Lädt...</div>

    <template v-else-if="vergabe">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <button class="btn btn-outline btn-sm" @click="router.push('/vergaben')">← Zurück</button>
          <div>
            <h1>{{ vergabe.vergabenummer }}</h1>
            <p class="header-sub">{{ vergabe.leistungsbeschreibung }}</p>
          </div>
        </div>
        <div class="header-actions">
          <span class="status-pill large" :class="vergabe.status">
            <span class="status-dot" :class="vergabe.status"></span>
            {{ statusLabels[vergabe.status] || vergabe.status }}
          </span>
          <button
            v-if="vergabe.status === 'entwurf'"
            class="btn btn-accent"
            :disabled="submitting"
            @click="submitForFreigabe"
          >
            {{ submitting ? 'Wird eingereicht...' : '✓ Zur Freigabe einreichen' }}
          </button>
          <button
            v-if="vergabe.status === 'entwurf'"
            class="btn btn-outline btn-danger-outline"
            @click="showDeleteConfirm = true"
          >
            Löschen
          </button>
        </div>
      </div>

      <!-- Phase Timeline -->
      <div class="phase-timeline">
        <div
          v-for="(phase, idx) in statusFlow"
          :key="phase"
          class="phase-step"
          :class="{
            done: idx < currentPhaseIndex,
            active: idx === currentPhaseIndex,
            future: idx > currentPhaseIndex,
            rejected: vergabe.status === 'abgelehnt' && phase === 'in_freigabe'
          }"
        >
          <div class="phase-dot">
            <span v-if="idx < currentPhaseIndex">✓</span>
            <span v-else-if="vergabe.status === 'abgelehnt' && phase === 'in_freigabe'">✕</span>
          </div>
          <span class="phase-label">{{ statusLabels[phase] }}</span>
        </div>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          role="tab"
          :aria-selected="activeTab === tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">

        <!-- Übersicht -->
        <div v-if="activeTab === 'uebersicht'" class="tab-panel">
          <div class="detail-grid">
            <div class="detail-section card">
              <h3>Allgemeine Informationen</h3>
              <dl class="detail-list">
                <div class="dl-row">
                  <dt>Vergabenummer</dt>
                  <dd class="mono">{{ vergabe.vergabenummer }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Leistungsbeschreibung</dt>
                  <dd>{{ vergabe.leistungsbeschreibung }}</dd>
                </div>
                <div class="dl-row" v-if="vergabe.projektbezeichnung">
                  <dt>Projektbezeichnung</dt>
                  <dd>{{ vergabe.projektbezeichnung }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Leistungsart</dt>
                  <dd><span class="badge badge-info">{{ vergabe.leistungsart }}</span></dd>
                </div>
                <div class="dl-row">
                  <dt>Auftraggeber-Typ</dt>
                  <dd>{{ vergabe.auftraggeber_typ }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Struktur</dt>
                  <dd>{{ strukturLabel(vergabe.struktur) }}</dd>
                </div>
              </dl>
            </div>

            <div class="detail-section card">
              <h3>Finanzen & Schwellenwert</h3>
              <dl class="detail-list">
                <div class="dl-row">
                  <dt>Volumen (netto)</dt>
                  <dd class="mono highlight">{{ formatCurrency(vergabe.volumen_netto) }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Regime</dt>
                  <dd>
                    <span class="badge" :class="{
                      'badge-success': vergabe.schwellenwert_regime === 'direkt',
                      'badge-warning': vergabe.schwellenwert_regime === 'national',
                      'badge-danger': vergabe.schwellenwert_regime === 'eu'
                    }">{{ regimeLabel(vergabe.schwellenwert_regime) }}</span>
                  </dd>
                </div>
                <div class="dl-row">
                  <dt>Verfahrensart</dt>
                  <dd>{{ vergabe.verfahrensart || '—' }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Rechtsgrundlage</dt>
                  <dd>{{ vergabe.rechtsgrundlage || '—' }}</dd>
                </div>
              </dl>
            </div>

            <div class="detail-section card">
              <h3>Zeitplan</h3>
              <dl class="detail-list">
                <div class="dl-row" v-if="vergabe.laufzeit_monate">
                  <dt>Laufzeit</dt>
                  <dd>{{ vergabe.laufzeit_monate }} Monate</dd>
                </div>
                <div class="dl-row" v-if="vergabe.verlaengerung_optionen">
                  <dt>Verlängerung</dt>
                  <dd>{{ vergabe.verlaengerung_optionen }}</dd>
                </div>
                <div class="dl-row" v-if="vergabe.geplanter_start">
                  <dt>Geplanter Start</dt>
                  <dd>{{ formatDate(vergabe.geplanter_start) }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Erstellt am</dt>
                  <dd>{{ formatDateTime(vergabe.created_at) }}</dd>
                </div>
                <div class="dl-row">
                  <dt>Erstellt von</dt>
                  <dd>{{ vergabe.ersteller_name }}</dd>
                </div>
              </dl>
            </div>

            <div class="detail-section card">
              <h3>Risiko & Besonderheiten</h3>
              <dl class="detail-list">
                <div class="dl-row">
                  <dt>Risikobewertung</dt>
                  <dd>
                    <span class="badge" :class="{
                      'badge-success': vergabe.risikobewertung === 'gering',
                      'badge-warning': vergabe.risikobewertung === 'mittel',
                      'badge-danger': vergabe.risikobewertung === 'hoch' || vergabe.risikobewertung === 'kritisch',
                    }">{{ risikoLabel(vergabe.risikobewertung) }}</span>
                  </dd>
                </div>
                <div class="dl-row" v-if="vergabe.anfordernde_stelle">
                  <dt>Anfordernde Stelle</dt>
                  <dd>{{ vergabe.anfordernde_stelle }}</dd>
                </div>
                <div class="dl-row" v-if="vergabe.ansprechpartner_name">
                  <dt>Ansprechpartner</dt>
                  <dd>{{ vergabe.ansprechpartner_name }}</dd>
                </div>
              </dl>
              <div v-if="besonderheiten.length" class="besonderheiten-chips">
                <span class="chip" v-for="b in besonderheiten" :key="b">{{ b }}</span>
              </div>
            </div>
          </div>

          <div v-if="vergabe.begruendung" class="card mt">
            <h3>Begründung</h3>
            <p class="body-text">{{ vergabe.begruendung }}</p>
          </div>

          <div v-if="vergabe.zusaetzliche_notizen" class="card mt">
            <h3>Zusätzliche Notizen</h3>
            <p class="body-text">{{ vergabe.zusaetzliche_notizen }}</p>
          </div>
        </div>

        <!-- Formularsatz -->
        <div v-if="activeTab === 'formulare'" class="tab-panel">
          <div v-if="!vergabe.formulare?.length" class="empty card">
            Keine Formulare zugewiesen.
          </div>
          <div v-else class="form-list">
            <div v-for="f in vergabe.formulare" :key="f.id" class="form-card card">
              <div class="form-card-header">
                <div>
                  <h4>{{ f.name }}</h4>
                  <span class="form-meta">{{ f.kategorie }} · {{ f.phase }}</span>
                </div>
                <span class="badge" :class="{
                  'badge-success': f.status === 'abgeschlossen',
                  'badge-warning': f.status === 'in_bearbeitung',
                  'badge-info': f.status === 'nicht_begonnen',
                }">
                  {{ f.status === 'abgeschlossen' ? 'Fertig' : f.status === 'in_bearbeitung' ? 'In Bearbeitung' : 'Offen' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Freigabenkette -->
        <div v-if="activeTab === 'freigabe'" class="tab-panel">
          <div v-if="!vergabe.freigabenkette?.length" class="empty card">
            {{ vergabe.status === 'entwurf'
              ? 'Die Freigabekette wird beim Einreichen aus den dann gültigen Angaben berechnet.'
              : 'Keine Freigabekette vorhanden.' }}
          </div>
          <div v-else class="approval-chain">
            <div
              v-for="(glied, idx) in vergabe.freigabenkette"
              :key="glied.id"
              class="approval-step"
            >
              <div class="approval-connector" v-if="idx > 0"></div>
              <div class="approval-card card" :class="glied.status">
                <div class="approval-header">
                  <span class="approval-stufe">Stufe {{ glied.stufe }}</span>
                  <span class="badge" :class="{
                    'badge-success': glied.status === 'genehmigt',
                    'badge-danger': glied.status === 'abgelehnt',
                    'badge-warning': glied.status === 'ausstehend',
                  }">
                    {{ glied.status === 'genehmigt' ? 'Genehmigt' : glied.status === 'abgelehnt' ? 'Abgelehnt' : 'Ausstehend' }}
                  </span>
                </div>
                <div class="approval-body">
                  <div class="approval-role">{{ glied.rolle }}</div>
                  <div class="approval-name" v-if="glied.freigeber_name">{{ glied.freigeber_name }}</div>
                  <div v-if="glied.kommentar" class="approval-comment">
                    „{{ glied.kommentar }}"
                  </div>
                  <div v-if="glied.entschieden_at" class="approval-date">
                    {{ formatDateTime(glied.entschieden_at) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Fristen -->
        <div v-if="activeTab === 'fristen'" class="tab-panel">
          <div v-if="!vergabe.fristen?.length" class="empty card">
            Keine Fristen definiert.
          </div>
          <div v-else class="fristen-list card">
            <div
              v-for="frist in vergabe.fristen"
              :key="frist.id"
              class="frist-item"
              :class="{ overdue: !frist.erledigt && daysUntil(frist.frist_datum) < 0, urgent: !frist.erledigt && daysUntil(frist.frist_datum) >= 0 && daysUntil(frist.frist_datum) <= 3 }"
            >
              <div class="frist-check">
                <span v-if="frist.erledigt" class="frist-done">✓</span>
                <span v-else class="frist-pending">○</span>
              </div>
              <div class="frist-info">
                <div class="frist-bezeichnung" :class="{ done: frist.erledigt }">{{ frist.bezeichnung }}</div>
                <div class="frist-date-line">
                  {{ formatDate(frist.frist_datum) }}
                  <span v-if="!frist.erledigt" class="frist-countdown" :class="{ urgent: daysUntil(frist.frist_datum) <= 3, overdue: daysUntil(frist.frist_datum) < 0 }">
                    {{ daysUntil(frist.frist_datum) < 0 ? `${Math.abs(daysUntil(frist.frist_datum))} Tage überfällig` : `in ${daysUntil(frist.frist_datum)} Tagen` }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Kommunikation -->
        <div v-if="activeTab === 'kommunikation'" class="tab-panel">
          <div class="empty card">
            <p>Bieterkommunikation wird in einer zukünftigen Version verfügbar sein.</p>
          </div>
        </div>

        <!-- Vergabeakte -->
        <div v-if="activeTab === 'akte'" class="tab-panel">
          <h3 class="section-title">Audit-Trail</h3>
          <div v-if="!audit.length" class="empty card">
            Keine Einträge vorhanden.
          </div>
          <div v-else class="audit-list card">
            <div v-for="log in audit" :key="log.id" class="audit-row">
              <div class="audit-dot"></div>
              <div class="audit-body">
                <span class="audit-action">{{ aktionLabel(log.aktion) }}</span>
                <span class="audit-user">{{ log.user_name }}</span>
              </div>
              <div class="audit-time">{{ formatDateTime(log.created_at) }}</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Delete Confirm Dialog -->
      <div v-if="showDeleteConfirm" class="dialog-overlay" @click.self="showDeleteConfirm = false">
        <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <h3 id="delete-dialog-title">Vergabe löschen?</h3>
          <p>Soll die Vergabe <strong>{{ vergabe.vergabenummer }}</strong> wirklich gelöscht werden? Dies kann nicht rückgängig gemacht werden.</p>
          <div class="dialog-actions">
            <button class="btn btn-outline" @click="showDeleteConfirm = false">Abbrechen</button>
            <button class="btn btn-danger" @click="deleteVergabe">Endgültig löschen</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.header-left h1 { margin: 0; }
.header-sub {
  color: var(--ink-secondary);
  font-size: 14px;
  margin-top: 2px;
  max-width: 500px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.status-pill.large { font-size: 14px; padding: 6px 14px; border-radius: 20px; background: var(--surface-sunken); }

/* Phase Timeline */
.phase-timeline {
  display: flex;
  align-items: flex-start;
  gap: 0;
  margin: 24px 0;
  overflow-x: auto;
  padding-bottom: 8px;
}
.phase-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 80px;
  position: relative;
}
.phase-step::after {
  content: '';
  position: absolute;
  top: 12px;
  left: 50%;
  right: -50%;
  height: 2px;
  background: var(--border);
}
.phase-step:last-child::after { display: none; }
.phase-step.done::after { background: var(--trust); }
.phase-step.active::after { background: linear-gradient(90deg, var(--trust), var(--border)); }

.phase-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-raised);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  z-index: 1;
  color: var(--ink-muted);
}
.phase-step.done .phase-dot {
  background: var(--trust);
  border-color: var(--trust);
  color: var(--ink-on-solid);
}
.phase-step.active .phase-dot {
  border-color: var(--accent);
  box-shadow: var(--shadow-accent-glow);
  background: var(--surface-raised);
}
.phase-step.rejected .phase-dot {
  background: var(--alert);
  border-color: var(--alert);
  color: var(--ink-on-solid);
}
.phase-label {
  font-size: 11px;
  color: var(--ink-muted);
  text-align: center;
  line-height: 1.2;
}
.phase-step.active .phase-label { color: var(--accent); font-weight: 600; }
.phase-step.done .phase-label { color: var(--trust); }

/* Tabs */
.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--border);
  margin-bottom: 20px;
  overflow-x: auto;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  background: none;
  color: var(--ink-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  white-space: nowrap;
  font-family: var(--font-body);
  transition: all var(--transition);
}
.tab-btn:hover { color: var(--ink-primary); }
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.tab-icon { font-size: 14px; }

/* Detail Grid */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.detail-section h3 {
  font-family: var(--font-data);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--ink-primary);
}
.detail-list { display: flex; flex-direction: column; gap: 0; }
.dl-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  gap: 16px;
}
.dl-row:last-child { border-bottom: none; }
.dl-row dt {
  font-size: 13px;
  color: var(--ink-secondary);
  flex-shrink: 0;
  min-width: 120px;
}
.dl-row dd {
  font-size: 13px;
  text-align: right;
  word-break: break-word;
}
.highlight { color: var(--trust); font-weight: 600; }
.mono { font-family: var(--font-data); }

.besonderheiten-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.chip {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--ink-secondary);
}

.mt { margin-top: 16px; }
.body-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-secondary);
  white-space: pre-wrap;
}

/* Formularsatz */
.form-list { display: flex; flex-direction: column; gap: 8px; }
.form-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.form-card h4 { font-size: 14px; margin: 0; }
.form-meta { font-size: 12px; color: var(--ink-muted); }

/* Freigabenkette */
.approval-chain { display: flex; flex-direction: column; align-items: flex-start; }
.approval-step { position: relative; width: 100%; max-width: 500px; }
.approval-connector {
  width: 2px;
  height: 16px;
  background: var(--border);
  margin-left: 24px;
}
.approval-card { position: relative; }
.approval-card.genehmigt { border-left: 3px solid var(--success); }
.approval-card.abgelehnt { border-left: 3px solid var(--alert); }
.approval-card.ausstehend { border-left: 3px solid var(--warning); }
.approval-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.approval-stufe {
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.approval-role {
  font-weight: 500;
  font-size: 14px;
  text-transform: capitalize;
  margin-bottom: 2px;
}
.approval-name { font-size: 13px; color: var(--ink-secondary); }
.approval-comment {
  font-size: 13px;
  color: var(--ink-secondary);
  font-style: italic;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--surface-sunken);
  border-radius: var(--radius);
}
.approval-date { font-size: 12px; color: var(--ink-muted); margin-top: 6px; }

/* Fristen */
.fristen-list { display: flex; flex-direction: column; gap: 0; }
.frist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.frist-item:last-child { border-bottom: none; }
.frist-item.urgent { background: rgba(255,193,7,.06); margin: 0 -24px; padding: 12px 24px; }
.frist-item.overdue { background: var(--alert-bg); margin: 0 -24px; padding: 12px 24px; }
.frist-check { font-size: 16px; flex-shrink: 0; width: 24px; text-align: center; }
.frist-done { color: var(--success); }
.frist-pending { color: var(--ink-muted); }
.frist-bezeichnung { font-size: 14px; font-weight: 500; }
.frist-bezeichnung.done { text-decoration: line-through; color: var(--ink-muted); }
.frist-date-line { font-size: 12px; color: var(--ink-muted); margin-top: 2px; display: flex; gap: 8px; }
.frist-countdown { font-weight: 600; }
.frist-countdown.urgent { color: var(--warning); }
.frist-countdown.overdue { color: var(--alert); }

/* Audit */
.audit-list { display: flex; flex-direction: column; }
.audit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.audit-row:last-child { border-bottom: none; }
.audit-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--trust);
  flex-shrink: 0;
}
.audit-body { flex: 1; }
.audit-action { font-size: 13px; font-weight: 500; }
.audit-user { font-size: 12px; color: var(--ink-secondary); margin-left: 8px; }
.audit-time { font-size: 11px; color: var(--ink-muted); white-space: nowrap; }

/* Dialog — uses global .dialog-overlay, .dialog, .dialog-actions from App.vue */
.dialog {
  max-width: 420px;
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 12px; }
  .header-left { flex-direction: column; }
  .detail-grid { grid-template-columns: 1fr; }
  .phase-timeline { gap: 0; }
  .phase-label { font-size: 10px; }
}
</style>
