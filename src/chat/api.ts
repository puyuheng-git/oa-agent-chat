import { ApiError, apiUrl, newIdempotencyKey, request } from '../shared/http'

/** 管理后台配置的可用能力，用于欢迎页。 */
export interface SkillMenuItem {
  name: string
  display_name: string
  description: string
  examples: string[]
  /** Skill 首次入库时间（ISO）；欢迎示例只展示近三天新加的。 */
  created_at?: string | null
  /** 该 Skill 依赖 Tool 中最近一次「首次入库」时间（ISO）。 */
  newest_tool_created_at?: string | null
}

export interface ChatSessionInfo {
  ticket: string
  expires_in: number
  display_name: string
  thread_id: string
  skills?: SkillMenuItem[]
  /** 是否支持日常聊天（发布配置允许且有可用模型）。 */
  chat?: boolean
  /** 以下来自后台「配置中心」。 */
  message_max_chars?: number
  poll_interval_seconds?: number
  poll_max_minutes?: number
}

export type DataRow = Record<string, unknown>

export interface DataColumn {
  key: string
  label: string
}

/** 结构化结果：列名/字段名来自 Tool 配置，页面不写死业务字段。 */
export type ReplyData =
  | { kind: 'table'; tool: string; title: string; columns: DataColumn[]; items: DataRow[]; total: number | null }
  | { kind: 'record'; tool: string; title: string; fields: DataColumn[]; item: DataRow }
  | {
      kind: 'file'
      tool: string
      title: string
      filename: string
      ticket: string
      expires_in?: number | null
      size_bytes?: number | null
    }
  | null

export interface Reply {
  type: 'markdown' | 'text' | 'error' | 'pending'
  content: string
  data: ReplyData
  error_code?: string
  /** 业务系统随结果返回的提示语 */
  notice?: string
  /** 多步查询依次调用的 Tool */
  chain?: string[]
}

export interface MessageResult {
  run_id: string
  thread_id: string
  run_status: string
  reply: Reply
}

export interface ChatThreadItem {
  thread_id: string
  title: string | null
  status: 'active' | 'archived'
  created_channel: string
  last_channel: string | null
  pinned: boolean
  created_at: string
  updated_at: string
  last_message_at: string | null
}

export interface ThreadListResponse {
  items: ChatThreadItem[]
  page: number
  page_size: number
  total: number
}

export interface ThreadMessageAttachment {
  file_id: string
  filename: string
  size_bytes: number
  media_kind?: string | null
}

export interface ThreadMessageItem {
  message_id: string
  role: 'user' | 'assistant'
  content: string
  reply_type: string | null
  data: unknown
  attachments?: ThreadMessageAttachment[] | null
  error_code?: string | null
  created_at: string
  run_id: string | null
}

export interface ThreadMessagesResponse {
  items: ThreadMessageItem[]
  page: number
  page_size: number
  total: number
}

export interface SwitchThreadResult {
  thread_id: string
  skills?: SkillMenuItem[]
  chat?: boolean
  message_max_chars?: number
  poll_interval_seconds?: number
  poll_max_minutes?: number
}

export interface MappedChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** 模型 `<think>` 思考过程（已剥标签） */
  thinking?: string
  reply?: Reply
  runId?: string
  createdAt: number
  attachments?: { id: string; name: string; size: number; mime: string }[]
}

/** 从模型原文分离思考段与最终回答（支持流式未闭合）。 */
export interface SplitModelContent {
  thinking: string
  answer: string
  hasThinking: boolean
  /** 已见到开标签、尚未见到闭标签 */
  thinkingActive: boolean
}

// ticket 只放内存：刷新页面即失效，需要从 OA 重新进入
let ticket = ''

export function hasTicket(): boolean {
  return ticket !== ''
}

export function clearTicket() {
  ticket = ''
}

