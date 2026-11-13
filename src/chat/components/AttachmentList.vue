<script setup lang="ts">
import { Document, Close } from '@element-plus/icons-vue'
import type { PendingAttachment } from '../types'
import { isImageAttachment } from '../api'

defineProps<{ items: PendingAttachment[] }>()
const emit = defineEmits<{ remove: [id: string] }>()

function sizeLabel(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <ul v-if="items.length" class="list">
    <li v-for="a in items" :key="a.id" class="item" :class="{ image: isImageAttachment(a) && a.previewUrl }">
      <img v-if="isImageAttachment(a) && a.previewUrl" :src="a.previewUrl" :alt="a.name" class="thumb" />
      <el-icon v-else class="ico"><Document /></el-icon>
      <div class="meta">
        <span class="name" :title="a.name">{{ a.name }}</span>
        <span class="size">{{ sizeLabel(a.size) }} · 待发送（本地）</span>
      </div>
      <button type="button" class="rm" aria-label="移除附件" @click="emit('remove', a.id)">
        <el-icon><Close /></el-icon>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 240px;
  padding: 6px 8px 6px 10px;
  background: var(--ds-brand-soft);
  border: 1px solid var(--ds-line);
  border-radius: var(--ds-radius-sm);
}
.item.image {
  max-width: 160px;
  flex-direction: column;
  align-items: stretch;
  padding: 6px;
}
.thumb {
  width: 100%;
  height: 88px;
  object-fit: cover;
  border-radius: 6px;
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
}
.name {
  font-size: 12px;
  color: var(--ds-title);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.size {
  font-size: 11px;
  color: var(--ds-muted);
}
.rm {
  border: none;
  background: transparent;
  color: var(--ds-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-self: flex-start;
}
.item.image .rm {
  position: absolute;
  /* keep simple: stay in flex */
  align-self: flex-end;
  margin-top: -28px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
}
.item.image {
  position: relative;
}
.rm:hover {
  color: var(--ds-danger);
}
</style>
