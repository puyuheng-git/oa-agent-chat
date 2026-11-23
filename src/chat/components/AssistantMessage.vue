<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CopyDocument, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  downloadExportFile,
  plainText,
  type ConfirmationPendingData,
  type Reply,
} from '../api'
import { exportArtifact, linkifyExportFilename, parseExportDownloadHref } from '../delivery'
import { renderMarkdown, renderMarkdownEnhanced } from '../markdown'
import { errorMessage } from '../../shared/http'
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
const exportFile = computed(() => exportArtifact(props.message.reply))
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

const answerHtml = ref('')
/** 回答里点开的图片地址；空字符串表示灯箱关闭。 */
const lightboxSrc = ref('')
/** 过期的增强结果不能盖住更新的正文。 */
let renderSeq = 0

watch(
  () =>
    [props.message.text, props.message.streaming, exportFile.value?.exportTicket, exportFile.value?.name] as const,
  async ([text, streaming, ticket, name], _prev, onCleanup) => {
    const seq = ++renderSeq
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    const raw = text || ''
    // 有导出票据时，把加粗文件名改成可点链接（替代已移除的交付卡下载按钮）
    const linked = ticket ? linkifyExportFilename(raw, name || '', ticket) : raw
    // 流式中只走同步基础 Markdown，避免半截公式/图把界面卡住
    if (streaming) {
      answerHtml.value = renderMarkdown(linked)
      return
    }
    answerHtml.value = renderMarkdown(linked)
    try {
      const enhanced = await renderMarkdownEnhanced(linked)
      if (cancelled || seq !== renderSeq) return
      answerHtml.value = enhanced
    } catch {
      // 增强失败就留着上面的基础 HTML
    }
  },
  { immediate: true },
)

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

function closeLightbox() {
  lightboxSrc.value = ''
}

/** 拦截代码块复制、正文图片灯箱，以及回答内导出锚点（带 Bearer 的 blob 下载）。 */
async function onAnswerClick(e: MouseEvent) {
  const el = e.target
  if (!(el instanceof Element)) return
  const copyBtn = el.closest('.md-code__copy')
  if (copyBtn instanceof HTMLElement) {
    e.preventDefault()
    const pre = copyBtn.closest('.md-code')?.querySelector('code, pre')
    const t = pre?.textContent || ''
    try {
      await navigator.clipboard.writeText(t)
      ElMessage.success('已复制代码')
    } catch {
      ElMessage.error('复制失败')
    }
    return
  }
  // 正文图片：同一张图全屏看，点遮罩关掉
  const img = el.closest('img')
  if (img instanceof HTMLImageElement) {
    const raw = (img.getAttribute('src') || '').trim()
    if (!raw) return
    e.preventDefault()
    lightboxSrc.value = img.currentSrc || img.src
    return
  }
  const a = el.closest('a')
  if (!a) return
  const parsed = parseExportDownloadHref(a.getAttribute('href') || '')
  if (!parsed) return
  e.preventDefault()
  const name = exportFile.value?.name || a.textContent?.trim() || '导出.xlsx'
  try {
    await downloadExportFile(parsed.ticket, name)
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
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
          <div class="md" v-html="answerHtml" @click="onAnswerClick" /><span
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
    <Teleport to="body">
      <div v-if="lightboxSrc" class="img-lightbox" @click="closeLightbox">
        <img :src="lightboxSrc" alt="" />
      </div>
    </Teleport>
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
.md {
  min-width: 0;
  max-width: 100%;
}
.md :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  cursor: zoom-in;
}
.img-lightbox {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.72);
  cursor: zoom-out;
}
.img-lightbox img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}
.md :deep(.md-container) {
  margin: 0.65em 0;
  padding: 10px 12px 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--ds-line, #e5e7eb);
  border-left-width: 3px;
  background: var(--ds-card, #fff);
}
.md :deep(.md-container)::before {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
}
.md :deep(.md-container__body > :first-child) {
  margin-top: 0;
}
.md :deep(.md-container__body > :last-child) {
  margin-bottom: 0;
}
.md :deep(.md-container--tip) {
  border-left-color: var(--ds-brand);
  background: var(--ds-brand-mist);
}
.md :deep(.md-container--tip)::before {
  content: '提示';
  color: var(--ds-brand-deep);
}
.md :deep(.md-container--info) {
  border-left-color: var(--ds-brand-deep);
  background: var(--ds-brand-soft);
}
.md :deep(.md-container--info)::before {
  content: '说明';
  color: var(--ds-brand-deep);
}
.md :deep(.md-container--warning) {
  border-left-color: var(--ds-warning);
  background: var(--ds-warning-bg);
}
.md :deep(.md-container--warning)::before {
  content: '注意';
  color: #b54708;
}
.md :deep(.md-container--danger) {
  border-left-color: var(--ds-danger);
  background: var(--ds-danger-bg);
}
.md :deep(.md-container--danger)::before {
  content: '警告';
  color: var(--ds-danger);
}
.md :deep(.md-container--details) {
  border-left-color: var(--ds-muted);
  background: rgba(15, 23, 42, 0.03);
}
.md :deep(.md-container--details > summary) {
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  color: var(--ds-muted);
}
.md :deep(.md-container--details[open] > summary) {
  margin-bottom: 4px;
}
.md :deep(.md-code) {
  position: relative;
  margin: 0.65em 0;
  border: 1px solid var(--ds-line, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.03);
}
.md :deep(.md-code[data-lang]:not([data-lang=''])::before) {
  content: attr(data-lang);
  display: block;
  padding: 6px 72px 6px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ds-muted, #667085);
  border-bottom: 1px solid var(--ds-line, #e5e7eb);
}
.md :deep(.md-code__copy) {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 1;
  border: none;
  background: transparent;
  color: var(--ds-muted, #667085);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.md :deep(.md-code__copy:hover) {
  color: var(--ds-title);
  background: rgba(15, 23, 42, 0.06);
}
.md :deep(.md-code pre) {
  margin: 0;
  border-radius: 0;
}
.md :deep(.md-code:not([data-lang]) pre),
.md :deep(.md-code[data-lang=''] pre) {
  padding-top: 28px;
}
.md :deep(.md-mermaid) {
  margin: 0.65em 0;
  overflow-x: auto;
}
.md :deep(.md-mermaid svg) {
  display: block;
  max-width: 100%;
  height: auto;
}
.md :deep(.md-mermaid__error) {
  margin: 0 0 0.4em;
  font-size: 12px;
  color: var(--ds-danger);
}
.md :deep(ul.contains-task-list) {
  list-style: none;
  padding-left: 0.2em;
}
.md :deep(li.task-list-item) {
  list-style: none;
}
.md :deep(li.task-list-item label) {
  pointer-events: none;
  user-select: text;
}
.md :deep(.task-list-item-checkbox) {
  margin: 0 0.45em 0 0;
  vertical-align: middle;
}
.md :deep(.footnote-ref) {
  font-size: 0.75em;
  line-height: 0;
}
.md :deep(hr.footnotes-sep) {
  margin: 1em 0 0.6em;
}
.md :deep(.footnotes) {
  margin-top: 0;
  font-size: 0.88em;
  color: var(--ds-muted, #667085);
}
.md :deep(.footnote-item) {
  margin: 0.25em 0;
}
.md :deep(.footnote-backref) {
  text-decoration: none;
}
.md :deep(.katex-display) {
  margin: 0.6em 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
.md :deep(.katex) {
  max-width: 100%;
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
