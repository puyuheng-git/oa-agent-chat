import { startPageAgentHost } from './bridge'
import { buildPageSnapshot } from '../snapshot/SnapshotBuilder'
import type { PageSnapshot } from '../types'

/**
 * page-agent.js 宿主入口：在 OA 页加载后自动启动桥接。
 * 通过 IIFE 全局暴露少量调试 API（不执行任意 JS）。
 */
declare global {
  interface Window {
    __oaPageAgent?: {
      version: string
      start: typeof startPageAgentHost
      /** 立即采集当前业务页快照（调试 / 排障） */
      capture: () => PageSnapshot
    }
  }
}

startPageAgentHost()

window.__oaPageAgent = {
  version: '1.1.0',
  start: startPageAgentHost,
  capture: () => buildPageSnapshot(document).snapshot,
}
