<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import ConversationSidebar from './ConversationSidebar.vue'
import ChatPanel from './ChatPanel.vue'
import TaskInspector from './TaskInspector.vue'
import MemoryPanel from './MemoryPanel.vue'
import type {
  AgentTask,
  ChatMessage,
  LocalConversation,
  NavKey,
  PendingAttachment,
} from '../types'

defineProps<{
  embedded: boolean
  displayName: string
  sessionTitle?: string
  sidebarCollapsed: boolean
  inspectorOpen: boolean
  activeNav: NavKey
  conversations: LocalConversation[]
  activeConversationId: string
  messages: ChatMessage[]
  sending: boolean
  historyLoading?: boolean
  examples: string[]
  skillNames: string[]
  chatEnabled: boolean
  input: string
  maxChars: number
  attachments: PendingAttachment[]
  task: AgentTask | null
  threadId?: string
  placeholder?: string
  memoryOpen: boolean
}>()

const emit = defineEmits<{
  'update:sidebarCollapsed': [v: boolean]
  'update:inspectorOpen': [v: boolean]
  'update:activeNav': [k: NavKey]
  'update:input': [v: string]
  'update:attachments': [items: PendingAttachment[]]
  'new-chat': []
  select: [id: string]
  rename: [id: string, title: string]
  remove: [id: string]
  send: []
  stop: []
  example: [text: string]
  regenerate: [msg: ChatMessage]
  'open-tools': []
  approve: [id: string]
  reject: [id: string]
  'update:memoryOpen': [v: boolean]
  'open-memory': []
}>()
</script>

<template>
  <div :class="['layout', { embedded, 'inspector-open': inspectorOpen, 'sidebar-collapsed': sidebarCollapsed }]">
    <ConversationSidebar
      :collapsed="sidebarCollapsed"
      :active-nav="activeNav"
      :conversations="conversations"
      :active-conversation-id="activeConversationId"
      @update:collapsed="emit('update:sidebarCollapsed', $event)"
      @update:activeNav="emit('update:activeNav', $event)"
      @new-chat="emit('new-chat')"
      @select="emit('select', $event)"
      @rename="(id, title) => emit('rename', id, title)"
      @remove="emit('remove', $event)"
      @open-memory="emit('open-memory')"
    />

    <div class="main">
      <AppHeader
        :display-name="displayName"
        :session-title="sessionTitle"
        :embedded="embedded"
        :inspector-open="inspectorOpen"
        :sidebar-collapsed="sidebarCollapsed"
        @toggle-sidebar="emit('update:sidebarCollapsed', !sidebarCollapsed)"
        @toggle-inspector="emit('update:inspectorOpen', !inspectorOpen)"
        @open-memory="emit('open-memory')"
      />
      <div class="workspace">
        <ChatPanel
          :messages="messages"
          :sending="sending"
          :history-loading="historyLoading"
          :list-key="activeConversationId"
          :display-name="displayName"
          :examples="examples"
          :skill-names="skillNames"
          :chat-enabled="chatEnabled"
          :input="input"
          :max-chars="maxChars"
          :attachments="attachments"
          :placeholder="placeholder"
          @update:input="emit('update:input', $event)"
          @update:attachments="emit('update:attachments', $event)"
          @send="emit('send')"
          @stop="emit('stop')"
          @example="emit('example', $event)"
          @regenerate="emit('regenerate', $event)"
          @open-tools="emit('open-tools')"
        />
        <TaskInspector
          v-if="inspectorOpen"
          class="desktop-inspector"
          :task="task"
          :thread-id="threadId"
          :open="inspectorOpen"
          @update:open="emit('update:inspectorOpen', $event)"
          @approve="emit('approve', $event)"
          @reject="emit('reject', $event)"
        />
      </div>
    </div>

    <MemoryPanel :open="memoryOpen" @update:open="emit('update:memoryOpen', $event)" />

    <div
      v-if="!sidebarCollapsed"
      class="backdrop mobile-backdrop"
      @click="emit('update:sidebarCollapsed', true)"
    />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background:
    radial-gradient(1200px 480px at 12% -10%, rgba(0, 138, 231, 0.08), transparent 60%),
    radial-gradient(900px 420px at 88% 0%, rgba(0, 117, 199, 0.05), transparent 55%),
    var(--ds-page);
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  animation: main-in 0.38s var(--ds-ease) both;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
}
.backdrop {
  display: none;
}

@keyframes main-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 1100px) {
  .desktop-inspector {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    box-shadow: -4px 0 20px rgba(23, 43, 77, 0.1);
  }
}

@media (max-width: 768px) {
  .mobile-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(16, 32, 56, 0.4);
    z-index: 45;
    animation: fade-backdrop 0.22s var(--ds-ease) both;
  }
}

@keyframes fade-backdrop {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .main,
  .mobile-backdrop {
    animation: none;
  }
}
</style>
