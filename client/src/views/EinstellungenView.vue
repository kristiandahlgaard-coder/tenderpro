<script setup>
/**
 * TenderPro — Organisationseinstellungen (nur Rolle "admin")
 *
 * Setzt Bundesland und Organisationstyp der eigenen Organisation. Beide Felder
 * bestimmen unmittelbar, welche Wertgrenzen und EU-Schwellenwerte der Vergabe-Advisor
 * ansetzt (server/wissen/rechtsstand.json über server/services/optionskatalog.js).
 */
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import api from '../api/index.js'

const auth = useAuthStore()

const laden = ref(true)
const speichern = ref(false)
const fehler = ref('')
const erfolg = ref('')

const typOptionen = ref([])
const bundeslandOptionen = ref([])

const form = ref({
  name: '',
  strasse: '',
  plz: '',
  ort: '',
  bundesland: '',
  typ: 'klassisch',
})

const typBeschreibung = {
  klassisch: 'Öffentlicher Auftraggeber im Sinne des § 99 Nr. 1–3 GWB ohne Besonderheiten (Regelfall).',
  sektoren: 'Auftraggeber im Bereich Wasser, Energie, Verkehr oder Postdienste (§ 100 GWB) – eigene, meist höhere EU-Schwellenwerte.',
  konzession: 'Vergibt schwerpunktmäßig Bau- oder Dienstleistungskonzessionen (§ 105 GWB, KonzVgV).',
  oberste_bundesbehoerde: 'Oberste Bundesbehörde bzw. zentrale Beschaffungsstelle des Bundes (Anlage 1 zu § 106 Abs. 2 GWB) – niedrigerer EU-Schwellenwert bei Liefer-/Dienstleistungen (Art. 4 RL 2014/24/EU).',
}

async function laden_() {
  laden.value = true
  fehler.value = ''
  try {
    const { data } = await api.get('/organisation')
    form.value = {
      name: data.organisation.name || '',
      strasse: data.organisation.strasse || '',
      plz: data.organisation.plz || '',
      ort: data.organisation.ort || '',
      bundesland: data.organisation.bundesland || '',
      typ: data.organisation.typ || 'klassisch',
    }
    typOptionen.value = data.typ_optionen
    bundeslandOptionen.value = data.bundesland_optionen
  } catch (err) {
    fehler.value = err.response?.data?.error || 'Organisation konnte nicht geladen werden.'
  } finally {
    laden.value = false
  }
}

async function speichern_() {
  speichern.value = true
  fehler.value = ''
  erfolg.value = ''
  try {
    const { data } = await api.put('/organisation', form.value)
    form.value.name = data.organisation.name
    erfolg.value = 'Gespeichert.'
  } catch (err) {
    fehler.value = err.response?.data?.error || 'Speichern fehlgeschlagen.'
  } finally {
    speichern.value = false
  }
}

onMounted(laden_)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>Organisationseinstellungen</h1>
      <p class="subtitle">Stammdaten Ihrer Organisation, inklusive der für den Vergabe-Advisor maßgeblichen Angaben.</p>
    </header>

    <div v-if="auth.user?.rolle !== 'admin'" class="hinweis-box">
      Diese Seite ist Nutzenden mit der Rolle „admin" vorbehalten. Ihre Organisationsdaten werden unten nur angezeigt.
    </div>

    <div v-if="laden" class="lade-hinweis">Lade…</div>

    <form v-else class="form" @submit.prevent="speichern_">
      <fieldset :disabled="auth.user?.rolle !== 'admin' || speichern">
        <div class="feld">
          <label for="name">Name</label>
          <input id="name" v-model="form.name" type="text" required />
        </div>

        <div class="feld-reihe">
          <div class="feld">
            <label for="strasse">Straße</label>
            <input id="strasse" v-model="form.strasse" type="text" />
          </div>
          <div class="feld feld-klein">
            <label for="plz">PLZ</label>
            <input id="plz" v-model="form.plz" type="text" maxlength="10" />
          </div>
          <div class="feld">
            <label for="ort">Ort</label>
            <input id="ort" v-model="form.ort" type="text" />
          </div>
        </div>

        <div class="feld">
          <label for="bundesland">Bundesland</label>
          <select id="bundesland" v-model="form.bundesland">
            <option value="">– bitte wählen –</option>
            <option v-for="b in bundeslandOptionen" :key="b" :value="b">{{ b }}</option>
          </select>
          <p class="feld-hinweis">
            Bestimmt, welche Landes-Wertgrenzen gelten (z. B. AV LHO Berlin). „Bund" wählen Sie,
            wenn für Ihre Organisation die Wertgrenzen des Bundes maßgeblich sind, unabhängig vom Sitz.
          </p>
        </div>

        <div class="feld">
          <label for="typ">Organisationstyp</label>
          <select id="typ" v-model="form.typ">
            <option v-for="t in typOptionen" :key="t" :value="t">{{ t }}</option>
          </select>
          <p class="feld-hinweis">{{ typBeschreibung[form.typ] }}</p>
        </div>

        <div v-if="fehler" class="meldung meldung-fehler">{{ fehler }}</div>
        <div v-if="erfolg" class="meldung meldung-erfolg">{{ erfolg }}</div>

        <button v-if="auth.user?.rolle === 'admin'" type="submit" class="btn-speichern" :disabled="speichern">
          {{ speichern ? 'Speichert…' : 'Speichern' }}
        </button>
      </fieldset>
    </form>
  </div>
</template>

<style scoped>
.page {
  max-width: 640px;
  padding: 24px;
}
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 20px; font-weight: 600; }
.subtitle { color: var(--ink-muted, #667); font-size: 13.5px; margin-top: 4px; }

.hinweis-box {
  background: var(--surface-muted, #f4f4f4);
  border: 1px solid var(--border, #ddd);
  border-radius: var(--radius, 8px);
  padding: 12px 14px;
  font-size: 13px;
  margin-bottom: 16px;
}

.lade-hinweis { color: var(--ink-muted, #667); font-size: 13.5px; }

.form fieldset { border: none; padding: 0; margin: 0; }

.feld { margin-bottom: 16px; }
.feld-reihe { display: flex; gap: 12px; }
.feld-reihe .feld { flex: 1; }
.feld-klein { flex: 0 0 100px; }

label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  margin-bottom: 4px;
}

input, select {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius, 8px);
  border: 1px solid var(--border, #ccc);
  font-size: 13.5px;
  font-family: inherit;
}

input:disabled, select:disabled {
  background: var(--surface-muted, #f4f4f4);
  color: var(--ink-muted, #667);
}

.feld-hinweis {
  font-size: 12px;
  color: var(--ink-muted, #667);
  margin-top: 4px;
  line-height: 1.4;
}

.meldung {
  padding: 10px 12px;
  border-radius: var(--radius, 8px);
  font-size: 13px;
  margin-bottom: 16px;
}
.meldung-fehler { background: #fdeaea; color: #a12; }
.meldung-erfolg { background: #eafaf0; color: #175; }

.btn-speichern {
  background: var(--accent, #2563eb);
  color: #fff;
  border: none;
  border-radius: var(--radius, 8px);
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
}
.btn-speichern:disabled { opacity: .6; cursor: default; }
</style>
