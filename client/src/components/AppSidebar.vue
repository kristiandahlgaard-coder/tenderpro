<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { ref, computed } from 'vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const mobileOpen = ref(false)

const navItems = computed(() => {
  const items = [
    { label: 'Dashboard', icon: '◫', route: '/' },
    { label: 'Vergaben', icon: '☰', route: '/vergaben' },
    { label: 'Vergabe-Advisor', icon: '✦', route: '/advisor', accent: true },
    { label: 'Freigaben', icon: '✓', route: '/freigaben' },
    { label: 'Fristenrechner', icon: '⏱', route: '/fristenrechner' },
  ]
  if (auth.user?.rolle === 'admin') {
    items.push({ label: 'Einstellungen', icon: '⚙', route: '/einstellungen' })
  }
  return items
})

function isActive(path) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function navigate(path) {
  router.push(path)
  mobileOpen.value = false
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <!-- Mobile Toggle -->
  <button class="mobile-toggle" @click="mobileOpen = !mobileOpen">☰</button>

  <aside class="sidebar" :class="{ open: mobileOpen }">
    <!-- Brand -->
    <div class="sidebar-brand">
      <h1>
        <span class="brand-dot"></span>
        TenderPro
      </h1>
      <div class="brand-claim">Vergabe. Einfach. Sicher.</div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-section">
      <div class="sidebar-section-label">Plattform</div>
      <ul class="sidebar-nav">
        <li v-for="item in navItems" :key="item.route">
          <button
            :class="{ active: isActive(item.route), 'accent-item': item.accent }"
            @click="navigate(item.route)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            {{ item.label }}
          </button>
        </li>
      </ul>
    </nav>

    <!-- User -->
    <div class="sidebar-footer">
      <div class="user-pill" role="button" tabindex="0" aria-label="Abmelden" @click="logout" @keydown.enter="logout" @keydown.space.prevent="logout">
        <div class="user-avatar">{{ auth.initials }}</div>
        <div class="user-info">
          <div class="user-name">{{ auth.fullName }}</div>
          <div class="user-role">{{ auth.user?.rolle }}</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Mobile Overlay -->
  <div v-if="mobileOpen" class="sidebar-overlay" @click="mobileOpen = false"></div>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sidebar-border);
  overflow-y: auto;
  z-index: 100;
}

.sidebar-brand {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--sidebar-border);
}

.sidebar-brand h1 {
  font-family: var(--font-data);
  font-size: 20px;
  font-weight: 700;
  color: var(--sidebar-ink-active);
  letter-spacing: -.02em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-dot {
  width: 8px;
  height: 8px;
  background: var(--accent);
  border-radius: 50%;
  display: inline-block;
  box-shadow: var(--shadow-accent-glow);
}

.brand-claim {
  font-size: 11px;
  color: var(--sidebar-ink);
  margin-top: 4px;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.sidebar-section {
  padding: 16px 12px 8px;
  flex: 1;
}

.sidebar-section-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--sidebar-ink);
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 0 8px;
  margin-bottom: 4px;
}

.sidebar-nav {
  list-style: none;
  padding: 0;
}

.sidebar-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius);
  color: var(--sidebar-ink);
  font-size: 13.5px;
  font-weight: 400;
  border: none;
  background: none;
  cursor: pointer;
  transition: all var(--transition);
  text-align: left;
  font-family: var(--font-body);
  position: relative;
  margin: 1px 0;
}

.sidebar-nav button:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-ink-active);
}

.sidebar-nav button.active {
  background: var(--sidebar-hover);
  color: var(--sidebar-ink-active);
  font-weight: 500;
}

.sidebar-nav button.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
  box-shadow: var(--shadow-accent-glow);
}

.accent-item {
  color: var(--accent) !important;
}

.nav-icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
  opacity: .7;
}

.active .nav-icon { opacity: 1; }

.sidebar-footer {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid var(--sidebar-border);
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition);
}

.user-pill:hover { background: var(--sidebar-hover); }

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--trust), var(--trust-light));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-on-solid);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--sidebar-ink-active);
}

.user-role {
  font-size: 11px;
  color: var(--sidebar-ink);
  text-transform: capitalize;
}

.mobile-toggle {
  display: none;
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 200;
  background: var(--sidebar-bg);
  color: var(--sidebar-ink-active);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 18px;
  cursor: pointer;
}

.sidebar-overlay {
  display: none;
}

@media (max-width: 768px) {
  .mobile-toggle { display: block; }
  .sidebar {
    position: fixed;
    left: -280px;
    top: 0;
    bottom: 0;
    transition: left .3s ease;
  }
  .sidebar.open { left: 0; }
  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.5);
    z-index: 99;
  }
}
</style>
