<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/index.js'

const router = useRouter()
const vergaben = ref([])
const total = ref(0)
const loading = ref(true)
const search = ref('')
const statusFilter = ref('')

const statusLabels = {
  entwurf: 'Entwurf',
  in_freigabe: 'In Freigabe',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
  bekanntgemacht: 'Bekanntgemacht',
  angebotsphase: 'Angebotsphase',
  abgeschlossen: 'Abgeschlossen',
}

async function loadVergaben() {
  loading.value = true
  try {
    const params = {}
    if (search.value) params.search = search.value
    if (statusFilter.value) params.status = statusFilter.value
    const { data } = await api.get('/vergaben', { params })
    vergaben.value = data.vergaben
    total.value = data.total
  } catch (err) {
    console.error('Vergaben laden fehlgeschlagen:', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadVergaben)

let searchTimeout
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(loadVergaben, 300)
})
watch(statusFilter, loadVergaben)

function formatCurrency(val) {
  if (!val) return '—'
  return parseFloat(val).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE')
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1>Vergaben <span class="count">({{ total }})</span></h1>
      <button class="btn btn-accent" @click="router.push('/advisor')">
        ✦ Neue Vergabe
      </button>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        class="form-input search-input"
        placeholder="Suche nach Vergabenummer, Leistung..."
      />
      <select v-model="statusFilter" class="form-select">
        <option value="">Alle Status</option>
        <option v-for="(label, key) in statusLabels" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-wrapper card">
      <div v-if="loading" class="loading">Lädt...</div>
      <div v-else-if="vergaben.length === 0" class="empty">
        Keine Vergaben gefunden. <button class="btn btn-accent" @click="router.push('/advisor')">Erste Vergabe anlegen</button>
      </div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Leistung</th>
            <th>Art</th>
            <th>Volumen</th>
            <th>Status</th>
            <th>Erstellt</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in vergaben"
            :key="v.id"
            role="button"
            tabindex="0"
            @click="router.push(`/vergaben/${v.id}`)"
            @keydown.enter="router.push(`/vergaben/${v.id}`)"
            class="clickable"
          >
            <td class="mono">{{ v.vergabenummer }}</td>
            <td class="leistung-cell">
              <div class="leistung-text">{{ v.leistungsbeschreibung }}</div>
              <div v-if="v.projektbezeichnung" class="leistung-sub">{{ v.projektbezeichnung }}</div>
            </td>
            <td><span class="badge badge-info">{{ v.leistungsart }}</span></td>
            <td class="mono">{{ formatCurrency(v.volumen_netto) }}</td>
            <td>
              <span class="status-pill" :class="v.status">
                <span class="status-dot" :class="v.status"></span>
                {{ statusLabels[v.status] || v.status }}
              </span>
            </td>
            <td class="mono">{{ formatDate(v.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.count {
  font-weight: 400;
  color: var(--ink-muted);
  font-size: 18px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
}

.form-select {
  min-width: 160px;
}

.table-wrapper {
  overflow-x: auto;
  padding: 0;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: left;
  padding: 12px 16px;
  border-bottom: 2px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.data-table tr.clickable {
  cursor: pointer;
  transition: background var(--transition);
}
.data-table tr.clickable:hover {
  background: var(--surface-sunken);
}

.leistung-cell { max-width: 300px; }
.leistung-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.leistung-sub {
  font-size: 12px;
  color: var(--ink-muted);
  margin-top: 2px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.empty { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
</style>
