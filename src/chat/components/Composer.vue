<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Paperclip, Promotion, VideoPause, Tools } from '@element-plus/icons-vue'
import type { InputInstance } from 'element-plus'
import AttachmentList from './AttachmentList.vue'
import type { PendingAttachment } from '../types'
import {
  ACCEPT,
  TYPE_HINT,
  appendPending,
  canSendMessage,
  captionBesideFiles,
  filesFromClipboard,
} from './files-from-clipboard'

const props = defineProps<{
  modelValue: string
  maxChars: number
  sending: boolean
  placeholder?: string
  attachments: PendingAttachment[]
}>()

const emit = defineEmits<{
  'update:modelValue': [v: string]
  send: []
  stop: []
  'update:attachments': [items: PendingAttachment[]]
  'open-tools': []
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const textInput = ref<InputInstance | null>(null)
const focused = ref(false)
const canSend = computed(() => canSendMessage(props.modelValue, props.attachments.length, props.sending))

watch(
  () => props.sending,
  async (sending, wasSending) => {
    if (wasSending && !sending) {
      await nextTick()
      textInput.value?.focus()
    }
  },
)
const attachHint = computed(() => {
  if (!props.attachments.length) return ''
  return `已选择 ${props.attachments.length} 个附件（本地待发送）`
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    if (canSend.value) emit('send')
  }
}

function pickFiles() {
  fileInput.value?.click()
}

function addFiles(files: File[]) {
  if (!files.length) return
  const { next, rejected } = appendPending(props.attachments, files)
  if (rejected) ElMessage.warning(TYPE_HINT)
  if (next === props.attachments) return
  emit('update:attachments', next)
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  addFiles(files)
}

function nativeTextarea(): HTMLTextAreaElement | null {
  const raw = textInput.value?.textarea as HTMLTextAreaElement | { value?: HTMLTextAreaElement | null } | undefined
  if (!raw) return null
  if (typeof HTMLTextAreaElement !== 'undefined' && raw instanceof HTMLTextAreaElement) return raw
  return (raw as { value?: HTMLTextAreaElement | null }).value ?? null
}

function insertAtCursor(text: string) {
  const current = props.modelValue
  const el = nativeTextarea()
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? start
  const next = (current.slice(0, start) + text + current.slice(end)).slice(0, props.maxChars)
  emit('update:modelValue', next)
  const caret = Math.min(start + text.length, next.length)
  void nextTick(() => {
    const node = nativeTextarea()
    node?.focus()
    node?.setSelectionRange(caret, caret)
  })
}

function onPaste(e: ClipboardEvent) {
  const { files, text } = filesFromClipboard(e.clipboardData)
  if (!files.length) return
  e.preventDefault()
  addFiles(files)
  const caption = captionBesideFiles(text, files)
  if (caption) insertAtCursor(caption)
}

function removeAtt(id: string) {
  const target = props.attachments.find((a) => a.id === id)
  if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
  emit(
    'update:attachments',
    props.attachments.filter((a) => a.id !== id),
  )
}
</script>

<template>
  <div class="composer" @paste="onPaste">
    <div class="composer-inner">
      <AttachmentList :items="attachments" @remove="removeAtt" />
      <p v-if="attachHint" class="attach-status">{{ attachHint }}</p>
      <div :class="['box', { focused, sending }]">
        <el-input
          ref="textInput"
          :model-value="modelValue"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 5 }"
          :maxlength="maxChars"
          :placeholder="placeholder || '描述你的工作任务…（Enter 发送，Shift+Enter 换行）'"
          :disabled="sending"
          resize="none"
          @update:model-value="emit('update:modelValue', $event)"
          @keydown="onKeydown"
          @focus="focused = true"
          @blur="focused = false"
        />
        <div class="toolbar">
          <div class="left">
            <el-tooltip content="添加附件，发送时再上传" placement="top">
              <button type="button" class="tool-btn" @click="pickFiles">
                <el-icon :size="16"><Paperclip /></el-icon>
                <span>附件</span>
              </button>
            </el-tooltip>
            <el-tooltip content="查看当前可用的 OA 查询能力" placement="top">
              <button type="button" class="tool-btn" @click="emit('open-tools')">
                <el-icon :size="16"><Tools /></el-icon>
                <span>工具</span>
              </button>
            </el-tooltip>
            <input ref="fileInput" type="file" multiple class="hidden" :accept="ACCEPT" @change="onFiles" />
          </div>
          <div class="right">
            <el-tooltip v-if="sending" content="停止接收本次回复（服务端任务可能仍在运行）" placement="top">
              <button type="button" class="stop-btn" @click="emit('stop')">
                <el-icon><VideoPause /></el-icon>
                停止生成
              </button>
            </el-tooltip>
            <el-tooltip
              :content="canSend ? '发送消息' : sending ? '正在生成中' : '请输入内容或添加附件'"
              placement="top"
            >
              <button
                type="button"
                class="send-btn"
                :disabled="!canSend"
                :aria-disabled="!canSend"
                @click="emit('send')"
              >
                <el-icon><Promotion /></el-icon>
                发送
              </button>
            </el-tooltip>
          </div>
        </div>
      </div>
      <p class="hint">内容仅基于你的员工身份与权限；敏感操作需独立审批。</p>
    </div>
  </div>
</template>

<style scoped>
.composer {
  flex-shrink: 0;
  padding: 0 20px 12px;
  border-top: 1px solid var(--ds-line);
  background: #fff;
}
.composer-inner {
  max-width: var(--ds-chat-max);
  margin: 0 auto;
  padding-top: 10px;
}
.attach-status {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--ds-warning);
  background: var(--ds-warning-bg);
  border-radius: 6px;
  padding: 5px 10px;
}
.box {
  background: var(--ds-page);
  border: 1px solid var(--ds-line);
  border-radius: var(--ds-radius-lg);
  padding: 8px 10px 6px;
  transition: border-color 0.15s var(--ds-ease);
}
.box.focused {
  border-color: rgba(0, 138, 231, 0.45);
  background: #fff;
}
.box :deep(.el-textarea__inner) {
  box-shadow: none !important;
  border: none !important;
  background: transparent;
  padding: 4px 2px 6px;
  color: var(--ds-title);
  font-size: 15px;
  line-height: 1.55;
}
.box :deep(.el-textarea__inner::placeholder) {
  color: #9aabbc;
  font-size: 14px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
}
.left,
.right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.tool-btn {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ds-body);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
}
.tool-btn:hover {
  background: var(--ds-brand-soft);
  color: var(--ds-brand);
}
.send-btn,
.stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.send-btn {
  background: var(--ds-brand);
  color: #fff;
}
.send-btn:hover:not(:disabled) {
  background: var(--ds-brand-hover);
}
.send-btn:disabled {
  background: #c5d0dc;
  color: #fff;
  cursor: not-allowed;
}
.stop-btn {
  background: var(--ds-danger-bg);
  color: var(--ds-danger);
  border: 1px solid #fecdca;
}
.hint {
  margin: 8px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--ds-muted);
  line-height: 1.4;
}
.hidden {
  display: none;
}

@media (max-width: 560px) {
  .tool-btn span {
    display: none;
  }
}
</style>
