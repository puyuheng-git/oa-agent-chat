/** 宿主页 ↔ 对话壳 postMessage 类型常量。 */

export const PAGE_MSG_PING = 'oa-agent-page:ping'
export const PAGE_MSG_PONG = 'oa-agent-page:pong'
export const PAGE_MSG_SNAPSHOT_REQUEST = 'oa-agent-page:snapshot-request'
export const PAGE_MSG_SNAPSHOT_RESULT = 'oa-agent-page:snapshot-result'

export interface SnapshotRequestMessage {
  type: typeof PAGE_MSG_SNAPSHOT_REQUEST
  requestId: string
}

export interface SnapshotResultMessage {
  type: typeof PAGE_MSG_SNAPSHOT_RESULT
  requestId: string
  ok: boolean
  snapshot?: unknown
  error?: string
}
