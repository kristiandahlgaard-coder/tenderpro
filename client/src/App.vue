<script setup>
import { computed, provide, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth.js'
import AppSidebar from './components/AppSidebar.vue'
import AiAssistent from './components/AiAssistent.vue'

const route = useRoute()
const auth = useAuthStore()

const showSidebar = computed(() => route.name !== 'login' && auth.isLoggedIn)

// KI-Assistent Kontext — Views können diesen setzen
const aiContext = ref({})
provide('setAiContext', (ctx) => { aiContext.value = ctx })
</script>

<template>
  <div class="app-shell" :class="{ 'no-sidebar': !showSidebar }">
    <AppSidebar v-if="showSidebar" />
    <main class="main-content">
      <router-view />
    </main>

    <!-- KI-Assistent (global) -->
    <AiAssistent v-if="showSidebar" :context="aiContext" />
  </div>
</template>

<style>
/* ═══════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════ */
:root {
  /* ── Ink ── */
  --ink: #0A0F1A;
  --ink-secondary: #4A5568;
  --ink-muted: #6B7280;
  --ink-on-solid: #FFFFFF;

  /* ── Surface ── */
  --surface: #F7F8FA;
  --surface-raised: #FFFFFF;
  --surface-sunken: #EEF0F4;

  /* ── Brand ── */
  --accent: #C6FF00;
  --accent-dim: #9BBF00;
  --accent-on-light: #5C7A00;
  --trust: #1E3A5F;
  --trust-light: #2A4F7F;

  /* ── Semantic ── */
  --alert: #DC2626;
  --alert-bg: #FEF2F2;
  --warning: #D97706;
  --warning-bg: #FFFBEB;
  --success: #16A34A;
  --success-bg: #F0FDF4;
  --info: #2563EB;
  --info-bg: #EFF6FF;

  /* ── Chrome ── */
  --border: #E2E5EA;
  --border-strong: #CBD5E1;
  --sidebar-bg: #0D1117;
  --sidebar-border: #21262D;
  --sidebar-ink: #8B949E;
  --sidebar-ink-active: #F0F6FC;
  --sidebar-hover: #161B22;

  /* ── Elevation ── */
  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08);
  --shadow-focus: 0 0 0 3px rgba(30,58,95,.18);
  --shadow-accent-glow: 0 0 8px rgba(198,255,0,.35);

  /* ── Spacing scale (4px base) ── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-16: 64px;

  /* ── Type scale ── */
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 32px;

  /* ── Shape ── */
  --radius: 6px;
  --radius-lg: 10px;
  --radius-full: 9999px;

  /* ── Type ── */
  --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-data: 'Space Grotesk', 'DM Sans', system-ui, sans-serif;

  /* ── Motion ── */
  --transition: .2s ease;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ink: #E6EDF3;
    --ink-secondary: #8B949E;
    --ink-muted: #7D8590;
    --ink-on-solid: #FFFFFF;
    --surface: #0D1117;
    --surface-raised: #161B22;
    --surface-sunken: #090C10;
    --trust: #58A6FF;
    --trust-light: #79C0FF;
    --accent-on-light: #C6FF00;
    --alert: #F85149;
    --warning: #E3B341;
    --success: #3FB950;
    --info: #58A6FF;
    --border: #21262D;
    --border-strong: #30363D;
    --alert-bg: #2D1B1B;
    --warning-bg: #2D2714;
    --success-bg: #132A1C;
    --info-bg: #151E30;
    --shadow-sm: 0 1px 2px rgba(0,0,0,.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,.4);
    --shadow-focus: 0 0 0 3px rgba(88,166,255,.25);
    --shadow-accent-glow: 0 0 8px rgba(198,255,0,.25);
  }
}

:root[data-theme="dark"] {
  --ink: #E6EDF3;
  --ink-secondary: #8B949E;
  --ink-muted: #7D8590;
  --ink-on-solid: #FFFFFF;
  --surface: #0D1117;
  --surface-raised: #161B22;
  --surface-sunken: #090C10;
  --trust: #58A6FF;
  --trust-light: #79C0FF;
  --accent-on-light: #C6FF00;
  --alert: #F85149;
  --warning: #E3B341;
  --success: #3FB950;
  --info: #58A6FF;
  --border: #21262D;
  --border-strong: #30363D;
  --alert-bg: #2D1B1B;
  --warning-bg: #2D2714;
  --success-bg: #132A1C;
  --info-bg: #151E30;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,.4);
  --shadow-focus: 0 0 0 3px rgba(88,166,255,.25);
  --shadow-accent-glow: 0 0 8px rgba(198,255,0,.25);
}

