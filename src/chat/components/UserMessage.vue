<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { downloadOwnedFile, fetchOwnedFileBlob, isImageAttachment } from '../api'
import { errorMessage } from '../../shared/http'
import type { ChatMessage, PendingAttachment } from '../types'

const props = defineProps<{ message: ChatMessage }>()

const previewUrls = ref<Record<string, string>>({})

function sizeLabel(n: number) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function revokeAll() {
  for (const url of Object.values(previewUrls.value)) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  previewUrls.value = {}
}

async function loadPreviews() {
  revokeAll()
  const next: Record<string, string> = {}
  for (const a of props.message.attachments || []) {
    if (!isImageAttachment(a)) continue
    if (a.previewUrl) {
      next[a.id] = a.previewUrl
      continue
    }
    if (!a.id || a.id.startsWith('att_')) continue
    try {
      const blob = await fetchOwnedFileBlob(a.id)
      next[a.id] = URL.createObjectURL(blob)
    } catch {
      // 预览失败仍可点下载
    }
  }
  previewUrls.value = next
}

async function onDownload(a: PendingAttachment) {
  if (!a.id) return
  try {
    await downloadOwnedFile(a.id, a.name)
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

watch(
  () => props.message.attachments?.map((a) => a.id).join(',') ?? '',
  () => {
    void loadPreviews()
  },
)

onMounted(() => {
  void loadPreviews()
})

onBeforeUnmount(() => {
  revokeAll()
})
</script>

<template>
  <div class="row user">
    <div v-if="message.attachments?.length && !message.text" class="atts-only">
      <template v-for="a in message.attachments" :key="a.id">
        <button
          v-if="previewUrls[a.id]"
          type="button"
          class="img-card"
          :title="`下载 ${a.name}`"
          @click="onDownload(a)"
        >
          <img :src="previewUrls[a.id]" :alt="a.name" class="shot" />
        </button>
        <button
          v-else
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
      </template>
    </div>
    <div v-else class="bubble">
      <div v-if="message.text" class="text">{{ message.text }}</div>
      <div v-if="message.attachments?.length" class="atts-wrap">
        <template v-for="a in message.attachments" :key="a.id">
          <button
            v-if="previewUrls[a.id]"
            type="button"
            class="img-inline"
            :title="a.name"
            @click="onDownload(a)"
          >
            <img :src="previewUrls[a.id]" :alt="a.name" />
          </button>
          <button v-else type="button" class="att-link" @click="onDownload(a)">{{ a.name }}</button>
        </template>
      </div>
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
.atts-wrap {
  margin: 8px 0 0;
  padding: 8px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.att-link {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: 12px;
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
.img-card,
.img-inline {
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  display: block;
  box-shadow: 0 1px 4px rgba(23, 43, 77, 0.12);
}
.img-card .shot,
.img-inline img {
  display: block;
  max-width: min(280px, 70vw);
  max-height: 220px;
  object-fit: contain;
  background: #fff;
}
.img-inline img {
  max-width: min(220px, 60vw);
  max-height: 160px;
  border-radius: 8px;
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
