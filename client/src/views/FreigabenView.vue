<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/index.js'

const router = useRouter()
const freigaben = ref([])
const loading = ref(true)
const actionLoading = ref(null)
const showRejectDialog = ref(null)
const rejectKommentar = ref('')
const approveKommentar = ref('')
const successMessage = ref('')

async function loadFreigaben() {
  loading.value = true
  try {
    const { data } = await api.get('/freigaben')
    freigaben.value = data
  } catch (err) {
    console.error('Freigaben laden fehlgeschlagen:', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadFreigaben)

async function approve(freigabe) {
  actionLoading.value = freigabe.id
  try {
    const { data } = await api.post(`/freigaben/${freigabe.id}/approve`, {
      kommentar: approveKommentar.value || null
    })
    approveKommentar.value = ''
    successMessage.value = data.alle_erteilt
      ? `${freigabe.vergabenummer} — alle Freigaben erteilt, Vergabe genehmigt!`
      : `${freigabe.vergabenummer} — Freigabe erteilt.`
    setTimeout(() => { successMessage.value = '' }, 4000)
    await loadFreigaben()
  } catch (err) {
    alert(err.response?.data?.error || 'Genehmigung fehlgeschlagen')
  } finally {
    actionLoading.value = null
  }
}

async function reject(freigabe) {
  if (!rejectKommentar.value.trim()) return
  actionLoading.value = freigabe.id
  try {
    await api.post(`/freigaben/${freigabe.id}/reject`, {
      kommentar: rejectKommentar.value
    })
    showRejectDialog.value = null
    rejectKommentar.value = ''
    successMessage.value = `${freigabe.vergabenummer} — abgelehnt.`
    setTimeout(() => { successMessage.value = '' }, 4000)
    await loadFreigaben()
  } catch (err) {
    alert(err.response?.data?.error || 'Ablehnung fehlgeschlagen')
  } finally {
    actionLoading.value = null
  }
}

function formatCurrency(val) {
  if (!val) return '—'
  return parseFloat(val).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function risikoClass(r) {
  return { gering: 'badge-success', mittel: 'badge-warning', hoch: 'badge-danger', kritisch: 'badge-danger' }[r] || ''
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1>Freigaben <span class="count" v-if="freigaben.length">({{ freigaben.length }})</span></h1>
    </div>

    <div v-if="successMessage" class="success-toast" role="status">
      <span>✓</span> {{ successMessage }}
    </div>

    <div v-if="loading" class="loading">Lädt...</div>

    <div v-else-if="freigaben.length === 0" class="empty-state card">
      <div class="empty-icon">✓</div>
      <h3>Keine offenen Freigaben</h3>
      <p>Alle Freigaben wurden bearbeitet.</p>
    </div>

    <div v-else class="freigaben-list">
      <div
        v-for="f in freigaben"
        :key="f.id"
        class="freigabe-card card"
        :class="{ 'risk-hoch': f.risikobewertung === 'hoch' || f.risikobewertung === 'kritisch' }"
      >
        <div class="freigabe-top">
          <div class="freigabe-info">
            <div class="freigabe-nummer" @click="router.push(`/vergaben/${f.vergabe_id}`)">
              {{ f.vergabenummer }}
            </div>
            <h3 class="freigabe-leistung">{{ f.leistungsbeschreibung }}</h3>
            <div class="freigabe-meta">
              <span class="badge badge-info">{{ f.leistungsart }}</span>
              <span class="badge" :class="risikoClass(f.risikobewertung)">
                Risiko: {{ f.risikobewertung }}
              </span>
              <span class="meta-item">{{ f.verfahrensart }}</span>
            </div>
          </div>
          <div class="freigabe-volume">
            <div class="volume-label">Volumen</div>
            <div class="volume-value">{{ formatCurrency(f.volumen_netto) }}</div>
          </div>
        </div>

        <div class="freigabe-requester">
          <span class="requester-label">Beantragt von:</span>
          <span class="requester-name">{{ f.ersteller_name }}</span>
          <span v-if="f.ersteller_abteilung" class="requester-dept">· {{ f.ersteller_abteilung }}</span>
        </div>

        <div class="freigabe-role-info">
          Ihre Freigabe als <strong>{{ f.rolle }}</strong> (Stufe {{ f.stufe }})
        </div>

        <!-- Comment for approval -->
        <div class="freigabe-comment">
          <input
            v-model="approveKommentar"
            class="form-input"
            placeholder="Kommentar (optional)"
          />
        </div>

        <div class="freigabe-actions">
          <button
            class="btn btn-accent"
            :disabled="actionLoading === f.id"
            @click="approve(f)"
          >
            {{ actionLoading === f.id ? 'Wird verarbeitet...' : '✓ Genehmigen' }}
          </button>
          <button
            class="btn btn-outline btn-danger-outline"
            :disabled="actionLoading === f.id"
            @click="showRejectDialog = f"
          >
            ✕ Ablehnen
          </button>
          <button
            class="btn btn-outline"
            @click="router.push(`/vergaben/${f.vergabe_id}`)"
          >
            Details ansehen
          </button>
        </div>
      </div>
    </div>

    <!-- Reject Dialog -->
    <div v-if="showRejectDialog" class="dialog-overlay" @click.self="showRejectDialog = null">
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title">
        <h3 id="reject-dialog-title">Vergabe ablehnen</h3>
        <p>Vergabe <strong>{{ showRejectDialog.vergabenummer }}</strong> ablehnen. Der Ablehnungsgrund ist Pflicht.</p>
        <div class="form-group">
          <label>Ablehnungsgrund</label>
          <textarea
            v-model="rejectKommentar"
            class="form-textarea"
            rows="3"
            placeholder="Bitte begründen Sie die Ablehnung..."
          ></textarea>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-outline" @click="showRejectDialog = null; rejectKommentar = ''">
            Abbrechen
          </button>
          <button
            class="btn btn-danger"
            :disabled="!rejectKommentar.trim() || actionLoading === showRejectDialog.id"
            @click="reject(showRejectDialog)"
          >
            Ablehnen
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.count {
  font-weight: 400;
  color: var(--ink-muted);
  font-size: 18px;
}

.success-toast {
  background: rgba(46, 160, 67, .1);
  border: 1px solid rgba(46, 160, 67, .3);
  color: var(--success);
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  margin-bottom: 16px;
  animation: slideIn .3s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.empty-state {
  text-align: center;
  padding: 60px 24px;
}
.empty-icon {
  font-size: 48px;
  color: var(--success);
  margin-bottom: 12px;
}
.empty-state h3 { margin-bottom: 4px; }
.empty-state p { color: var(--ink-muted); font-size: 14px; }

.freigaben-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.freigabe-card {
  border-left: 3px solid var(--warning);
}
.freigabe-card.risk-hoch {
  border-left-color: var(--alert);
}

.freigabe-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.freigabe-nummer {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--trust);
  cursor: pointer;
  margin-bottom: 4px;
}
.freigabe-nummer:hover { text-decoration: underline; }

.freigabe-leistung {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.freigabe-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-item {
  font-size: 12px;
  color: var(--ink-muted);
}

.freigabe-volume {
  text-align: right;
  flex-shrink: 0;
}
.volume-label {
  font-size: 11px;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.volume-value {
  font-family: var(--font-data);
  font-size: 20px;
  font-weight: 700;
  color: var(--trust);
}

.freigabe-requester {
  margin-top: 12px;
  font-size: 13px;
  color: var(--ink-secondary);
}
.requester-label { color: var(--ink-muted); }
.requester-name { font-weight: 500; margin-left: 4px; }
.requester-dept { color: var(--ink-muted); }

.freigabe-role-info {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--surface-sunken);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--ink-secondary);
}

.freigabe-comment { margin-top: 12px; }

.freigabe-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

/* Dialog p spacing override (global dialog styles from App.vue) */
.dialog p { margin-bottom: var(--space-4); }

@media (max-width: 768px) {
  .freigabe-top { flex-direction: column; }
  .freigabe-volume { text-align: left; }
  .freigabe-actions { flex-direction: column; }
  .freigabe-actions .btn { width: 100%; justify-content: center; }
}
</style>
