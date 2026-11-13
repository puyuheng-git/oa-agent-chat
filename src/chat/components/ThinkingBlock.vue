<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'

const props = defineProps<{
  content: string
  /** 流式中思考段未闭合 */
  active?: boolean
  streaming?: boolean
}>()

/** 默认收起为单行；用户可展开多行。 */
const expanded = ref(false)

watch(
  () => props.active,
  (active, wasActive) => {
    // 思考结束后保持单行收起，不自动展开
    if (!active && wasActive) expanded.value = false
  },
)

const label = computed(() => (props.active ? '正在思考' : '思考过程'))
const preview = computed(() => (props.content || '').replace(/\s+/g, ' ').trim())

function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="think" :class="{ active: active, open: expanded }">
    <button
      type="button"
      class="think-head"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span class="think-pulse" aria-hidden="true">
        <span class="dot" />
        <span class="dot" />
        <span class="dot" />
      </span>
      <span class="think-label">{{ label }}</span>
      <span v-if="!expanded && preview" class="think-preview">{{ preview }}</span>
      <el-icon class="think-chevron" :class="{ open: expanded }">
        <ArrowRight />
      </el-icon>
    </button>

    <div v-show="expanded" class="think-panel">
      <div class="think-body">
        {{ content }}<span v-if="active && streaming" class="cursor">▍</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.think {
  margin: 0 0 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  transition:
    background 0.2s var(--ds-ease),
    border-color 0.2s var(--ds-ease);
}
.think.active,
.think.open {
  background: linear-gradient(180deg, var(--ds-brand-mist), transparent 120%);
  border-color: var(--ds-line);
}
.think-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 10px;
  margin: 0;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ds-muted);
  font-size: 12px;
  line-height: 1.4;
  max-width: 100%;
  text-align: left;
}
.think-head:hover {
  color: var(--ds-brand);
  background: var(--ds-brand-soft);
}
.think-pulse {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  width: 18px;
  justify-content: center;
  flex-shrink: 0;
}
.think-pulse .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--ds-muted);
  opacity: 0.55;
}
.think.active .think-pulse .dot {
  background: var(--ds-brand);
  animation: think-bounce 1.15s ease-in-out infinite;
}
.think.active .think-pulse .dot:nth-child(2) {
  animation-delay: 0.14s;
}
.think.active .think-pulse .dot:nth-child(3) {
  animation-delay: 0.28s;
}
.think:not(.active) .think-pulse .dot:nth-child(2),
.think:not(.active) .think-pulse .dot:nth-child(3) {
  display: none;
}
.think:not(.active) .think-pulse .dot:first-child {
  width: 6px;
  height: 6px;
  opacity: 0.7;
  background: var(--ds-brand);
}
.think-label {
  font-weight: 560;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.think-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--ds-body);
  opacity: 0.85;
}
.think-chevron {
  font-size: 12px;
  transition: transform 0.18s var(--ds-ease);
  color: inherit;
  flex-shrink: 0;
  margin-left: auto;
}
.think-chevron.open {
  transform: rotate(90deg);
}
.think-panel {
  padding: 0 10px 10px;
}
.think-body {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--ds-line);
  color: var(--ds-body);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: min(240px, 40vh);
  overflow-y: auto;
}
.think.active .think-body {
  border-color: #cfe6f8;
  box-shadow: inset 0 0 0 1px rgba(0, 138, 231, 0.04);
}
.cursor {
  color: var(--ds-brand);
  animation: blink 1s steps(2) infinite;
}
@keyframes think-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-2px);
    opacity: 1;
  }
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .think.active .think-pulse .dot,
  .cursor {
    animation: none;
  }
  .think-chevron {
    transition: none;
  }
}
</style>
