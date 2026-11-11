<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { errorMessage } from '../shared/http'
import {
  clearTicket,
  createThread,
  deleteThread,
  getRun,
  getThreadMessages,
  hasTicket,
  listThreads,
  mapThreadMessages,
  openSession,
  patchThread,
  assistantDisplayFields,
  pollSettings,
  sendMessageStream,
  StreamAbortedError,
  uploadAttachments,
  switchThread,
  takeLaunchCode,
  threadDisplayTitle,
  welcomeExamples,
  type ChatThreadItem,
  type SkillMenuItem,
} from './api'
import { MockAgentAdapter, mapRunStatus } from './agent/adapter'
import { buildDelivery, exportArtifact } from './delivery'
import { isOrchestratorDownError, isSessionExpiredError } from './bootstrap-errors'
import { backToOa, requestOaRelaunch } from './oa-relay'
import AppLayout from './components/AppLayout.vue'
import { canSendMessage } from './components/files-from-clipboard'
import {
  findReusableEmptyConversation,
  isConfirmedEmptyConversation,
} from './empty-conversation'
import type {
  AgentTask,
  ChatMessage,
  LocalConversation,
  NavKey,
  PendingAttachment,
} from './types'

const embedded = new URLSearchParams(window.location.search).get('embed') === '1'

type ShellState = 'loading' | 'ready' | 'expired' | 'no_launch' | 'orchestrator_down'
const state = ref<ShellState>('loading')
const loadError = ref('')
const loadingTip = ref('')
const relaunchFailed = ref(false)
const relaunching = ref(false)
const storedLaunchCode = ref('')
const displayName = ref('')
const threadId = ref('')
const skills = ref<SkillMenuItem[]>([])
const chatEnabled = ref(false)
const examples = ref<string[]>([])
const maxChars = ref(500)
let poll = pollSettings({})

const LOAD_SOFT_TIP_MS = 3000
const LOAD_ORCHESTRATOR_DOWN_MS = 15000
let loadSoftTipTimer: number | undefined
let loadFailTimer: number | undefined

const input = ref('')
const sending = ref(false)
const attachments = ref<PendingAttachment[]>([])

