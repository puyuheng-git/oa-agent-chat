<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Document,
  Plus,
  Setting,
  Stamp,
  Tools,
  OfficeBuilding,
  List,
  Fold,
  Expand,
  Collection,
  Notebook,
  Search,
  EditPen,
  Delete,
  ArrowDown,
} from '@element-plus/icons-vue'
import { formatRelativeTime, threadDisplayTitle } from '../api'
import type { LocalConversation, NavKey } from '../types'

const props = defineProps<{
  collapsed: boolean
  activeNav: NavKey
  conversations: LocalConversation[]
  activeConversationId: string
}>()

const emit = defineEmits<{
  'update:collapsed': [v: boolean]
  'update:activeNav': [k: NavKey]
  'new-chat': []
  select: [id: string]
  rename: [id: string, title: string]
  remove: [id: string]
  'open-memory': []
}>()

const query = ref('')
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
/** 分区展开状态独立于侧栏收起，避免「展开导航」时被强制全部打开；工作空间默认展开以免登录后看不到入口 */
const workspaceOpen = ref(true)
const manageOpen = ref(true)

const workspaceItems: { key: NavKey; label: string; icon: unknown }[] = [
  { key: 'workspace', label: 'Skill管理', icon: OfficeBuilding },
  { key: 'tasks', label: 'AI 任务', icon: List },
  { key: 'documents', label: '文档中心', icon: Document },
  { key: 'knowledge', label: '企业知识库', icon: Collection },
]

const manageItems: { key: NavKey; label: string; icon: unknown }[] = [
  { key: 'tools', label: '工具中心', icon: Tools },
  { key: 'approvals', label: '审批中心', icon: Stamp },
  { key: 'settings', label: '设置', icon: Setting },
]

type CollapsedNavKey = NavKey | 'memory'
const collapsedNavItems: { key: CollapsedNavKey; label: string; icon: unknown }[] = [
  ...workspaceItems,
  { key: 'memory', label: '我的记忆', icon: Notebook },
  ...manageItems,
]

function onCollapsedNav(key: CollapsedNavKey) {
  if (key === 'memory') emit('open-memory')
  else emit('update:activeNav', key)
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.conversations
  return props.conversations.filter((c) => threadDisplayTitle(c.title).toLowerCase().includes(q))
})

function channelLabel(ch: string | null | undefined) {
  if (!ch) return ''
  if (ch === 'oa_web') return '网页'
  if (ch === 'wecom') return '企微'
  return ch
}

function startRename(c: LocalConversation, e: Event) {
  e.stopPropagation()
  renamingId.value = c.id
  renameDraft.value = threadDisplayTitle(c.title)
}

