<script setup lang="ts">
import { computed } from 'vue'
import { CopyDocument, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  plainText,
  type ConfirmationPendingData,
  type Reply,
} from '../api'
import { renderMarkdown } from '../markdown'
import type { ChatMessage } from '../types'
import SkillConfirmCard from './SkillConfirmCard.vue'
import ThinkingBlock from './ThinkingBlock.vue'

const props = defineProps<{ message: ChatMessage }>()
const emit = defineEmits<{ regenerate: []; confirmResolved: [reply: Reply] }>()

const isError = computed(() => props.message.reply?.type === 'error')
const isWaiting = computed(() => props.message.reply?.type === 'pending')
const isConfirmPending = computed(() => props.message.reply?.type === 'confirmation_pending')
const confirmData = computed(() => {
  if (!isConfirmPending.value) return null
  const data = props.message.reply?.data
  if (!data || typeof data !== 'object') return null
  return data as ConfirmationPendingData
})
const showThinking = computed(
  () =>
    !!props.message.thinkingActive ||
    !!(props.message.thinking && props.message.thinking.length > 0),
)
/** 思考进行中且尚无正文时只展示思考块，避免空气泡抢视觉。 */
const showAnswer = computed(() => {
  const t = props.message.text || ''
  if (props.message.thinkingActive && !t) return false
  return true
})

const answerHtml = computed(() => renderMarkdown(props.message.text || ''))

async function copy() {
  try {
    await navigator.clipboard.writeText(plainText(props.message.text))
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function onConfirmResolved(reply: Reply) {
  emit('confirmResolved', reply)
}
</script>

<template>
  <div class="row assistant">
    <div class="avatar" aria-hidden="true">AI</div>
    <div class="body">
      <div :class="['content', { error: isError, waiting: isWaiting }]">
        <ThinkingBlock
          v-if="showThinking"
          :content="message.thinking || ''"
          :active="!!message.thinkingActive"
          :streaming="!!message.streaming"
        />

        <div v-if="showAnswer && !isConfirmPending" class="text md-body">
          <div class="md" v-html="answerHtml" /><span
            v-if="message.streaming && !message.thinkingActive"
            class="cursor"
          >▍</span>
        </div>

        <SkillConfirmCard
          v-if="confirmData && !message.streaming"
          :data="confirmData"
          :content="message.reply?.content"
          @resolved="onConfirmResolved"
        />

        <div v-if="message.reply?.data && message.reply.notice" class="notice">
          业务系统提示：{{ message.reply.notice }}
        </div>
      </div>

      <div v-if="!message.streaming" class="actions">
        <button type="button" title="复制" @click="copy">
          <el-icon><CopyDocument /></el-icon>
          <span>复制</span>
        </button>
        <button type="button" title="基于此重新提问" @click="emit('regenerate')">
          <el-icon><RefreshRight /></el-icon>
          <span>重新提问</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  align-items: flex-start;
}
.avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--ds-brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}
.body {
  min-width: 0;
  flex: 1;
  max-width: min(100%, 620px);
}
.content {
  color: var(--ds-title);
}
.content.error {
  color: var(--ds-danger);
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ds-danger-bg);
  border: 1px solid #fecdca;
}
.content.waiting {
  color: #b54708;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ds-warning-bg);
  border: 1px solid #f9dbaf;
}
.text {
  word-break: break-word;
  font-size: 15px;
  line-height: 1.65;
  color: inherit;
}
.md-body {
  display: block;
}
.md :deep(p) {
  margin: 0 0 0.65em;
}
.md :deep(p:last-child) {
  margin-bottom: 0;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 0.4em 0 0.65em;
  padding-left: 1.4em;
}
.md :deep(li) {
  margin: 0.25em 0;
  line-height: 1.55;
}
.md :deep(li > ul),
.md :deep(li > ol) {
  margin: 0.15em 0 0.3em;
}
.md :deep(strong) {
  font-weight: 650;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
  margin: 0.85em 0 0.4em;
  font-size: 1.05em;
  font-weight: 650;
  line-height: 1.4;
}
.md :deep(h1:first-child),
.md :deep(h2:first-child),
.md :deep(h3:first-child) {
  margin-top: 0;
}
.md :deep(hr) {
  margin: 0.85em 0;
  border: none;
  border-top: 1px solid var(--ds-line, #e5e7eb);
}
.md :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.06);
}
.md :deep(pre) {
  margin: 0.5em 0;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 0.88em;
  line-height: 1.5;
}
.md :deep(pre code) {
  padding: 0;
  background: transparent;
}
.md :deep(blockquote) {
  margin: 0.5em 0;
  padding: 0.25em 0 0.25em 0.85em;
  border-left: 3px solid var(--ds-line, #e5e7eb);
  color: var(--ds-muted, #667085);
}
.md :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0 0.75em;
  font-size: 0.92em;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--ds-line, #e5e7eb);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.md :deep(th) {
  background: rgba(15, 23, 42, 0.04);
  font-weight: 600;
}
.md :deep(a) {
  color: var(--ds-brand, #2563eb);
  text-decoration: none;
}
.md :deep(a:hover) {
  text-decoration: underline;
}
.cursor {
  display: inline-block;
  margin-left: 1px;
  animation: blink 1s step-end infinite;
  color: var(--ds-brand);
}
@keyframes blink {
  50% { opacity: 0; }
}
.notice {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ds-muted, #667085);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--ds-muted, #667085);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
.actions button:hover {
  color: var(--ds-title);
  background: rgba(15, 23, 42, 0.04);
}
</style>