const sidebarCollapsed = ref(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
const inspectorOpen = ref(typeof window !== 'undefined' ? window.innerWidth > 1100 : true)
const memoryOpen = ref(false)
const activeNav = ref<NavKey>('conversations')

const conversations = ref<LocalConversation[]>([])
const activeConversationId = ref('')
const loadingMessages = ref(false)
/** 快速连点时，只采纳最后一次切换的结果。 */
let viewGen = 0
const messages = computed({
  get: () => conversations.value.find((c) => c.id === activeConversationId.value)?.messages ?? [],
  set: (list: ChatMessage[]) => {
    const c = conversations.value.find((x) => x.id === activeConversationId.value)
    if (c) {
      c.messages = list
      c.updatedAt = Date.now()
      if (list.length && !(c.title ?? '').trim()) {
        const firstUser = list.find((m) => m.role === 'user')
        if (firstUser) c.title = firstUser.text.slice(0, 24) || null
      }
    }
  },
})

const currentTask = ref<AgentTask | null>(null)
let abortCtrl: AbortController | null = null
const pollTimers = new Set<number>()
let onResize: (() => void) | undefined

const mockAdapter = new MockAgentAdapter({
  onTask: (t) => {
    currentTask.value = t
  },
})

const skillNames = computed(() => skills.value.map((s) => s.display_name))
const placeholder = computed(() =>
  examples.value[0] ? `例如：${examples.value[0]}（Enter 发送，Shift+Enter 换行）` : undefined,
)
const sessionTitle = computed(() => {
  const c = conversations.value.find((x) => x.id === activeConversationId.value)
  return threadDisplayTitle(c?.title)
})

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function rememberExport(reply: Parameters<typeof exportArtifact>[0]) {
  const file = exportArtifact(reply)
  if (!file) return
  const task = currentTask.value
  if (!task || task.mock) return
  if (!task.artifacts.some((a) => a.exportTicket === file.exportTicket)) task.artifacts.push(file)
}

function convFromThread(t: ChatThreadItem): LocalConversation {
  const raw = (t.title ?? '').trim()
  return {
    id: t.thread_id,
    title: raw || null,
    updatedAt: Date.parse(t.last_message_at || t.updated_at) || Date.now(),
    messages: [],
    lastChannel: t.last_channel,
  }
}

function mergeThreadList(items: ChatThreadItem[]) {
  const byId = new Map(conversations.value.map((c) => [c.id, c]))
  conversations.value = items.map((t) => {
    const prev = byId.get(t.thread_id)
    return prev
      ? {
          ...convFromThread(t),
          messages: prev.messages,
          historyLoaded: prev.historyLoaded,
        }
      : convFromThread(t)
  })
}

async function loadThreads() {
  try {
    const res = await listThreads(1, 50)
    mergeThreadList(res.items)
    if (threadId.value && !conversations.value.some((c) => c.id === threadId.value)) {
      conversations.value = [
        convFromThread({
          thread_id: threadId.value,
          title: null,
          status: 'active',
          created_channel: 'oa_web',
          last_channel: null,
          pinned: false,
          created_at: '',
          updated_at: '',
          last_message_at: null,
        }),
        ...conversations.value,
      ]
    }
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

function rememberThreadMessages(id: string, items: Awaited<ReturnType<typeof getThreadMessages>>) {
  const mapped = mapThreadMessages(items).map((m) => ({
    ...m,
    delivery: buildDelivery(m.reply, null) ?? undefined,
  }))
  const c = conversations.value.find((x) => x.id === id)
  if (c) {
    c.messages = mapped
    c.historyLoaded = true
  }
  if (activeConversationId.value !== id) return
  const lastFile = [...mapped].reverse().find((m) => exportArtifact(m.reply))
  const file = lastFile ? exportArtifact(lastFile.reply) : null
  if (!file) return
  currentTask.value = {
    id: file.id,
    name: '导出文件',
    status: 'completed',
    progress: 100,
    createdAt: Date.now(),
    elapsedMs: 0,
    steps: [],
    tools: [],
    artifacts: [file],
    approvals: [],
    mock: false,
  }
}

async function loadMessagesForThread(id: string, gen = viewGen) {
  const cached = conversations.value.find((c) => c.id === id)?.historyLoaded
  if (!cached) loadingMessages.value = true
  try {
    const items = await getThreadMessages(id)
    if (gen !== viewGen) return
    rememberThreadMessages(id, items)
  } catch (e) {
    if (gen !== viewGen) return
    const status = (e as { status?: number }).status
    if (status === 401) {
      expire()
      return
    }
    ElMessage.error(errorMessage(e))
  } finally {
    if (gen === viewGen) loadingMessages.value = false
  }
}

function ensureActiveThread() {
  if (!activeConversationId.value && threadId.value) activeConversationId.value = threadId.value
}

function clearLoadTimers() {
  window.clearTimeout(loadSoftTipTimer)
  window.clearTimeout(loadFailTimer)
  loadSoftTipTimer = loadFailTimer = undefined
}

function markOrchestratorDown(message?: string) {
  clearLoadTimers()
  loadError.value = message ?? '无法连接到智能助手服务，请稍后再试。'
  state.value = 'orchestrator_down'
}

function startLoadTimers() {
  clearLoadTimers()
  loadingTip.value = ''
  loadSoftTipTimer = window.setTimeout(() => {
    if (state.value === 'loading') loadingTip.value = '正在连接…'
  }, LOAD_SOFT_TIP_MS)
  loadFailTimer = window.setTimeout(() => {
    if (state.value === 'loading') markOrchestratorDown('连接超时，智能助手服务可能暂时不可用。')
  }, LOAD_ORCHESTRATOR_DOWN_MS)
}

function expire(message?: string) {
  clearTicket()
  clearLoadTimers()
  abortCtrl?.abort()
  if (message) loadError.value = message
  relaunchFailed.value = false
  state.value = 'expired'
}

function bootstrapDemoShell() {
  displayName.value = '演示员工'
  threadId.value = 'demo_thread'
  activeConversationId.value = 'demo_thread'
  chatEnabled.value = true
  examples.value = ['帮我查本月报销进度', '汇总待我审批的单据']
  skills.value = [
    {
      name: 'oa_query',
      display_name: 'OA 查询',
      description: '演示能力',
      examples: ['帮我查本月报销进度'],
    },
  ]
  conversations.value = Array.from({ length: 14 }, (_, i) => ({
    id: `demo_${i + 1}`,
    title: i === 0 ? '本月报销进度咨询' : `历史会话示例 ${i + 1}`,
    updatedAt: Date.now() - i * 3600_000,
    messages: [],
    lastChannel: i % 2 === 0 ? 'oa_web' : 'wecom',
  }))
  activeConversationId.value = conversations.value[0].id
  threadId.value = conversations.value[0].id
  state.value = 'ready'
}

async function bootstrap(fromRetry = false) {
  if (
    import.meta.env.DEV &&
    !fromRetry &&
    new URLSearchParams(window.location.search).get('demo') === '1'
  ) {
    bootstrapDemoShell()
    return
  }

  if (!fromRetry) {
    const code = takeLaunchCode()
    if (!code) {
      state.value = 'no_launch'
      return
    }
    storedLaunchCode.value = code
  }
  if (!storedLaunchCode.value) {
    state.value = 'no_launch'
    return
  }

  state.value = 'loading'
  loadError.value = ''
  relaunchFailed.value = false
  startLoadTimers()

  try {
    const s = await openSession(storedLaunchCode.value)
    clearLoadTimers()
    loadingTip.value = ''
    displayName.value = s.display_name
    threadId.value = s.thread_id || ''
    skills.value = s.skills ?? []
    chatEnabled.value = !!s.chat
    maxChars.value = s.message_max_chars ?? 500
    poll = pollSettings(s)
    examples.value = welcomeExamples(skills.value)
    activeConversationId.value = threadId.value
    await loadThreads()
    ensureActiveThread()
    await loadMessagesForThread(activeConversationId.value)
    state.value = 'ready'
  } catch (e) {
    clearLoadTimers()
    loadingTip.value = ''
    loadError.value = errorMessage(e)
    if (isSessionExpiredError(e)) {
      expire()
      return
    }
    if (isOrchestratorDownError(e)) {
      markOrchestratorDown(loadError.value)
      return
    }
    expire()
  }
}

async function retryBootstrap() {
  await bootstrap(true)
}

async function onRelaunch() {
  relaunchFailed.value = false
  relaunching.value = true
  try {
    if (embedded) {
      await requestOaRelaunch(3000)
      return
    }
    window.location.reload()
  } catch {
    relaunchFailed.value = true
  } finally {
    relaunching.value = false
  }
}

onMounted(async () => {
  onResize = () => {
    if (window.innerWidth <= 768) sidebarCollapsed.value = true
  }
  window.addEventListener('resize', onResize)
  await bootstrap()
})

onBeforeUnmount(() => {
  if (onResize) window.removeEventListener('resize', onResize)
  clearLoadTimers()
  pollTimers.forEach((t) => window.clearTimeout(t))
  abortCtrl?.abort()
  mockAdapter.dispose()
})

function pollRun(msg: ChatMessage, startedAt = Date.now()) {
  if (!msg.runId || Date.now() - startedAt > poll.maxMs) return
  const timer = window.setTimeout(async () => {
    pollTimers.delete(timer)
    if (!hasTicket()) return
    try {
      const r = await getRun(msg.runId!)
      if (r.done && r.reply) {
        msg.reply = r.reply
        Object.assign(msg, assistantDisplayFields(r.reply.content), { thinkingActive: false })
        msg.delivery = buildDelivery(r.reply, currentTask.value) ?? undefined
        mockAdapter.syncLiveStatus(mapRunStatus(r.run_status))
        rememberExport(r.reply)
        return
      }
      if (r.run_status) mockAdapter.syncLiveStatus(mapRunStatus(r.run_status))
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        expire()
        return
      }
    }
    pollRun(msg, startedAt)
  }, poll.intervalMs)
  pollTimers.add(timer)
}

function patchMessages(mutator: (list: ChatMessage[]) => void) {
  const list = [...messages.value]
  mutator(list)
  messages.value = list
}

function isUploadCancel(signal: AbortSignal, error?: unknown): boolean {
  if (signal.aborted) return true
  const name = (error as { name?: string } | undefined)?.name
  return name === 'AbortError' || name === 'StreamAbortedError'
}

function clearSentDraft(pending: PendingAttachment[]) {
  input.value = ''
  const sent = new Set(pending.map((item) => item.id))
  for (const item of pending) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
  attachments.value = attachments.value.filter((item) => !sent.has(item.id))
}

let sendInFlight = false

async function send(text?: string) {
  const message = (text ?? input.value).trim()
  const pending = attachments.value.slice()
  if (sendInFlight || !canSendMessage(message, pending.length, sending.value) || !hasTicket()) return
  ensureActiveThread()

  sendInFlight = true
  sending.value = true
  abortCtrl = new AbortController()
  const signal = abortCtrl.signal
  try {
    let attachmentIds: string[] = []
    if (pending.length) {
      const files = pending.map((a) => a.file).filter((f): f is File => f instanceof File)
      if (files.length !== pending.length) {
        ElMessage.error('有附件缺少本地文件，请重新选择')
        return
      }
      try {
        const uploaded = await uploadAttachments(files, signal)
        if (isUploadCancel(signal)) return
        if (uploaded.length !== files.length || uploaded.some((item) => !item.file_id)) {
          throw new Error('附件上传结果不完整，请重试')
        }
        attachmentIds = uploaded.map((item) => item.file_id)
      } catch (e) {
        if (isUploadCancel(signal, e)) return
        if ((e as { status?: number }).status === 401) {
          expire()
          return
        }
        ElMessage.error(errorMessage(e))
        return
      }
    }
    if (isUploadCancel(signal)) return

    mockAdapter.syncLiveStatus('running', message.slice(0, 28))

    let liveId: string | null = null
    let streamRaw = ''
    try {
      const r = await sendMessageStream(
        message,
        (piece) => {
          if (!liveId) {
            liveId = uid('msg')
            streamRaw = ''
            patchMessages((list) => {
              list.push({ id: liveId!, role: 'assistant', text: '', streaming: true, createdAt: Date.now() })
            })
          }
          streamRaw += piece
          const display = assistantDisplayFields(streamRaw)
          patchMessages((list) => {
            const m = list.find((x) => x.id === liveId)
            if (m) Object.assign(m, display)
          })
        },
        signal,
        attachmentIds,
      )
      const atts = pending.map((a, i) => ({
        id: attachmentIds[i] || a.id,
        name: a.name,
        size: a.size,
        mime: a.mime,
      }))
      const userMsg: ChatMessage = {
        id: uid('msg'),
        role: 'user',
        text: message,
        createdAt: Date.now(),
        attachments: atts.length ? atts : undefined,
      }
      const delivery = buildDelivery(r.reply, currentTask.value)
      const finalDisplay = assistantDisplayFields(r.reply.content)
      const done: ChatMessage = {
        id: liveId ?? uid('msg'),
        role: 'assistant',
        text: finalDisplay.text,
        thinking: finalDisplay.thinking,
        thinkingActive: false,
        reply: r.reply,
        runId: r.run_id,
        streaming: false,
        createdAt: Date.now(),
        delivery: delivery ?? undefined,
      }
      patchMessages((list) => {
        const idx = liveId ? list.findIndex((item) => item.id === liveId) : -1
        if (idx >= 0) list.splice(idx, 0, userMsg)
        else list.push(userMsg)
        if (liveId) {
          const m = list.find((item) => item.id === liveId)
          if (m) Object.assign(m, done)
          else list.push(done)
        } else list.push(done)
      })
      clearSentDraft(pending)
      mockAdapter.syncLiveStatus(mapRunStatus(r.run_status))
      rememberExport(r.reply)
      if (r.reply.type === 'pending') {
        const last = messages.value[messages.value.length - 1]
        if (last) pollRun(last)
      }
      void loadThreads()
    } catch (e) {
      if (e instanceof StreamAbortedError) {
        patchMessages((list) => {
          if (liveId) {
            const m = list.find((x) => x.id === liveId)
            if (m) {
              m.streaming = false
              m.thinkingActive = false
              if (!m.text && !m.thinking) m.text = '已停止生成'
              m.reply = { type: 'text', content: m.text, data: null }
            }
          }
        })
        mockAdapter.stop()
        return
      }
      const status = (e as { status?: number }).status
      if (status === 401) {
        expire()
        return
      }
      const failed: ChatMessage = {
        id: liveId ?? uid('msg'),
        role: 'assistant',
        text: errorMessage(e),
        reply: { type: 'error', content: errorMessage(e), data: null },
        streaming: false,
        createdAt: Date.now(),
      }
      patchMessages((list) => {
        if (liveId) {
          const m = list.find((x) => x.id === liveId)
          if (m) Object.assign(m, failed)
          else list.push(failed)
        } else list.push(failed)
      })
      mockAdapter.syncLiveStatus('failed')
    }
  } finally {
    sendInFlight = false
    sending.value = false
    abortCtrl = null
  }
}

function stop() {
  abortCtrl?.abort()
  mockAdapter.stop()
}

/** 静默清理已确认空白对话，防止堆积空会话。 */
async function discardEmptyConversation(id: string) {
  if (!id || id === activeConversationId.value) return
  const c = conversations.value.find((x) => x.id === id)
  if (!isConfirmedEmptyConversation(c)) return
  try {
    await deleteThread(id)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401) {
      expire()
      return
    }
    // 清理失败不打断主流程；下次再点新对话仍会复用/重试
    return
  }
  conversations.value = conversations.value.filter((x) => x.id !== id)
}

async function newChat() {
  if (sending.value) return

  const reusable = findReusableEmptyConversation(conversations.value, activeConversationId.value)
  if (reusable) {
    viewGen += 1
    loadingMessages.value = false
    input.value = ''
    currentTask.value = null
    mockAdapter.dispose()
    activeNav.value = 'conversations'
    if (reusable.id === activeConversationId.value) {
      threadId.value = reusable.id
      return
    }
    await selectConversation(reusable.id)
    return
  }

  viewGen += 1
  loadingMessages.value = false
  try {
    const t = await createThread()
    threadId.value = t.thread_id
    const c = convFromThread(t)
    c.historyLoaded = true
    conversations.value = [c, ...conversations.value.filter((x) => x.id !== t.thread_id)]
    activeConversationId.value = t.thread_id
    input.value = ''
    currentTask.value = null
    mockAdapter.dispose()
    activeNav.value = 'conversations'
    ElMessage.success('已新建对话')
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401) {
      expire()
      return
    }
    ElMessage.error(errorMessage(e))
  }
}

