<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import api from '../api/index.js'

const router = useRouter()
const auth = useAuthStore()
const stats = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await api.get('/dashboard/stats')
    stats.value = data
  } catch (err) {
    console.error('Dashboard laden fehlgeschlagen:', err)
  } finally {
    loading.value = false
  }
})

function statusLabel(key) {
  const labels = {
    entwurf: 'Entwürfe',
    in_freigabe: 'In Freigabe',
    genehmigt: 'Genehmigt',
    abgelehnt: 'Abgelehnt',
    bekanntgemacht: 'Bekanntgemacht',
    angebotsphase: 'Angebotsphase',
    abgeschlossen: 'Abgeschlossen',
  }
  return labels[key] || key
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysUntil(d) {
  const diff = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24))
  return diff
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1>Dashboard</h1>
      <button class="btn btn-accent" @click="router.push('/advisor')">
        ✦ Neue Vergabe
      </button>
    </div>

    <div v-if="loading" class="loading">Lädt...</div>

    <template v-else-if="stats">
      <!-- Stat Grid -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">{{ stats.gesamt }}</div>
          <div class="stat-label">Vergaben gesamt</div>
        </div>
        <div class="stat-card">
          <div class="stat-value warning">{{ stats.offene_freigaben }}</div>
          <div class="stat-label">Offene Freigaben</div>
        </div>
        <div class="stat-card" v-for="(count, key) in stats.status" :key="key">
          <div class="stat-value">{{ count }}</div>
          <div class="stat-label">{{ statusLabel(key) }}</div>
        </div>
      </div>

      <!-- Nächste Fristen -->
      <div class="section" v-if="stats.naechste_fristen.length">
        <h2 class="section-title">Nächste Fristen</h2>
        <div class="card">
          <div
            v-for="frist in stats.naechste_fristen"
            :key="frist.id"
            class="frist-row"
            :class="{ urgent: daysUntil(frist.frist_datum) <= 3 }"
          >
            <div class="frist-date">
              <span class="frist-day">{{ formatDate(frist.frist_datum) }}</span>
              <span class="frist-countdown" :class="{ urgent: daysUntil(frist.frist_datum) <= 3 }">
                {{ daysUntil(frist.frist_datum) }} Tage
              </span>
            </div>
            <div class="frist-info">
              <div class="frist-bezeichnung">{{ frist.bezeichnung }}</div>
              <div class="frist-vergabe">{{ frist.vergabenummer }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Letzte Aktivitäten -->
      <div class="section" v-if="stats.letzte_aktivitaeten.length">
        <h2 class="section-title">Letzte Aktivitäten</h2>
        <div class="card">
          <div v-for="log in stats.letzte_aktivitaeten" :key="log.id" class="activity-row">
            <div class="activity-dot"></div>
            <div class="activity-content">
              <span class="activity-action">{{ log.aktion.replace(/_/g, ' ') }}</span>
              <span v-if="log.vergabenummer" class="activity-ref">{{ log.vergabenummer }}</span>
            </div>
            <div class="activity-meta">
              <span class="activity-user">{{ log.user_name }}</span>
              <span class="activity-time">{{ formatDate(log.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  text-align: center;
}

.stat-value {
  font-family: var(--font-data);
  font-size: 32px;
  font-weight: 700;
  color: var(--trust);
}
.stat-value.warning { color: var(--warning); }

.stat-label {
  font-size: 13px;
  color: var(--ink-secondary);
  margin-top: 4px;
}

.section { margin-bottom: 24px; }

.frist-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.frist-row:last-child { border-bottom: none; }
.frist-row.urgent { background: var(--alert-bg); margin: 0 -24px; padding: 12px 24px; }

.frist-date { display: flex; flex-direction: column; min-width: 120px; }
.frist-day { font-family: var(--font-data); font-weight: 600; font-size: 14px; }
.frist-countdown { font-size: 12px; color: var(--ink-muted); }
.frist-countdown.urgent { color: var(--alert); font-weight: 600; }
.frist-bezeichnung { font-weight: 500; font-size: 14px; }
.frist-vergabe { font-size: 12px; color: var(--ink-muted); font-family: var(--font-data); }

.activity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.activity-row:last-child { border-bottom: none; }
.activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--trust);
  flex-shrink: 0;
}
.activity-content { flex: 1; }
.activity-action { font-size: 13px; text-transform: capitalize; }
.activity-ref { font-family: var(--font-data); font-size: 12px; color: var(--trust); margin-left: 8px; }
.activity-meta { text-align: right; }
.activity-user { font-size: 12px; color: var(--ink-secondary); display: block; }
.activity-time { font-size: 11px; color: var(--ink-muted); }


</style>