/** 读取 ?launch= 并立即从地址栏移除，避免被历史记录、Referer 或截图带出。 */
export function takeLaunchCode(loc: Location = window.location, hist: History = window.history): string {
  const url = new URL(loc.href)
  const code = url.searchParams.get('launch') ?? ''
  if (code) {
    url.searchParams.delete('launch')
    hist.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  return code
}

function auth(): Record<string, string> {
  return ticket ? { Authorization: `Bearer ${ticket}` } : {}
}

async function downloadBlob(path: string, filename: string, fallbackName: string): Promise<void> {
  const resp = await fetch(apiUrl(path), { headers: auth() })
  if (!resp.ok) {
    throw new ApiError(resp.status, 'DOWNLOAD_FAILED', '文件不存在或已过期')
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 用当前会话下载一次性导出文件。不能 window.open，否则带不上 Bearer。 */
export async function downloadExportFile(exportTicket: string, filename: string): Promise<void> {
  await downloadBlob(`/v1/chat/exports/${encodeURIComponent(exportTicket)}`, filename, '导出.xlsx')
}

/** 下载本人已发送的上传附件。 */
export async function downloadOwnedFile(fileId: string, filename: string): Promise<void> {
  await downloadBlob(`/v1/chat/files/${encodeURIComponent(fileId)}`, filename, '附件')
}

/** 读取本人上传文件为 Blob（用于对话内图片预览）。 */
export async function fetchOwnedFileBlob(fileId: string): Promise<Blob> {
  const resp = await fetch(apiUrl(`/v1/chat/files/${encodeURIComponent(fileId)}`), { headers: auth() })
  if (!resp.ok) {
    throw new ApiError(resp.status, 'DOWNLOAD_FAILED', '文件不存在或已过期')
  }
  return resp.blob()
}

export function isImageAttachment(a: { name?: string; mime?: string }): boolean {
  const mime = (a.mime || '').toLowerCase()
  if (mime.startsWith('image/') || mime === 'image') return true
  const name = (a.name || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif)$/i.test(name)
}

/** 文档中心下载（上传或导出，非一次性）。 */
export async function downloadDocumentFile(fileId: string, filename: string): Promise<void> {
  await downloadBlob(`/v1/chat/documents/${encodeURIComponent(fileId)}/download`, filename, '文件')
}

export interface ChatDocumentItem {
  file_id: string
  filename: string
  size_bytes: number
  origin: 'upload' | 'export' | string
  media_kind?: string | null
  thread_id?: string | null
  created_at?: string | null
  ticket?: string | null
}

export interface ChatDocumentsResponse {
  items: ChatDocumentItem[]
  page: number
  page_size: number
  total: number
}

export function listDocuments(
  page = 1,
  pageSize = 50,
  origin?: 'upload' | 'export',
): Promise<ChatDocumentsResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (origin) q.set('origin', origin)
  return request('GET', `/v1/chat/documents?${q}`, undefined, auth())
}

export async function openSession(launchCode: string): Promise<ChatSessionInfo> {
  const s = await request<ChatSessionInfo>('POST', '/v1/chat/session', { launch_code: launchCode })
  ticket = s.ticket
  return s
}

export function refreshSession(): Promise<{ expires_in: number }> {
  return request('POST', '/v1/chat/session/refresh', {}, auth())
}

function clientMsgId(): string {
  return newIdempotencyKey().replace(/[^\w-]/g, '')
}

export function sendMessage(message: string): Promise<MessageResult> {
  return request('POST', '/v1/chat/messages', { message, client_msg_id: clientMsgId() }, auth())
}

export function listThreads(
  page = 1,
  pageSize = 50,
  status: 'active' | 'archived' = 'active',
): Promise<ThreadListResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize), status })
  return request('GET', `/v1/chat/threads?${q}`, undefined, auth())
}

export function createThread(): Promise<ChatThreadItem> {
  return request('POST', '/v1/chat/threads', {}, auth())
}

async function fetchThreadMessagePage(
  threadId: string,
  page: number,
  pageSize: number,
): Promise<ThreadMessagesResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return request<ThreadMessagesResponse>(
    'GET',
    `/v1/chat/threads/${encodeURIComponent(threadId)}/messages?${q}`,
    undefined,
    auth(),
  )
}

export async function getThreadMessages(threadId: string): Promise<ThreadMessageItem[]> {
  const pageSize = 100
  const first = await fetchThreadMessagePage(threadId, 1, pageSize)
  if (first.items.length >= first.total || first.items.length < pageSize) return first.items
  const lastPage = Math.ceil(first.total / pageSize)
  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) => fetchThreadMessagePage(threadId, i + 2, pageSize)),
  )
  return [first, ...rest].flatMap((page) => page.items)
}

