/**
 * TenderPro — Auth Store (Pinia)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api/index.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('tp_user') || 'null'))
  const token = ref(localStorage.getItem('tp_token') || null)

  const isLoggedIn = computed(() => !!token.value)
  const fullName = computed(() => user.value ? `${user.value.vorname} ${user.value.nachname}` : '')
  const initials = computed(() => user.value ? `${user.value.vorname[0]}${user.value.nachname[0]}` : '')

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    token.value = data.token
    user.value = data.user
    localStorage.setItem('tp_token', data.token)
    localStorage.setItem('tp_user', JSON.stringify(data.user))
    return data
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('tp_token')
    localStorage.removeItem('tp_user')
  }

  async function fetchProfile() {
    try {
      const { data } = await api.get('/auth/me')
      user.value = data
      localStorage.setItem('tp_user', JSON.stringify(data))
    } catch {
      logout()
    }
  }

  return { user, token, isLoggedIn, fullName, initials, login, logout, fetchProfile }
})
