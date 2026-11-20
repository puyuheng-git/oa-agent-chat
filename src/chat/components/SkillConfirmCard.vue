<script setup lang="ts">
import { computed, ref } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { decideConfirmation, type ConfirmationPendingData, type Reply } from '../api'
import { errorMessage } from '../../shared/http'

const props = defineProps<{
  data: ConfirmationPendingData
  content?: string
}>()

const emit = defineEmits<{
  resolved: [reply: Reply]
}>()

const loading = ref<'confirm' | 'reject' | null>(null)
const done = ref<'confirm' | 'reject' | null>(null)
const showBody = ref(false)

const preview = computed(() => props.data.preview || {})
const isSkill = computed(() => (props.data.confirm_kind || preview.value.kind) === 'skill_pack')
const actionLabel = computed(() => (preview.value.action === 'update' ? '更新' : '创建'))
const title = computed(() => {
  if (isSkill.value) {
    const name = preview.value.name || '未命名'
    return `确认${actionLabel.value}个人 Skill「${name}」`
  }
  return '请确认操作'
})

async function act(kind: 'confirm' | 'reject') {
  if (done.value || loading.value) return
  const taskId = props.data.task_id
  const token = props.data.token
  if (!taskId || !token) {
    ElMessage.error('确认信息不完整，请重新发起')
    return
  }
  loading.value = kind
  try {
    const result = await decideConfirmation(taskId, token, kind)
    done.value = kind
    emit('resolved', result.reply)
    ElMessage.success(kind === 'confirm' ? '已确认' : '已取消')
  } catch (e) {
    ElMessage.error(errorMessage(e))
  } finally {
    loading.value = null
  }
}
</script>

<template>
  <div class="card">
    <div class="head">
      <el-icon color="#F79009"><WarningFilled /></el-icon>
      <strong>{{ title }}</strong>
    </div>
    <p v-if="content" class="desc">{{ content }}</p>
    <template v-if="isSkill">
      <p v-if="preview.description" class="meta">
        <span class="label">描述</span>{{ preview.description }}
      </p>
      <button v-if="preview.skill_md" type="button" class="toggle" @click="showBody = !showBody">
        {{ showBody ? '收起 SKILL.md' : '展开 SKILL.md 草稿' }}
      </button>
      <pre v-if="showBody && preview.skill_md" class="md">{{ preview.skill_md }}</pre>
    </template>
    <div v-if="!done" class="acts">
      <button type="button" class="reject" :disabled="!!loading" @click="act('reject')">
        {{ loading === 'reject' ? '处理中…' : '取消' }}
      </button>
      <button type="button" class="approve" :disabled="!!loading" @click="act('confirm')">
        {{ loading === 'confirm' ? '处理中…' : isSkill ? `确认${actionLabel}` : '确认' }}
      </button>
    </div>
    <div v-else class="result">
      {{ done === 'confirm' ? '已确认写入' : '已取消，未保存' }}
    </div>
  </div>
</template>

<style scoped>
.card {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--ds-radius-sm, 8px);
  border: 1px solid #f9dbaf;
  background: var(--ds-warning-bg, #fffaf0);
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ds-title, #101828);
  font-size: 13px;
}
.desc,
.meta {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ds-body, #344054);
  white-space: pre-wrap;
}
.label {
  display: inline-block;
  margin-right: 6px;
  color: #b54708;
  font-weight: 600;
}
.toggle {
  margin-top: 8px;
  border: none;
  background: transparent;
  color: var(--ds-brand, #2563eb);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.md {
  margin: 8px 0 0;
  max-height: 240px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ds-line, #e5e7eb);
  background: #fff;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.acts {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}
.acts button {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.reject {
  border: 1px solid var(--ds-line, #e5e7eb);
  background: #fff;
  color: var(--ds-body, #344054);
}
.approve {
  border: none;
  background: var(--ds-brand, #2563eb);
  color: #fff;
}
.acts button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.result {
  margin-top: 10px;
  font-size: 12px;
  color: #b54708;
}
</style>