async function selectConversation(id: string) {
  if (id === activeConversationId.value || sending.value) return
  const previousId = activeConversationId.value
  const gen = ++viewGen
  activeNav.value = 'conversations'
  activeConversationId.value = id
  currentTask.value = null
  mockAdapter.dispose()
  const messagesP = loadMessagesForThread(id, gen)
  try {
    const sw = await switchThread(id)
    if (gen !== viewGen) return
    threadId.value = sw.thread_id
  } catch (e) {
    if (gen !== viewGen) return
    activeConversationId.value = previousId
    loadingMessages.value = false
    const status = (e as { status?: number }).status
    if (status === 401) {
      expire()
      return
    }
    ElMessage.error(errorMessage(e))
    return
  }
  await messagesP
  if (gen !== viewGen) return
  // 离开空白新对话时自动删除，避免空会话堆积
  void discardEmptyConversation(previousId)
}

async function renameConversation(id: string, title: string) {
  const c = conversations.value.find((x) => x.id === id)
  if (!c) return
  const next = title.trim().slice(0, 40)
  if (!next) return
  try {
    const t = await patchThread(id, { title: next })
    c.title = (t.title ?? '').trim() || null
    c.updatedAt = Date.parse(t.updated_at) || Date.now()
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401) {
      expire()
      return
    }
    ElMessage.error(errorMessage(e))
  }
}