function commitRename() {
  if (!renamingId.value) return
  const title = renameDraft.value.trim()
  if (title) emit('rename', renamingId.value, title)
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

function onRemove(id: string, e: Event) {
  e.stopPropagation()
  emit('remove', id)
}

function toggleWorkspace() {
  workspaceOpen.value = !workspaceOpen.value
}

function toggleManage() {
  manageOpen.value = !manageOpen.value
}
</script>

<template>
  <aside :class="['sidebar', { collapsed }]">
    <div class="sidebar-bg" aria-hidden="true">
      <span class="orb orb-a" />
      <span class="orb orb-b" />
      <span class="orb orb-c" />
      <span class="shine" />
    </div>

    <div class="brand">
      <div class="logo" aria-hidden="true"><span>东</span></div>
      <div v-if="!collapsed" class="brand-text">
        <strong>东审财税</strong>
        <span>AI 智能工作台</span>
      </div>
    </div>

    <div class="sidebar-top">
      <button type="button" class="new-chat" @click="emit('new-chat')">
        <el-icon :size="16"><Plus /></el-icon>
        <span v-if="!collapsed">新对话</span>
      </button>

      <div v-if="!collapsed" class="search">
        <el-icon class="search-ico"><Search /></el-icon>
        <input v-model="query" type="search" placeholder="搜索历史会话" aria-label="搜索历史会话" />
      </div>
    </div>

    <!-- 历史会话：独占弹性滚动区，不再与底部导航抢高度 -->
    <section v-show="!collapsed" class="conv-zone" aria-label="历史会话">
      <div class="zone-label">历史会话</div>
      <ul class="conv-list">
        <li v-for="c in filtered" :key="c.id" class="conv-li">
          <div
            :class="['conv', { active: c.id === activeConversationId }]"
            @click="emit('select', c.id)"
          >
            <template v-if="renamingId === c.id">
              <input
                v-model="renameDraft"
                class="rename-input"
                maxlength="40"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename"
              />
            </template>
            <template v-else>
              <div class="conv-main">
                <el-tooltip :content="threadDisplayTitle(c.title)" placement="right" :show-after="400">
                  <span class="conv-title">{{ threadDisplayTitle(c.title) }}</span>
                </el-tooltip>
                <span v-if="c.lastChannel || c.updatedAt" class="conv-meta">
                  <span v-if="channelLabel(c.lastChannel)">{{ channelLabel(c.lastChannel) }}</span>
                  <span v-if="formatRelativeTime(new Date(c.updatedAt).toISOString())">
                    {{ formatRelativeTime(new Date(c.updatedAt).toISOString()) }}
                  </span>
                </span>
              </div>
              <div class="conv-acts">
                <button type="button" title="重命名" @click="startRename(c, $event)">
                  <el-icon :size="14"><EditPen /></el-icon>
                </button>
                <button type="button" title="删除" @click="onRemove(c.id, $event)">
                  <el-icon :size="14"><Delete /></el-icon>
                </button>
              </div>
            </template>
          </div>
        </li>
        <li v-if="!filtered.length" class="empty-hint">
          {{ query.trim() ? '无匹配会话' : '暂无对话记录' }}
        </li>
      </ul>
    </section>

    <!-- 收起态：独立图标轨，不改动分区展开状态，避免展开导航时整组弹开卡顿 -->
    <nav v-if="collapsed" class="collapsed-rail" aria-label="快捷导航">
      <button
        v-for="item in collapsedNavItems"
        :key="item.key"
        type="button"
        :class="['nav-item', { active: item.key !== 'memory' && activeNav === item.key }]"
        :title="item.label"
        @click="onCollapsedNav(item.key)"
      >
        <el-icon :size="18"><component :is="item.icon" /></el-icon>
      </button>
    </nav>

    <!-- 展开态底部停靠：工作空间 + 管理中心 -->
    <div v-else class="sidebar-dock">
      <nav class="dock-block" aria-label="工作空间">
        <button
          type="button"
          class="group-toggle"
          :aria-expanded="workspaceOpen"
          @click="toggleWorkspace"
        >
          <span>工作空间</span>
          <el-icon :size="14" :class="['chevron', { open: workspaceOpen }]"><ArrowDown /></el-icon>
        </button>
        <div :class="['accordion', { open: workspaceOpen }]">
          <div class="accordion-inner">
            <div class="group-body">
              <button
                v-for="item in workspaceItems"
                :key="item.key"
                type="button"
                :class="['nav-item', { active: activeNav === item.key }]"
                :title="item.label"
                @click="emit('update:activeNav', item.key)"
              >
                <el-icon :size="18"><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
                <span v-if="activeNav === item.key" class="nav-dot" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <nav class="dock-block manage" aria-label="管理中心">
        <button
          type="button"
          class="group-toggle"
          :aria-expanded="manageOpen"
          @click="toggleManage"
        >
          <span>管理中心</span>
          <el-icon :size="14" :class="['chevron', { open: manageOpen }]"><ArrowDown /></el-icon>
        </button>
        <div :class="['accordion', { open: manageOpen }]">
          <div class="accordion-inner">
            <div class="group-body manage-body">
              <button type="button" class="nav-item" title="我的记忆" @click="emit('open-memory')">
                <el-icon :size="18"><Notebook /></el-icon>
                <span>我的记忆</span>
              </button>
              <button
                v-for="item in manageItems"
                :key="item.key"
                type="button"
                :class="['nav-item', { active: activeNav === item.key }]"
                :title="item.label"
                @click="emit('update:activeNav', item.key)"
              >
                <el-icon :size="18"><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
                <span v-if="activeNav === item.key" class="nav-dot" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>

    <button
      type="button"
      class="collapse-btn"
      :title="collapsed ? '展开导航' : '收起导航'"
      @click="emit('update:collapsed', !collapsed)"
    >
      <el-icon :size="16">
        <Expand v-if="collapsed" />
        <Fold v-else />
      </el-icon>
      <span v-if="!collapsed">收起导航</span>
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  --dock-pad: 8px;
  position: relative;
  width: var(--ds-sidebar-w);
  color: #fff;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  transition: width 0.2s var(--ds-ease);
  flex-shrink: 0;
  overflow: hidden;
  z-index: 2;
  isolation: isolate;
  contain: layout style paint;
}
.sidebar-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(168deg, #1aa3f0 0%, #008ae7 42%, #0068b8 100%);
  z-index: -1;
  overflow: hidden;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  opacity: 0.45;
  pointer-events: none;
  will-change: transform;
  animation: orb-drift 18s var(--ds-ease) infinite alternate;
}
.orb-a {
  width: 160px;
  height: 160px;
  top: -48px;
  right: -40px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 70%);
}
.orb-b {
  width: 120px;
  height: 120px;
  bottom: 18%;
  left: -36px;
  background: radial-gradient(circle, rgba(120, 210, 255, 0.5) 0%, rgba(0, 100, 180, 0) 72%);
  animation-duration: 22s;
  animation-delay: -4s;
}
.orb-c {
  width: 90px;
  height: 90px;
  bottom: 8%;
  right: 10%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.28) 0%, transparent 70%);
  animation-duration: 14s;
  animation-delay: -8s;
}
.shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(255, 255, 255, 0.08) 48%,
    transparent 62%
  );
  background-size: 220% 100%;
  animation: shine-sweep 9s ease-in-out infinite;
  pointer-events: none;
}
@keyframes orb-drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(12px, 18px, 0) scale(1.08);
  }
}
@keyframes shine-sweep {
  0%,
  100% {
    background-position: 120% 0;
  }
  50% {
    background-position: -20% 0;
  }
}

