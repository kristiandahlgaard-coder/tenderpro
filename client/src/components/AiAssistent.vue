<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  context: { type: Object, default: () => ({}) },
})

const route = useRoute()
const isOpen = ref(false)
const mode = ref('formular') // 'formular' | 'vergaberecht'
const input = ref('')
const messages = ref([])
const isStreaming = ref(false)
const suggestions = ref([])
const chatBody = ref(null)

// ─── View-Name mapping ──────────────────────────────
const currentView = computed(() => {
  const path = route.path
  if (path === '/') return 'dashboard'
  if (path === '/advisor') return 'advisor'
  if (path.startsWith('/vergaben/')) return 'vergabe-detail'
  if (path === '/vergaben') return 'vergaben-list'
  if (path === '/freigaben') return 'freigaben'
  if (path === '/fristenrechner') return 'fristenrechner'
  return 'dashboard'
})

// ─── Suggestions laden ──────────────────────────────
async function loadSuggestions() {
  try {
    const token = localStorage.getItem('tp_token')
    const res = await fetch(`/api/ai/suggestions?view=${currentView.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      suggestions.value = data.suggestions || []
    }
  } catch (e) {
    suggestions.value = [
      'Was muss ich bei einer neuen Vergabe beachten?',
      'Welches Verfahren ist bei meinem Volumen richtig?',
      'Erkläre die Schwellenwerte',
    ]
  }
}

watch(currentView, () => {
  loadSuggestions()
})

onMounted(() => {
  loadSuggestions()
})

// ─── Scroll to bottom ───────────────────────────────
function scrollToBottom() {
  nextTick(() => {
    if (chatBody.value) {
      chatBody.value.scrollTop = chatBody.value.scrollHeight
    }
  })
}

watch(messages, scrollToBottom, { deep: true })

// ─── Send message ───────────────────────────────────
async function sendMessage(text) {
  const msg = text || input.value.trim()
  if (!msg || isStreaming.value) return

  input.value = ''
  messages.value.push({ role: 'user', content: msg })

  // Add empty assistant message for streaming
  const assistantMsg = { role: 'assistant', content: '' }
  messages.value.push(assistantMsg)
  isStreaming.value = true

  try {
    const token = localStorage.getItem('tp_token')
    const apiMessages = messages.value
      .filter(m => m.content)
      .slice(0, -1) // exclude empty assistant msg
      .map(m => ({ role: m.role, content: m.content }))

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        context: {
          view: currentView.value,
          ...props.context,
        },
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      assistantMsg.content = err.detail || err.error || 'Fehler beim Verbinden mit dem KI-Dienst.'
      isStreaming.value = false
      return
    }

    // Read SSE stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            isStreaming.value = false
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'text') {
              assistantMsg.content += parsed.text
              scrollToBottom()
            } else if (parsed.type === 'error') {
              assistantMsg.content += parsed.error
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    assistantMsg.content = 'Verbindung zum KI-Assistenten fehlgeschlagen. Bitte versuche es erneut.'
  }

  isStreaming.value = false
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function clearChat() {
  messages.value = []
}

function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value && messages.value.length === 0) {
    loadSuggestions()
  }
}

// ─── Keyboard shortcut (Ctrl+K) ─────────────────────
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    toggleOpen()
  }
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown))

// Simple markdown-to-html for assistant messages
function renderMarkdown(text) {
  if (!text) return ''
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    // Clean up
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[34]>)/g, '$1')
    .replace(/(<\/h[34]>)<\/p>/g, '$1')
    .replace(/<p>(<pre>)/g, '$1')
    .replace(/(<\/pre>)<\/p>/g, '$1')
    .replace(/<p>(<ul>)/g, '$1')
    .replace(/(<\/ul>)<\/p>/g, '$1')
}
</script>

<template>
  <!-- FAB Button -->
  <button
    class="ai-fab"
    :class="{ open: isOpen }"
    @click="toggleOpen"
    :aria-label="isOpen ? 'KI-Assistent schließen' : 'KI-Assistent öffnen'"
    :title="'KI-Assistent (Strg+K)'"
  >
    <span class="ai-fab-icon" v-if="!isOpen">✦</span>
    <span class="ai-fab-icon" v-else>✕</span>
  </button>

  <!-- Chat Panel -->
  <Transition name="slide">
    <div v-if="isOpen" class="ai-panel">
      <!-- Header -->
      <div class="ai-header">
        <div class="ai-header-title">
          <span class="ai-header-dot"></span>
          <span>KI-Assistent</span>
        </div>
        <div class="ai-mode-tabs">
          <button
            :class="{ active: mode === 'formular' }"
            @click="mode = 'formular'"
          >Formular-Hilfe</button>
          <button
            :class="{ active: mode === 'vergaberecht' }"
            @click="mode = 'vergaberecht'"
          >Vergaberecht</button>
        </div>
        <button class="ai-clear" @click="clearChat" title="Chat leeren" v-if="messages.length">
          ↻
        </button>
      </div>

      <!-- Body -->
      <div class="ai-body" ref="chatBody">
        <!-- Welcome -->
        <div v-if="messages.length === 0" class="ai-welcome">
          <div class="ai-welcome-icon">✦</div>
          <p v-if="mode === 'formular'">
            Ich helfe dir beim Ausfüllen. Frag mich zu jedem Feld — ich kenne die vergaberechtlichen Anforderungen.
          </p>
          <p v-else>
            Frag mich alles zum Vergaberecht — Schwellenwerte, Verfahrensarten, Fristen, Dokumentation.
          </p>

          <!-- Quick Actions -->
          <div class="ai-suggestions">
            <button
              v-for="(s, i) in suggestions"
              :key="i"
              @click="sendMessage(s)"
              class="ai-suggestion-chip"
            >{{ s }}</button>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="ai-message"
          :class="msg.role"
        >
          <div v-if="msg.role === 'assistant'" class="ai-msg-avatar">✦</div>
          <div
            class="ai-msg-content"
            :class="{ streaming: isStreaming && i === messages.length - 1 && msg.role === 'assistant' }"
          >
            <div v-if="msg.role === 'assistant'" v-html="renderMarkdown(msg.content)"></div>
            <div v-else>{{ msg.content }}</div>
          </div>
        </div>

        <!-- Streaming indicator -->
        <div v-if="isStreaming && messages[messages.length - 1]?.content === ''" class="ai-typing">
          <span></span><span></span><span></span>
        </div>
      </div>

      <!-- Input -->
      <div class="ai-input-area">
        <textarea
          v-model="input"
          @keydown="handleKeydown"
          placeholder="Frage stellen …"
          rows="1"
          :disabled="isStreaming"
          class="ai-input"
        ></textarea>
        <button
          class="ai-send"
          @click="sendMessage()"
          :disabled="!input.trim() || isStreaming"
        >
          ➤
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════
   FAB BUTTON
   ═══════════════════════════════════════════════════ */
.ai-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--trust);
  color: var(--ink-on-solid);
  border: none;
  cursor: pointer;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(30,58,95,.35);
  transition: all .25s ease;
  z-index: 1001;
}

.ai-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(30,58,95,.45);
}

.ai-fab.open {
  background: var(--ink-muted);
  transform: scale(0.9);
}

.ai-fab-icon {
  line-height: 1;
}

/* ═══════════════════════════════════════════════════
   PANEL
   ═══════════════════════════════════════════════════ */
.ai-panel {
  position: fixed;
  bottom: 88px;
  right: 24px;
  width: 400px;
  max-width: calc(100vw - 48px);
  height: min(560px, calc(100vh - 120px));
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 48px rgba(0,0,0,.15);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
}

/* ─── Header ─────────────────────────────────────── */
.ai-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ai-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-data);
  font-weight: 600;
  font-size: 15px;
  flex: 1;
}

.ai-header-dot {
  width: 8px;
  height: 8px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: var(--shadow-accent-glow);
}

.ai-clear {
  background: none;
  border: none;
  color: var(--ink-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  border-radius: var(--radius);
}
.ai-clear:hover { color: var(--ink); background: var(--surface-sunken); }

.ai-mode-tabs {
  display: flex;
  gap: 2px;
  background: var(--surface-sunken);
  border-radius: var(--radius);
  padding: 2px;
  width: 100%;
}

.ai-mode-tabs button {
  flex: 1;
  padding: 5px 10px;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-muted);
  background: transparent;
  cursor: pointer;
  transition: all .15s ease;
}

.ai-mode-tabs button.active {
  background: var(--surface-raised);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

/* ─── Body ───────────────────────────────────────── */
.ai-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ─── Welcome ────────────────────────────────────── */
.ai-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 8px 8px;
  gap: 12px;
}

.ai-welcome-icon {
  font-size: 28px;
  color: var(--accent);
  filter: drop-shadow(0 0 8px rgba(198,255,0,.3));
}

.ai-welcome p {
  font-size: 13px;
  color: var(--ink-secondary);
  line-height: 1.6;
  max-width: 280px;
}

.ai-suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
}

.ai-suggestion-chip {
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 12.5px;
  color: var(--ink-secondary);
  background: var(--surface);
  cursor: pointer;
  transition: all .15s ease;
  text-align: left;
  line-height: 1.4;
}

.ai-suggestion-chip:hover {
  border-color: var(--trust);
  color: var(--ink);
  background: var(--surface-raised);
}

/* ─── Messages ───────────────────────────────────── */
.ai-message {
  display: flex;
  gap: 8px;
  max-width: 100%;
}

.ai-message.user {
  justify-content: flex-end;
}

.ai-msg-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--trust);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 2px;
}

.ai-msg-content {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: 13px;
  line-height: 1.6;
}

.ai-message.user .ai-msg-content {
  background: var(--trust);
  color: var(--ink-on-solid);
  border-bottom-right-radius: 4px;
}

.ai-message.assistant .ai-msg-content {
  background: var(--surface-sunken);
  color: var(--ink);
  border-bottom-left-radius: 4px;
}

.ai-msg-content.streaming::after {
  content: '▊';
  animation: blink .8s infinite;
  color: var(--accent);
  margin-left: 1px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Assistant message formatting */
.ai-message.assistant .ai-msg-content :deep(h3),
.ai-message.assistant .ai-msg-content :deep(h4) {
  font-family: var(--font-data);
  font-size: 13px;
  font-weight: 600;
  margin: 10px 0 4px;
}
.ai-message.assistant .ai-msg-content :deep(h3:first-child),
.ai-message.assistant .ai-msg-content :deep(h4:first-child) {
  margin-top: 0;
}

.ai-message.assistant .ai-msg-content :deep(p) {
  margin: 4px 0;
}

.ai-message.assistant .ai-msg-content :deep(ul) {
  padding-left: 18px;
  margin: 4px 0;
}

.ai-message.assistant .ai-msg-content :deep(li) {
  margin: 2px 0;
}

.ai-message.assistant .ai-msg-content :deep(strong) {
  font-weight: 600;
}

.ai-message.assistant .ai-msg-content :deep(code.inline-code) {
  background: var(--surface-raised);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-family: var(--font-data);
}

.ai-message.assistant .ai-msg-content :deep(pre) {
  background: var(--surface);
  padding: 8px 10px;
  border-radius: var(--radius);
  font-size: 12px;
  overflow-x: auto;
  margin: 6px 0;
}

.ai-message.assistant .ai-msg-content :deep(pre code) {
  font-family: var(--font-data);
}

/* ─── Typing indicator ───────────────────────────── */
.ai-typing {
  display: flex;
  gap: 4px;
  padding: 8px 14px;
  align-self: flex-start;
  margin-left: 32px;
}

.ai-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-muted);
  animation: typing-dot 1.2s infinite;
}
.ai-typing span:nth-child(2) { animation-delay: .2s; }
.ai-typing span:nth-child(3) { animation-delay: .4s; }

@keyframes typing-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: .4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* ─── Input ──────────────────────────────────────── */
.ai-input-area {
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.ai-input {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  background: var(--surface);
  resize: none;
  line-height: 1.5;
  max-height: 80px;
  outline: none;
}

.ai-input:focus {
  border-color: var(--trust);
  box-shadow: var(--shadow-focus);
}

.ai-input::placeholder { color: var(--ink-muted); }

.ai-send {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--trust);
  color: var(--ink-on-solid);
  border: none;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all .15s ease;
}

.ai-send:hover:not(:disabled) { background: var(--trust-light); }
.ai-send:disabled { opacity: .4; cursor: not-allowed; }

/* ═══════════════════════════════════════════════════
   TRANSITION
   ═══════════════════════════════════════════════════ */
.slide-enter-active { transition: all .25s cubic-bezier(.4,0,.2,1); }
.slide-leave-active { transition: all .2s ease-in; }

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(.95);
}

/* ═══════════════════════════════════════════════════
   MOBILE
   ═══════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .ai-panel {
    bottom: 0;
    right: 0;
    width: 100vw;
    max-width: 100vw;
    height: calc(100vh - 60px);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .ai-fab {
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
  }
}
</style>
