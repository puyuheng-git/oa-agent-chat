<script setup lang="ts">
import { Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { downloadOwnedFile } from '../api'
import { errorMessage } from '../../shared/http'
import type { ChatMessage, PendingAttachment } from '../types'

defineProps<{ message: ChatMessage }>()

function sizeLabel(n: number) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function onDownload(a: PendingAttachment) {
  if (!a.id) return
  try {
    await downloadOwnedFile(a.id, a.name)
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}
</script>

<template>
  <div class="row user">
    <div v-if="message.attachments?.length && !message.text" class="atts-only">
      <button
        v-for="a in message.attachments"
        :key="a.id"
        type="button"
        class="att-card"
        :title="`下载 ${a.name}`"
        @click="onDownload(a)"
      >
        <el-icon class="ico"><Document /></el-icon>
        <span class="meta">
          <span class="name">{{ a.name }}</span>
          <span v-if="a.size" class="size">{{ sizeLabel(a.size) }}</span>
        </span>
      </button>
    </div>
    <div v-else class="bubble">
      <div v-if="message.text" class="text">{{ message.text }}</div>
      <ul v-if="message.attachments?.length" class="atts">
        <li v-for="a in message.attachments" :key="a.id">
          <button type="button" class="att-link" @click="onDownload(a)">{{ a.name }}</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  margin-bottom: 16px;
}
.user {
  justify-content: flex-end;
}
.bubble {
  max-width: min(85%, 520px);
  padding: 10px 14px;
  border-radius: 12px 12px 4px 12px;
  background: var(--ds-brand);
  color: #fff;
}
.text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.55;
}
.atts {
  margin: 8px 0 0;
  padding: 8px 0 0;
  list-style: none;
  font-size: 12px;
  opacity: 0.9;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
}
.atts li {
  padding: 2px 0;
}
.att-link {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.atts-only {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  max-width: min(85%, 520px);
}
.att-card {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 240px;
  padding: 8px 12px;
  border: 1px solid var(--ds-line);
  border-radius: 10px;
  background: #fff;
  color: var(--ds-title);
  cursor: pointer;
  text-align: left;
  box-shadow: 0 1px 2px rgba(23, 43, 77, 0.06);
}
.att-card:hover {
  border-color: var(--ds-brand);
  color: var(--ds-brand);
}
.ico {
  flex-shrink: 0;
  color: var(--ds-brand);
}
.meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.size {
  font-size: 11px;
  color: var(--ds-muted);
}
</style>