.sidebar.collapsed {
  width: var(--ds-sidebar-collapsed);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px 12px;
  flex-shrink: 0;
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: 800;
  font-size: 15px;
  box-shadow: 0 4px 14px rgba(0, 60, 120, 0.18);
  transition: transform 0.28s var(--ds-ease), box-shadow 0.28s var(--ds-ease);
}
.logo:hover {
  transform: translateY(-1px) scale(1.04);
  box-shadow: 0 8px 18px rgba(0, 60, 120, 0.22);
}
.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.25;
  animation: fade-rise 0.35s var(--ds-ease) both;
}
.brand-text strong {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.brand-text span {
  font-size: 12px;
  opacity: 0.85;
}

.sidebar-top {
  padding: 0 10px 8px;
  flex-shrink: 0;
}

.new-chat {
  width: 100%;
  height: 40px;
  margin-bottom: 8px;
  border: none;
  border-radius: 11px;
  background: #fff;
  color: var(--ds-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0, 50, 100, 0.12);
  transition: transform 0.2s var(--ds-ease), box-shadow 0.2s var(--ds-ease), filter 0.2s;
}
.new-chat:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(0, 50, 100, 0.16);
  filter: brightness(1.02);
}
.new-chat:active {
  transform: translateY(0) scale(0.98);
}
.sidebar.collapsed .new-chat {
  width: 44px;
  margin-inline: auto;
  padding: 0;
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.search:focus-within {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.36);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
}
.search-ico {
  opacity: 0.8;
  flex-shrink: 0;
}
.search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 13px;
  outline: none;
}
.search input::placeholder {
  color: rgba(255, 255, 255, 0.65);
}