/* ═══════════════════════════════════════════════════
   RESET & BASE
   ═══════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; }

body {
  font-family: var(--font-body);
  color: var(--ink);
  background: var(--surface);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  height: 100vh;
}

/* ═══════════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════════ */
.app-shell {
  display: flex;
  height: 100vh;
  width: 100%;
}

.app-shell.no-sidebar .main-content {
  width: 100%;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}

/* ═══════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════ */
.card {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 20px;
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
  text-decoration: none;
}
.btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.btn:active { transform: translateY(1px); }
.btn:disabled, .btn[disabled] {
  opacity: .5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn-primary {
  background: var(--trust);
  color: var(--ink-on-solid);
}
.btn-primary:hover { background: var(--trust-light); }

.btn-accent {
  background: var(--accent);
  color: #0A0F1A;
  font-weight: 600;
}
.btn-accent:hover { filter: brightness(0.9); }
.btn-accent:focus-visible { box-shadow: var(--shadow-accent-glow); }

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--ink);
}
.btn-outline:hover { background: var(--surface-sunken); }

.btn-danger {
  background: var(--alert);
  color: var(--ink-on-solid);
}
.btn-danger:hover { opacity: .9; }

.btn-danger-outline {
  background: transparent;
  border: 1px solid var(--alert);
  color: var(--alert);
}
.btn-danger-outline:hover { background: var(--alert); color: var(--ink-on-solid); }

.btn-sm { padding: 6px 12px; font-size: var(--text-sm); }

.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-data);
}

.badge-success { background: var(--success-bg); color: var(--success); }
.badge-warning { background: var(--warning-bg); color: var(--warning); }
.badge-danger { background: var(--alert-bg); color: var(--alert); }
.badge-info { background: var(--info-bg); color: var(--info); }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-secondary);
}

.form-input, .form-select, .form-textarea {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  background: var(--surface-raised);
  transition: border-color var(--transition);
}

.form-input:focus, .form-select:focus, .form-textarea:focus,
.form-input:focus-visible, .form-select:focus-visible, .form-textarea:focus-visible {
  outline: none;
  border-color: var(--trust);
  box-shadow: var(--shadow-focus);
}

.form-textarea {
  min-height: 80px;
  resize: vertical;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.page-header h1 {
  font-family: var(--font-data);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -.02em;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.entwurf { background: var(--ink-muted); }
.status-dot.in_freigabe { background: var(--warning); }
.status-dot.genehmigt { background: var(--success); }
.status-dot.abgelehnt { background: var(--alert); }
.status-dot.in_pruefung { background: var(--info); }

/* ═══════════════════════════════════════════════════
   SHARED COMPONENTS (extracted from views)
   ═══════════════════════════════════════════════════ */
.mono { font-family: var(--font-data); font-size: var(--text-sm); }

.loading, .empty {
  padding: var(--space-10);
  text-align: center;
  color: var(--ink-muted);
  font-size: var(--text-base);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-6);
}
.dialog {
  max-width: 460px;
  width: 100%;
}
.dialog h3 { margin-bottom: var(--space-2); }
.dialog p { font-size: var(--text-base); color: var(--ink-secondary); line-height: 1.6; }
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

.section-title {
  font-family: var(--font-data);
  font-size: var(--text-md);
  font-weight: 600;
  margin-bottom: var(--space-3);
}

.success-toast {
  background: var(--success-bg);
  border: 1px solid var(--success);
  color: var(--success);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  font-size: var(--text-base);
  margin-bottom: var(--space-4);
  animation: toast-in .3s ease;
}
.success-toast[role="status"] { /* a11y marker, no extra styles needed */ }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ═══════════════════════════════════════════════════
   ADDITIONAL STATUS DOTS
   ═══════════════════════════════════════════════════ */
.status-dot.bekanntgemacht { background: var(--info); }
.status-dot.angebotsphase { background: var(--info); }
.status-dot.abgeschlossen { background: var(--trust); }
.status-dot.archiviert { background: var(--ink-muted); }
.status-dot.storniert { background: var(--alert); }

/* ═══════════════════════════════════════════════════
   ACCESSIBILITY BASELINE
   ═══════════════════════════════════════════════════ */
:focus-visible {
  outline: 2px solid var(--trust);
  outline-offset: 2px;
}

[role="button"] { cursor: pointer; }

@media (max-width: 768px) {
  .main-content { padding: var(--space-4); }
}
</style>
