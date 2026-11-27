import { PageChangeMonitor } from '../monitor/PageChangeMonitor'
import { buildPageSnapshot } from '../snapshot/SnapshotBuilder'
import {
  PAGE_MSG_PING,
  PAGE_MSG_PONG,
  PAGE_MSG_SNAPSHOT_REQUEST,
  PAGE_MSG_SNAPSHOT_RESULT,
  type SnapshotRequestMessage,
} from './protocol'

let started = false
let monitor: PageChangeMonitor | null = null

/**
 * 在 OA 宿主页启动 page-agent 桥：响应 ping / snapshot-request。
 * 可安全重复调用（幂等）。
 */
export function startPageAgentHost(): void {
  if (started) return
  started = true
  monitor = new PageChangeMonitor()
  monitor.start()

  window.addEventListener('message', onMessage)
}

function onMessage(ev: MessageEvent): void {
  const data = ev.data
  if (!data || typeof data !== 'object') return
  const type = (data as { type?: string }).type
  if (typeof type !== 'string' || !type.startsWith('oa-agent-page:')) return
  // 仅响应来自子 frame 的请求（助手 iframe）
  if (!ev.source || ev.source === window) return

  if (type === PAGE_MSG_PING) {
    ;(ev.source as Window).postMessage({ type: PAGE_MSG_PONG }, '*')
    return
  }

  if (type === PAGE_MSG_SNAPSHOT_REQUEST) {
    const req = data as SnapshotRequestMessage
    const requestId = typeof req.requestId === 'string' ? req.requestId : ''
    if (!requestId) return
    try {
      const dirty = monitor?.isDirty() ?? false
      const { snapshot } = buildPageSnapshot(document, { dirty })
      monitor?.clearDirty()
      const payload = {
        type: PAGE_MSG_SNAPSHOT_RESULT,
        requestId,
        ok: true,
        snapshot,
      }
      ;(ev.source as Window).postMessage(payload, '*')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'snapshot_failed'
      const payload = {
        type: PAGE_MSG_SNAPSHOT_RESULT,
        requestId,
        ok: false,
        error: message,
      }
      ;(ev.source as Window).postMessage(payload, '*')
    }
  }
}

/** 测试用：停止监听。 */
export function stopPageAgentHost(): void {
  if (!started) return
  window.removeEventListener('message', onMessage)
  monitor?.stop()
  monitor = null
  started = false
}