export function patchThread(
  threadId: string,
  body: { title?: string; status?: 'active' | 'archived' },
): Promise<ChatThreadItem> {
  return request('PATCH', `/v1/chat/threads/${encodeURIComponent(threadId)}`, body, auth())
}

export function deleteThread(threadId: string): Promise<{ ok: boolean }> {
  return request('DELETE', `/v1/chat/threads/${encodeURIComponent(threadId)}`, undefined, auth())
}

export function switchThread(threadId: string): Promise<SwitchThreadResult> {
  return request('POST', '/v1/chat/session/switch', { thread_id: threadId }, auth())
}

export type MemoryKind = 'preference' | 'constraint' | 'note'

export interface MemoryItem {
  memory_id: string
  kind: MemoryKind
  text: string
  created_at: string
  updated_at: string
}

export interface MemoryListResponse {
  items: MemoryItem[]
  total: number
  page: number
  page_size: number
}

export function listMemory(page = 1, pageSize = 100): Promise<MemoryListResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return request('GET', `/v1/chat/memory?${q}`, undefined, auth())
}

export function deleteMemory(memoryId: string): Promise<{ ok: boolean }> {
  return request('DELETE', `/v1/chat/memory/${encodeURIComponent(memoryId)}`, undefined, auth())
}

/** 一键清空本人 active 记忆；须传 confirm=true（与后端契约一致）。 */
export function clearMemory(confirm = true): Promise<{ ok: boolean; deleted: number }> {
  return request('DELETE', '/v1/chat/memory', { confirm }, auth())
}

/** 记忆 kind 展示文案 */
export function memoryKindLabel(kind: MemoryKind | string): string {
  const map: Record<string, string> = { preference: '偏好', constraint: '约束', note: '备注' }
  return map[kind] ?? kind
}

/** 侧栏展示：无 title 时显示「新会话」。 */
export function threadDisplayTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  return t || '新会话'
}

/** 相对时间（侧栏可选）；无法解析时返回空字符串。 */
export function formatRelativeTime(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, nowMs - t)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function threadMessageToReply(m: ThreadMessageItem): Reply {
  const type = (m.reply_type || 'text') as Reply['type']
  return {
    type,
    content: m.content,
    data: (m.data as ReplyData) ?? null,
    error_code: m.error_code ?? undefined,
  }
}

function messageAttachments(m: ThreadMessageItem): MappedChatMessage['attachments'] {
  const raw =
    m.attachments ??
    (m.data && typeof m.data === 'object' && m.data !== null && Array.isArray((m.data as { attachments?: unknown }).attachments)
      ? ((m.data as { attachments: ThreadMessageAttachment[] }).attachments)
      : null)
  if (!raw?.length) return undefined
  return raw
    .filter((a) => a?.file_id)
    .map((a) => ({
      id: a.file_id,
      name: a.filename || '附件',
      size: Number(a.size_bytes) || 0,
      mime: a.media_kind || '',
    }))
}

/** 将线程历史消息映射为对话区 Message 形状；含附件时拆成独立附件消息。 */
export function mapThreadMessages(items: ThreadMessageItem[]): MappedChatMessage[] {
  const out: MappedChatMessage[] = []
  for (const m of items) {
    const createdAt = Date.parse(m.created_at) || Date.now()
    if (m.role === 'user') {
      const atts = messageAttachments(m)
      const text = (m.content || '').trim()
      if (atts?.length) {
        out.push({
          id: `${m.message_id}_att`,
          role: 'user',
          text: '',
          createdAt,
          attachments: atts,
          runId: m.run_id ?? undefined,
        })
      }
      if (text || !atts?.length) {
        out.push({
          id: m.message_id,
          role: 'user',
          text: m.content || '',
          runId: m.run_id ?? undefined,
          createdAt: atts?.length ? createdAt + 1 : createdAt,
        })
      }
      continue
    }
    const reply = threadMessageToReply(m)
    const parts = splitModelContent(reply?.content ?? m.content)
    out.push({
      id: m.message_id,
      role: m.role,
      text: parts.answer,
      thinking: parts.hasThinking ? parts.thinking : undefined,
      reply,
      runId: m.run_id ?? undefined,
      createdAt,
    })
  }
  return out
}

export interface SseEvent {
  event: string
  data: any
}