.conv-zone {
  flex: 1 1 auto;
  min-height: 96px;
  display: flex;
  flex-direction: column;
  padding: 0 10px 6px;
  overflow: hidden;
}
.zone-label {
  flex-shrink: 0;
  margin: 2px 0 6px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.72;
}
.conv-list {
  list-style: none;
  margin: 0;
  padding: 0 0 4px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.conv {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-height: 40px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.18s, transform 0.18s var(--ds-ease);
}
.conv:hover {
  background: rgba(255, 255, 255, 0.14);
  transform: translateX(2px);
}
.conv.active {
  background: rgba(255, 255, 255, 0.24);
  box-shadow: inset 3px 0 0 #fff;
}
.conv-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.conv-title {
  font-size: 13px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conv-meta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  line-height: 1.2;
  opacity: 0.72;
}
.conv-meta span + span::before {
  content: '·';
  margin-right: 6px;
  opacity: 0.85;
}
.conv-acts {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}
.conv:hover .conv-acts,
.conv.active .conv-acts {
  display: inline-flex;
}
.conv-acts button {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.15s;
}
.conv-acts button:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: scale(1.06);
}
.rename-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: none;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--ds-title);
}
.empty-hint {
  padding: 12px 10px;
  font-size: 12px;
  opacity: 0.75;
}
.collapsed-rail {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.collapsed-rail .nav-item {
  width: 44px;
  justify-content: center;
  padding-inline: 0;
}
.collapsed-rail .nav-item:hover {
  transform: none;
}

.sidebar-dock {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(180deg, rgba(0, 70, 130, 0.12) 0%, rgba(0, 55, 110, 0.22) 100%);
  /* 保证管理中心展开时仍有充足可视高度，历史区自行收缩滚动 */
  min-height: min(268px, 42vh);
  max-height: min(58vh, 480px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.dock-block {
  border-radius: 12px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.dock-block:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.16);
}
.dock-block.manage {
  min-height: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.group-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.95);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.18s;
}
.group-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}
.chevron {
  transition: transform 0.28s var(--ds-ease);
  opacity: 0.85;
}
.chevron.open {
  transform: rotate(180deg);
}

/* GPU 友好手风琴：用 grid 行高过渡，避免 max-height 卡顿 */
.accordion {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s var(--ds-ease);
  pointer-events: none;
}
.accordion.open {
  grid-template-rows: 1fr;
  pointer-events: auto;
}
.accordion-inner {
  overflow: hidden;
  min-height: 0;
}
.group-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px 6px;
}
.manage-body {
  padding-bottom: 8px;
  gap: 3px;
}

.nav-item {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 11px 12px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 550;
  cursor: pointer;
  transition: background 0.18s, transform 0.18s var(--ds-ease), padding 0.18s;
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.14);
  transform: translateX(3px);
}
.nav-item.active {
  background: rgba(255, 255, 255, 0.22);
  font-weight: 650;
  box-shadow: inset 3px 0 0 #fff;
}
.nav-dot {
  margin-left: auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.2);
  animation: pulse-dot 1.6s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}
.sidebar.collapsed .nav-item {
  justify-content: center;
  padding-inline: 0;
}
.sidebar.collapsed .nav-item:hover {
  transform: none;
}

.collapse-btn {
  margin: 6px 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.95);
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
  transition: background 0.18s, transform 0.18s var(--ds-ease), border-color 0.18s;
}
.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
  transform: translateY(-1px);
}
.sidebar.collapsed .collapse-btn {
  justify-content: center;
}

@keyframes fade-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 50;
    width: min(300px, 88vw) !important;
    transform: translateX(-105%);
    box-shadow: 12px 0 40px rgba(23, 43, 77, 0.28);
    transition: transform 0.28s var(--ds-ease);
  }
  .sidebar:not(.collapsed) {
    transform: translateX(0);
  }
  .sidebar-dock {
    max-height: min(46vh, 360px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .orb,
  .shine,
  .nav-dot,
  .brand-text {
    animation: none !important;
  }
  .sidebar,
  .accordion {
    transition: none;
  }
  .nav-item:hover,
  .conv:hover,
  .new-chat:hover,
  .collapse-btn:hover,
  .logo:hover {
    transform: none;
  }
}
</style>