async function removeConversation(id: string) {
  const c = conversations.value.find((x) => x.id === id)
  if (!c) return
  try {
    await ElMessageBox.confirm(`确定删除「${threadDisplayTitle(c.title)}」？`, '删除会话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteThread(id)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401) {
      expire()
      return
    }
    ElMessage.error(errorMessage(e))
    return
  }
  conversations.value = conversations.value.filter((x) => x.id !== id)
  if (activeConversationId.value === id) {
    currentTask.value = null
    mockAdapter.dispose()
    if (conversations.value.length) await selectConversation(conversations.value[0].id)
    else await newChat()
    return
  }
  ElMessage.success('已删除')
}

function onNav(key: NavKey) {
  activeNav.value = key
  if (key === 'tasks') {
    inspectorOpen.value = true
    ElMessage.info('AI 任务详情见右侧任务检查器')
  } else if (key === 'approvals') {
    inspectorOpen.value = true
    ElMessage.info(currentTask.value?.approvals.length ? '请在右侧处理待审批事项' : '暂无待审批事项')
  } else if (key !== 'conversations') {
    ElMessage.info('该模块接口尚未接入，当前为导航占位')
  }
}

async function onApprove(id: string) {
  try {
    await mockAdapter.approve(id)
    ElMessage.success('已批准（演示适配层，未调用真实审批 API）')
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

async function onReject(id: string) {
  try {
    await mockAdapter.reject(id)
    ElMessage.success('已拒绝（演示适配层）')
  } catch (e) {
    ElMessage.error(errorMessage(e))
  }
}

function onOpenTools() {
  activeNav.value = 'tools'
  ElMessage.info(`可用能力：${skillNames.value.join('、') || '暂无'}。工具中心完整目录待后端开放。`)
}

function onRegenerate(msg: ChatMessage) {
  const idx = messages.value.findIndex((m) => m.id === msg.id)
  if (idx <= 0) return
  const prev = messages.value[idx - 1]
  if (prev?.role === 'user') send(prev.text)
}

watch(activeNav, (k) => {
  if (k === 'conversations') ensureActiveThread()
})

defineExpose({
  send,
  stop,
  input,
  sending,
  attachments,
  messages,
  conversations,
  activeConversationId,
  threadId,
})
</script>

<template>
  <div class="chat-root">
    <div v-if="state === 'loading'" class="center">
      <el-skeleton :rows="4" animated style="width: 360px" />
      <p v-if="loadingTip" class="load-tip">{{ loadingTip }}</p>
    </div>

    <el-result
      v-else-if="state === 'no_launch'"
      icon="info"
      title="请从 OA 进入"
      sub-title="东审财税 AI 智能工作台仅支持从 OA 系统内打开，以确认你的身份。请关闭本页，在 OA 中打开「智能助手」。"
    />

    <el-result v-else-if="state === 'orchestrator_down'" icon="error" title="暂时无法连接" :sub-title="loadError">
      <template #extra>
        <el-button type="primary" @click="retryBootstrap">重试</el-button>
        <el-button @click="backToOa">回 OA</el-button>
      </template>
    </el-result>

    <el-result
      v-else-if="state === 'expired'"
      icon="warning"
      title="会话已失效"
      :sub-title="
        relaunchFailed
          ? '未能从 OA 重新进入，请返回 OA 后再次打开智能助手。'
          : loadError || '登录状态已过期，请重新从 OA 进入。'
      "
    >
      <template #extra>
        <el-button type="primary" :loading="relaunching" @click="onRelaunch">重新进入</el-button>
        <el-button v-if="relaunchFailed || embedded" @click="backToOa">回 OA</el-button>
      </template>
    </el-result>

    <AppLayout
      v-else
      :embedded="embedded"
      :display-name="displayName"
      :session-title="sessionTitle"
      :sidebar-collapsed="sidebarCollapsed"
      :inspector-open="inspectorOpen"
      :active-nav="activeNav"
      :conversations="conversations"
      :active-conversation-id="activeConversationId"
      :messages="messages"
      :sending="sending"
      :history-loading="loadingMessages"
      :examples="examples"
      :skill-names="skillNames"
      :chat-enabled="chatEnabled"
      :input="input"
      :max-chars="maxChars"
      :attachments="attachments"
      :task="currentTask"
      :thread-id="threadId"
      :placeholder="placeholder"
      :memory-open="memoryOpen"
      @update:sidebar-collapsed="sidebarCollapsed = $event"
      @update:memory-open="memoryOpen = $event"
      @open-memory="memoryOpen = true"
      @update:inspector-open="inspectorOpen = $event"
      @update:active-nav="onNav"
      @update:input="input = $event"
      @update:attachments="attachments = $event"
      @new-chat="newChat"
      @select="selectConversation"
      @rename="renameConversation"
      @remove="removeConversation"
      @send="send()"
      @stop="stop"
      @example="send"
      @regenerate="onRegenerate"
      @open-tools="onOpenTools"
      @approve="onApprove"
      @reject="onReject"
    />
  </div>
</template>

<style scoped>
.chat-root {
  height: 100%;
  min-height: 100vh;
  background: var(--ds-page);
}
.center {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.load-tip {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.chat-root :deep(.el-result) {
  padding-top: 12vh;
}
</style>