/** 解析 SSE 文本：返回完整的事件与尚未结束的剩余部分；注释行（心跳）忽略。 */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = blocks.pop() ?? ''
  const events: SseEvent[] = []
  for (const block of blocks) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (!data.length) continue
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) })
    } catch {
      // 不完整或非 JSON 的数据块忽略
    }
  }
  return { events, rest }
}

export class StreamAbortedError extends Error {
  constructor() {
    super('已停止生成')
    this.name = 'StreamAbortedError'
  }
}

export interface UploadedAttachment {
  file_id: string
  filename: string
  size_bytes: number
  media_kind: string
}

/** 整批上传。FormData 字段名为 files；不设置 Content-Type，由浏览器写 multipart 边界。signal 中止时以 AbortError 拒绝。 */
export async function uploadAttachments(files: File[], signal?: AbortSignal): Promise<UploadedAttachment[]> {
  if (signal?.aborted) throw new DOMException('已取消上传', 'AbortError')
  const form = new FormData()
  for (const file of files) form.append('files', file, file.name)
  const resp = await fetch(apiUrl('/v1/chat/attachments'), {
    method: 'POST',
    headers: { Accept: 'application/json', ...auth() },
    credentials: import.meta.env.VITE_API_BASE_URL ? 'omit' : 'same-origin',
    body: form,
    signal,
  })
  const text = await resp.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!resp.ok) {
    const err = data?.error
    throw new ApiError(resp.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `请求失败（HTTP ${resp.status}）`)
  }
  const rows = Array.isArray(data?.files) ? data.files : []
  return rows.map((row: any) => ({
    file_id: String(row?.file_id ?? ''),
    filename: String(row?.filename ?? ''),
    size_bytes: Number(row?.size_bytes ?? 0),
    media_kind: String(row?.media_kind ?? ''),
  }))
}

/** 流式发送：onDelta 收到回复正文的新增片段；返回与 sendMessage 相同的完整结果。可通过 signal 中止读取。 */
export async function sendMessageStream(
  message: string,
  onDelta: (piece: string) => void,
  signal?: AbortSignal,
  attachmentIds?: string[],
): Promise<MessageResult> {
  try {
    const resp = await fetch(apiUrl('/v1/chat/messages/stream'), {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...auth() },
      credentials: import.meta.env.VITE_API_BASE_URL ? 'omit' : 'same-origin',
      body: JSON.stringify({
        message,
        client_msg_id: clientMsgId(),
        attachment_ids: attachmentIds ?? [],
      }),
      signal,
    })
    if (!resp.ok) {
      let err: any = null
      try {
        err = (await resp.json())?.error
      } catch {
        err = null
      }
      throw new ApiError(resp.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `请求失败（HTTP ${resp.status}）`)
    }
    const box: { result: MessageResult | null } = { result: null }
    const handle = (events: SseEvent[]) => {
      for (const e of events) {
        if (e.event === 'delta' && typeof e.data?.text === 'string') onDelta(e.data.text)
        else if (e.event === 'done') box.result = e.data as MessageResult
        else if (e.event === 'error') throw new ApiError(500, e.data?.code ?? 'STREAM_ERROR', e.data?.message ?? '处理失败')
      }
    }
    let buffer = ''
    if (resp.body?.getReader) {
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        if (signal?.aborted) throw new StreamAbortedError()
        const { value, done } = await reader.read()
        if (done) break
        const parsed = parseSse(buffer + decoder.decode(value, { stream: true }))
        buffer = parsed.rest
        handle(parsed.events)
      }
      buffer += decoder.decode()
    } else {
      buffer = await resp.text()
    }
    handle(parseSse(buffer + '\n\n').events)
    if (!box.result) throw new Error('连接中断，未收到完整结果，请稍后重新提问')
    return box.result
  } catch (e) {
    if (e instanceof StreamAbortedError) throw e
    if (signal?.aborted || (e as Error)?.name === 'AbortError') throw new StreamAbortedError()
    throw e
  }
}

export interface RunResult {
  run_id: string
  run_status: string
  done: boolean
  reply: Reply | null
}

/** 转人工后轮询本人运行的结果。 */
export function getRun(runId: string): Promise<RunResult> {
  return request('GET', `/v1/chat/runs/${encodeURIComponent(runId)}`, undefined, auth())
}

/** 会话未返回配置时的默认值：每 5 秒轮询；介入任务默认 30 分钟过期，多留 5 分钟余量后停止。 */
export const POLL_INTERVAL_MS = 5000
export const POLL_MAX_MS = 35 * 60 * 1000

