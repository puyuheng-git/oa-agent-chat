<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import MessageList from './MessageList.vue'
import Composer from './Composer.vue'
import { TYPE_HINT, appendPending } from './files-from-clipboard'
import type { ChatMessage, PendingAttachment } from '../types'

const props = defineProps<{
  messages: ChatMessage[]
  sending: boolean
  historyLoading?: boolean
  listKey?: string
  displayName: string
  examples: string[]
  skillNames: string[]
  chatEnabled: boolean
  input: string
  maxChars: number
  attachments: PendingAttachment[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:input': [v: string]
  'update:attachments': [items: PendingAttachment[]]
  send: []
  stop: []
  example: [text: string]
  regenerate: [msg: ChatMessage]
  'open-tools': []
}>()

const dragDepth = ref(0)

function carriesFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(e: DragEvent) {
  if (!carriesFiles(e)) return
  e.preventDefault()
  dragDepth.value += 1
}

function onDragOver(e: DragEvent) {
  if (!carriesFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth.value = 0
  const { next, rejected } = appendPending(props.attachments, Array.from(e.dataTransfer?.files ?? []))
  if (rejected) ElMessage.warning(TYPE_HINT)
  if (next !== props.attachments) emit('update:attachments', next)
}
</script>

<template>
  <section
    :class="['panel', { dragover: dragDepth > 0 }]"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <MessageList
      :key="listKey"
      :messages="messages"
      :sending="sending"
      :loading="historyLoading"
      :display-name="displayName"
      :examples="examples"
      :skill-names="skillNames"
      :chat-enabled="chatEnabled"
      @example="emit('example', $event)"
      @regenerate="emit('regenerate', $event)"
    />
    <Composer
      :model-value="input"
      :max-chars="maxChars"
      :sending="sending"
      :attachments="attachments"
      :placeholder="placeholder"
      @update:model-value="emit('update:input', $event)"
      @update:attachments="emit('update:attachments', $event)"
      @send="emit('send')"
      @stop="emit('stop')"
      @open-tools="emit('open-tools')"
    />
  </section>
</template>

<style scoped>
.panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 100%;
  overflow: hidden;
  background: var(--ds-page);
}
.panel.dragover {
  outline: 2px dashed rgba(0, 138, 231, 0.7);
  outline-offset: -2px;
}
</style>
