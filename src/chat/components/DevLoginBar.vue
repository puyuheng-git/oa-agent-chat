<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  oa: string
  passphrase: string
  displayName: string
  sessionOa: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  'update:oa': [v: string]
  'update:passphrase': [v: string]
  submit: []
}>()

const localOa = ref(props.oa)
const localPass = ref(props.passphrase)

watch(
  () => props.oa,
  (v) => {
    localOa.value = v
  },
)
watch(
  () => props.passphrase,
  (v) => {
    localPass.value = v
  },
)

function onSubmit() {
  emit('update:oa', localOa.value.trim())
  emit('update:passphrase', localPass.value)
  emit('submit')
}
</script>

<template>
  <div class="dev-bar" role="region" aria-label="开发登录">
    <span class="badge">开发登录</span>
    <label class="field">
      <span>OA</span>
      <input
        v-model="localOa"
        type="text"
        autocomplete="username"
        placeholder="员工 OA 号"
        :disabled="submitting"
        @keydown.enter.prevent="onSubmit"
      />
    </label>
    <label class="field">
      <span>口令</span>
      <input
        v-model="localPass"
        type="password"
        autocomplete="current-password"
        placeholder="开发口令"
        :disabled="submitting"
        @keydown.enter.prevent="onSubmit"
      />
    </label>
    <button type="button" class="go" :disabled="submitting || !localOa.trim() || !localPass" @click="onSubmit">
      {{ sessionOa ? '切换身份' : '进入' }}
    </button>
    <span v-if="sessionOa || displayName" class="who" :title="sessionOa">
      当前：{{ displayName || sessionOa }}<template v-if="sessionOa">（{{ sessionOa }}）</template>
    </span>
  </div>
</template>

<style scoped>
.dev-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  padding: 8px 14px;
  background: #fff7e6;
  border-bottom: 1px solid #ffd591;
  font-size: 13px;
  color: #873800;
  flex-shrink: 0;
  z-index: 6;
}
.badge {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fa8c16;
  color: #fff;
  font-size: 12px;
}
.field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.field span {
  white-space: nowrap;
}
.field input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid #ffd591;
  border-radius: 4px;
  background: #fff;
  color: #333;
  min-width: 120px;
}
.go {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: #d46b08;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.go:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.who {
  margin-left: auto;
  opacity: 0.9;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
