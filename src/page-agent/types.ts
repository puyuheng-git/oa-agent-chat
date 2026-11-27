/** 页面感知快照与构建选项类型（Phase 1）。 */

export interface PageInfo {
  title: string
  url: string
  capturedAt: string
  /** 内容来源：tabs-panel.selected / frame[name=main] 等 */
  contentSource?: string
}

export interface ContentBlock {
  text: string
  truncated: boolean
}

export interface SnapshotElement {
  ref: string
  role: string
  name: string
  tag: string
  type?: string
  visible: boolean
  enabled: boolean
  checked?: boolean
  /** 敏感字段省略或为 *** */
  value?: string
  placeholder?: string
}

export interface TableRowAction {
  row: number
  refs: string[]
}

export interface SnapshotTable {
  name?: string
  headers: string[]
  rows: string[][]
  rowActions?: TableRowAction[]
  pagination?: string
}

export interface SnapshotDialog {
  name?: string
  text: string
  elements: SnapshotElement[]
}

export interface SnapshotMeta {
  dirty: boolean
  elementCount: number
  truncated: boolean
  /** 实际采集到的业务文档数量（排除仅外壳） */
  contentDocCount?: number
  /** 未解析到业务 iframe 时的提示 */
  note?: string
}

export interface PageSnapshot {
  page: PageInfo
  content: ContentBlock
  elements: SnapshotElement[]
  tables: SnapshotTable[]
  dialogs: SnapshotDialog[]
  meta: SnapshotMeta
}

export interface BuildOptions {
  /** 可见正文最大字符数，默认 4000 */
  maxContentChars?: number
  /** 可操作元素上限，默认 80 */
  maxElements?: number
  /** 表格最大行数，默认 20 */
  maxTableRows?: number
  /** 表格最大列数，默认 12 */
  maxTableCols?: number
  /** 是否只采集可见可操作元素，默认 true */
  visibleOnly?: boolean
  /** 外部 dirty 标记（来自 PageChangeMonitor） */
  dirty?: boolean
}

export const DEFAULT_BUILD_OPTIONS: Required<BuildOptions> = {
  maxContentChars: 4000,
  maxElements: 80,
  maxTableRows: 20,
  maxTableCols: 12,
  visibleOnly: true,
  dirty: false,
}

export const SENSITIVE_VALUE_MASK = '***'
