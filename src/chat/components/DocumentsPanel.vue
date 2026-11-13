<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Document, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { downloadDocumentFile, listDocuments, type ChatDocumentItem } from '../api'
import { errorMessage } from '../../shared/http'

const props = defineProps<{ active: boolean }>()

const loading = ref(false)
const items = ref<ChatDocumentItem[]>([])
const filter = ref<'all' | 'upload' | 'export'>('all')

const uploads = computed(() => items.value.filter((i) => i.origin === 'upload'))
const exports = computed(() => items.value.filter((i) => i.origin === 'export'))

function sizeLabel(n: number) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(iso?: string | null) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function load() {
  loading.value = true
  try {
    const origin = filter.value === 'all' ? undefined : filter.value
    const res = await listDocuments(1, 100, origin)
    items.value = res.items
  } catch (e) {
    ElMessage.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

async function onDownload(row: ChatDocumentItem) {
  try {
    await downloadDocumentFile(row.file_id, row.filename || '文件')
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

watch(
  () => props.active,
  (v) => {
    if (v) void load()
  },
)

watch(filter, () => {
  if (props.active) void load()
})

onMounted(() => {
  if (props.active) void load()
})
</script>

<template>
  <section class="docs">
    <header class="head">
      <div>
        <h2>文档中心</h2>
        <p>查看你上传的附件与对话中导出的文件</p>
      </div>
      <el-radio-group v-model="filter" size="small">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="upload">我上传的</el-radio-button>
        <el-radio-button label="export">导出的</el-radio-button>
      </el-radio-group>
    </header>

    <div v-loading="loading" class="body">
      <template v-if="filter !== 'export'">
        <h3 class="section-title">我上传的</h3>
        <ul v-if="uploads.length" class="list">
          <li v-for="row in uploads" :key="row.file_id" class="item">
            <el-icon class="ico"><Document /></el-icon>
            <div class="meta">
              <span class="name" :title="row.filename">{{ row.filename || '附件' }}</span>
              <span class="sub">{{ sizeLabel(row.size_bytes) }} · {{ formatTime(row.created_at) }}</span>
            </div>
            <button type="button" class="dl" @click="onDownload(row)">
              <el-icon><Download /></el-icon>
              下载
            </button>
          </li>
        </ul>
        <p v-else class="empty">暂无上传附件</p>
      </template>

      <template v-if="filter !== 'upload'">
        <h3 class="section-title">导出的</h3>
        <ul v-if="exports.length" class="list">
          <li v-for="row in exports" :key="row.file_id" class="item">
            <el-icon class="ico"><Document /></el-icon>
            <div class="meta">
              <span class="name" :title="row.filename">{{ row.filename || '导出文件' }}</span>
              <span class="sub">{{ sizeLabel(row.size_bytes) }} · {{ formatTime(row.created_at) }}</span>
            </div>
            <button type="button" class="dl" @click="onDownload(row)">
              <el-icon><Download /></el-icon>
              下载
            </button>
          </li>
        </ul>
        <p v-else class="empty">暂无导出文件</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.docs {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ds-page);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--ds-line);
  flex-wrap: wrap;
}
.head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  color: var(--ds-title);
  font-weight: 650;
}
.head p {
  margin: 0;
  font-size: 13px;
  color: var(--ds-muted);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 28px;
  max-width: 720px;
}
.section-title {
  margin: 12px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ds-muted);
  letter-spacing: 0.02em;
}
.list {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ds-line);
  border-radius: 10px;
  background: #fff;
}
.ico {
  color: var(--ds-brand);
  flex-shrink: 0;
}
.meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name {
  font-size: 14px;
  color: var(--ds-title);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 12px;
  color: var(--ds-muted);
}
.dl {
  border: none;
  background: var(--ds-brand-soft);
  color: var(--ds-brand);
  border-radius: 8px;
  height: 32px;
  padding: 0 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  flex-shrink: 0;
}
.dl:hover {
  background: var(--ds-brand);
  color: #fff;
}
.empty {
  margin: 0 0 20px;
  color: var(--ds-muted);
  font-size: 13px;
}
</style>
