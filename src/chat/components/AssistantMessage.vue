<script setup lang="ts">
import { computed, ref } from 'vue'
import { CopyDocument, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  cellText,
  downloadExportFile,
  plainText,
  replyDataBlocks,
  type ConfirmationPendingData,
  type Reply,
  type ReplyDataBlock,
} from '../api'
import { renderMarkdown } from '../markdown'
import { errorMessage } from '../../shared/http'
import type { ArtifactFile, ChatMessage } from '../types'
import DeliveryResultCard from './DeliveryResultCard.vue'
import DocumentPreviewDrawer from './DocumentPreviewDrawer.vue'
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
/** 展平 bundle，得到可直接渲染的 table/record（file 走交付卡片）。 */
const displayBlocks = computed(() =>
  replyDataBlocks(props.message.reply?.data).filter(
    (b): b is Extract<ReplyDataBlock, { kind: 'table' | 'record' }> =>
      b.kind === 'table' || b.kind === 'record',
  ),
)
const hasStructuredTable = computed(() => displayBlocks.value.length > 0)
const showData = ref(true)
const previewOpen = ref(false)
const previewFile = ref<ArtifactFile | null>(null)
const showThinking = computed(
  () =>
    !!props.message.thinkingActive ||
    !!(props.message.thinking && props.message.thinking.length > 0),
)
/** 思考进行中且尚无正文时只展示思考块，避免空气泡抢视觉。 */
const showAnswer = computed(() => {
  const t = answerSource(props.message)
  if (props.message.thinkingActive && !t) return false
  return true
})

const answerHtml = computed(() => renderMarkdown(answerSource(props.message)))

function answerSource(m: ChatMessage): string {
  // 仅在下方会渲染结构化表时去掉 Markdown 表格行，避免重复；否则保留原文表格
  const raw = m.text || ''
  const blocks = replyDataBlocks(m.reply?.data)
  const willRenderTable = blocks.some((b) => b.kind === 'table' || b.kind === 'record')
  if (!willRenderTable) return raw
  return raw
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('|')
    })
    .join('\n')
}

async function copy() {
  try {
    await navigator.clipboard.writeText(plainText(props.message.text))
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function onPreview(file: ArtifactFile) {
  previewFile.value = file
  previewOpen.value = true
}

function onConfirmResolved(reply: Reply) {
  emit('confirmResolved', reply)
}

async function onDownload(file: ArtifactFile) {
  if (file.exportTicket) {
    try {
      await downloadExportFile(file.exportTicket, file.name)
    } catch (e) {
      ElMessage.error(errorMessage(e))
    }
    return
  }
  if (!file.downloadUrl) {
    ElMessage.info(file.previewNote || '该文件暂无真实下载地址（演示数据或后端未提供）')
    return
  }
  window.open(file.downloadUrl, '_blank', 'noopener')
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

        <DeliveryResultCard
          v-if="message.delivery && !message.streaming"
          :delivery="message.delivery"
          @view-data="showData = !showData"
          @preview="onPreview"
          @download="onDownload"
        />

        <!-- 表格/详情默认直接展示（含 bundle）；交付卡「查看数据」可折叠 -->
        <template v-if="hasStructuredTable && showData">
          <div v-for="(block, idx) in displayBlocks" :key="`${block.kind}-${idx}`" class="data-wrap">
            <div v-if="block.title" class="data-title">{{ block.title }}</div>
            <el-table
              v-if="block.kind === 'table'"
              :data="block.items"
              size="small"
              border
              class="data-table"
            >
              <el-table-column
                v-for="c in block.columns"
                :key="c.key"
                :label="c.label"
                min-width="90"
                show-overflow-tooltip
              >
                <template #default="{ row }">{{ cellText(row[c.key]) }}</template>
              </el-table-column>
            </el-table>
            <el-descriptions
              v-else
              :column="1"
              size="small"
              border
              class="data-table"
            >
              <el-descriptions-item
                v-for="f in block.fields"
                :key="f.key"
                :label="f.label"
              >
                {{ cellText(block.item[f.key]) }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </template>

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

    <DocumentPreviewDrawer v-model:open="previewOpen" :file="previewFile" />
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
  background: #0f172a0a;
  border: 1px solid var(--ds-line, #e5e7eb);
}
.md :deep(pre code) {
  padding: 0;
  background: transparent;
}
.md :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  font-size: 13px;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--ds-line, #e5e7eb);
  padding: 6px 8px;
  text-align: left;
}
.md :deep(blockquote) {
  margin: 0.5em 0;
  padding: 4px 12px;
  border-left: 3px solid var(--ds-brand, #2563eb);
  color: var(--ds-muted, #667085);
}
.cursor {
  color: var(--ds-brand);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.data-wrap {
  margin-top: 10px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--ds-line);
  background: #fff;
}
.data-title {
  padding: 8px 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ds-title, #111827);
}
.data-table {
  margin: 0;
  max-width: 100%;
}
.notice {
  margin-top: 10px;
  padding: 8px 12px;
  border-left: 3px solid var(--ds-warning);
  background: var(--ds-warning-bg);
  color: #8a5a00;
  font-size: 13px;
  white-space: pre-wrap;
  border-radius: 0 8px 8px 0;
}
.actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.row:hover .actions {
  opacity: 1;
}
.actions button {
  border: none;
  background: transparent;
  color: var(--ds-muted);
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.actions button:hover {
  background: var(--ds-brand-soft);
  color: var(--ds-brand);
}
@media (hover: none) {
  .actions {
    opacity: 1;
  }
}
</style>
