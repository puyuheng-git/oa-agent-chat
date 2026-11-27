import type { PageSnapshot } from '../page-agent/types'
import {
  PAGE_MSG_PING,
  PAGE_MSG_PONG,
  PAGE_MSG_SNAPSHOT_REQUEST,
  PAGE_MSG_SNAPSHOT_RESULT,
} from '../page-agent/host/protocol'
import { postToOaParent } from './oa-relay'

export {
  PAGE_MSG_PING,
  PAGE_MSG_PONG,
  PAGE_MSG_SNAPSHOT_REQUEST,
  PAGE_MSG_SNAPSHOT_RESULT,
}

const SNAPSHOT_MARK_START = '<!-- OA_PAGE_SNAPSHOT_V1 -->'
const SNAPSHOT_MARK_END = '<!-- /OA_PAGE_SNAPSHOT_V1 -->'

/** 生成请求 id。 */
function requestId(): string {
  return `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 探测 OA 宿主是否已加载 page-agent.js。
 * @param timeoutMs 超时毫秒
 */
export function probePageAgent(timeoutMs = 1500): Promise<boolean> {
  if (window.parent === window) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(false)
    }, timeoutMs)
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window.parent) return
      const data = ev.data
      if (data && typeof data === 'object' && (data as { type?: string }).type === PAGE_MSG_PONG) {
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        resolve(true)
      }
    }
    window.addEventListener('message', onMessage)
    postToOaParent(PAGE_MSG_PING)
  })
}

/**
 * 向宿主请求页面快照。
 * @param timeoutMs 超时毫秒
 */
export function requestPageSnapshot(timeoutMs = 5000): Promise<PageSnapshot> {
  if (window.parent === window) {
    return Promise.reject(new Error('not_embedded'))
  }
  const id = requestId()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('snapshot_timeout'))
    }, timeoutMs)
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window.parent) return
      const data = ev.data
      if (!data || typeof data !== 'object') return
      if ((data as { type?: string }).type !== PAGE_MSG_SNAPSHOT_RESULT) return
      if ((data as { requestId?: string }).requestId !== id) return
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if ((data as { ok?: boolean }).ok && (data as { snapshot?: PageSnapshot }).snapshot) {
        resolve((data as { snapshot: PageSnapshot }).snapshot)
        return
      }
      reject(new Error((data as { error?: string }).error || 'snapshot_failed'))
    }
    window.addEventListener('message', onMessage)
    postToOaParent(PAGE_MSG_SNAPSHOT_REQUEST, { requestId: id })
  })
}

/**
 * 将用户原文与快照拼成发给模型的 message（气泡仍只用原文）。
 * @param userText 用户可见原文
 * @param snapshot 页面快照
 */
export function composeWireMessage(userText: string, snapshot: PageSnapshot): string {
  const json = JSON.stringify(snapshot)
  const block = `\n\n${SNAPSHOT_MARK_START}\n\`\`\`json\n${json}\n\`\`\`\n${SNAPSHOT_MARK_END}`
  return `${userText.trim()}${block}`
}

/**
 * 判断一段 wire message 是否含快照块（测试用）。
 * @param wire 发给后端的正文
 */
export function wireHasSnapshot(wire: string): boolean {
  return wire.includes(SNAPSHOT_MARK_START) && wire.includes(SNAPSHOT_MARK_END)
}
