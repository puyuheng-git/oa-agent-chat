export type {
  BuildOptions,
  ContentBlock,
  PageInfo,
  PageSnapshot,
  SnapshotDialog,
  SnapshotElement,
  SnapshotMeta,
  SnapshotTable,
  TableRowAction,
} from './types'
export { DEFAULT_BUILD_OPTIONS, SENSITIVE_VALUE_MASK } from './types'
export { ElementMapper } from './mapper/ElementMapper'
export { PageChangeMonitor } from './monitor/PageChangeMonitor'
export { buildPageSnapshot } from './snapshot/SnapshotBuilder'
export type { BuildResult } from './snapshot/SnapshotBuilder'
export { isSensitiveElement, sanitizeValue } from './security/SecurityGuard'
export { capturePageInfo } from './capture/PageCapture'
export { resolveOaContentDocuments, resolveOverlayRoots } from './capture/resolveContentDocs'
