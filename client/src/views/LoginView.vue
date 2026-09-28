<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(route.query.redirect || '/')
  } catch (err) {
    error.value = err.response?.data?.error || 'Anmeldung fehlgeschlagen'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-dot"></span>
        <h1>TenderPro</h1>
      </div>
      <p class="login-subtitle">Vergabeplattform für den öffentlichen Sektor</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="email">E-Mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="form-input"
            placeholder="ihre@email.de"
            required
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password">Passwort</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="form-input"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <div v-if="error" class="login-error" role="alert">{{ error }}</div>

        <button type="submit" class="btn btn-primary login-btn" :disabled="loading">
          {{ loading ? 'Anmelden...' : 'Anmelden' }}
        </button>
      </form>

    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--sidebar-bg);
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--surface-raised);
  border-radius: var(--radius-lg);
  padding: 40px 32px;
  box-shadow: 0 8px 32px rgba(0,0,0,.2);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.login-brand h1 {
  font-family: var(--font-data);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -.03em;
}

.brand-dot {
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: var(--shadow-accent-glow);
}

.login-subtitle {
  color: var(--ink-secondary);
  font-size: 14px;
  margin-bottom: 32px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-btn {
  width: 100%;
  justify-content: center;
  padding: 12px;
  font-size: 15px;
  margin-top: 8px;
}

.login-error {
  background: var(--alert-bg);
  color: var(--alert);
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
}

.login-hint {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.8;
}
</style>