export function pollSettings(s: Pick<ChatSessionInfo, 'poll_interval_seconds' | 'poll_max_minutes'>) {
  return {
    intervalMs: s.poll_interval_seconds ? s.poll_interval_seconds * 1000 : POLL_INTERVAL_MS,
    maxMs: s.poll_max_minutes ? s.poll_max_minutes * 60 * 1000 : POLL_MAX_MS,
  }
}

/** 在过期前 2 分钟续期，最短 30 秒。 */
export function refreshDelayMs(expiresIn: number): number {
  return Math.max(30, expiresIn - 120) * 1000
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

/** Skill 或其依赖 Tool 是否在近三天内新加。 */
export function isRecentSkillOrTool(s: SkillMenuItem, nowMs: number = Date.now()): boolean {
  for (const raw of [s.created_at, s.newest_tool_created_at]) {
    if (!raw) continue
    const t = Date.parse(raw)
    if (!Number.isNaN(t) && nowMs - t <= THREE_DAYS_MS && nowMs - t >= -60_000) return true
  }
  return false
}

/** 欢迎页示例：仅近三天新加的 Skill/Tool；每个 Skill 先取一条再轮流补齐，最多 max 条。 */
export function welcomeExamples(skills: SkillMenuItem[], max = 6, nowMs: number = Date.now()): string[] {
  const recent = skills.filter((s) => isRecentSkillOrTool(s, nowMs))
  const out: string[] = []
  const depth = Math.max(0, ...recent.map((s) => s.examples.length))
  for (let i = 0; i < depth && out.length < max; i++) {
    for (const s of recent) {
      const ex = s.examples[i]
      if (ex && !out.includes(ex) && out.length < max) out.push(ex)
    }
  }
  return out
}

/** 单元格展示：空值显示「—」，对象转 JSON。 */
export function cellText(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** 回复正文按纯文本展示：去掉 HTML 与 Markdown 粗体，流式未闭合标签一并剥掉。 */
export function plainText(content: string): string {
  return content
    .replace(/<[^>]*>/g, '')
    .replace(/<[^>]*$/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\*\*/g, '')
}

const THINK_OPEN_RE = /<think\b[^>]*>/i
const THINK_CLOSE_RE = /<\/think\s*>/i

/**
 * 分离模型 `<think>…</think>` 思考过程与最终回答。
 * 流式场景下开标签未闭合时 thinkingActive=true；尾部残缺 `<…` 不进入展示。
 */
export function splitModelContent(raw: string): SplitModelContent {
  const source = raw ?? ''
  const open = THINK_OPEN_RE.exec(source)
  if (!open || open.index === undefined) {
    return {
      thinking: '',
      answer: plainText(source),
      hasThinking: false,
      thinkingActive: false,
    }
  }

  const before = source.slice(0, open.index)
  const afterOpen = source.slice(open.index + open[0].length)
  const close = THINK_CLOSE_RE.exec(afterOpen)

  if (!close || close.index === undefined) {
    return {
      thinking: plainText(afterOpen).trim(),
      answer: plainText(before).trim(),
      hasThinking: true,
      thinkingActive: true,
    }
  }

  const thinkingRaw = afterOpen.slice(0, close.index)
  const afterClose = afterOpen.slice(close.index + close[0].length)
  // 若后续还有思考块，递归合并（少见，但避免泄漏标签到回答区）
  const rest = splitModelContent(afterClose)
  const thinkingParts = [plainText(thinkingRaw).trim()]
  if (rest.hasThinking && rest.thinking) thinkingParts.push(rest.thinking)

  const answer = [plainText(before), rest.answer]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n')

  return {
    thinking: thinkingParts.filter(Boolean).join('\n\n'),
    answer,
    hasThinking: true,
    thinkingActive: rest.thinkingActive,
  }
}

/** 将模型原文落到消息展示字段（回答 + 可选思考）。 */
export function assistantDisplayFields(raw: string): {
  text: string
  thinking?: string
  thinkingActive?: boolean
} {
  const parts = splitModelContent(raw)
  return {
    text: parts.answer,
    thinking: parts.hasThinking ? parts.thinking : undefined,
    thinkingActive: parts.hasThinking ? parts.thinkingActive : undefined,
  }
}
