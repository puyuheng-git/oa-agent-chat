/** OA iframe 与宿主页之间的 postMessage 约定（STD-009 对话壳）。 */

export const OA_MSG_RELAUNCH = 'oa-agent-chat:relaunch'
export const OA_MSG_RELAUNCH_ACK = 'oa-agent-chat:relaunch-ack'
export const OA_MSG_BACK = 'oa-agent-chat:back-to-oa'

export function postToOaParent(type: string, payload: Record<string, unknown> = {}): void {
  if (window.parent === window) return
  window.parent.postMessage({ type, ...payload }, '*')
}

let relaunchInFlight: Promise<void> | null = null

/** embed 模式下请求 OA 宿主页重新签发 launch 并刷新 iframe；超时未 ack 则 reject。连点复用同一次请求。 */
export function requestOaRelaunch(timeoutMs = 5000): Promise<void> {
  if (window.parent === window) {
    return Promise.reject(new Error('not_embedded'))
  }
  if (relaunchInFlight) return relaunchInFlight
  relaunchInFlight = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('relaunch_timeout'))
    }, timeoutMs)
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data
      if (data && typeof data === 'object' && (data as { type?: string }).type === OA_MSG_RELAUNCH_ACK) {
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        resolve()
      }
    }
    window.addEventListener('message', onMessage)
    postToOaParent(OA_MSG_RELAUNCH)
  }).finally(() => {
    relaunchInFlight = null
  })
  return relaunchInFlight
}

export function backToOa(): void {
  if (window.parent !== window) {
    postToOaParent(OA_MSG_BACK)
    return
  }
  if (window.history.length > 1) window.history.back()
}
