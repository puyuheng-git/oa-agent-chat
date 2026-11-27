import { capturePageInfo } from '../capture/PageCapture'
import { resolveOaContentDocuments, resolveOverlayRoots, type ContentDocRef } from '../capture/resolveContentDocs'
import { extractVisibleText } from '../extract/ContentExtractor'
import { extractDialogs } from '../extract/DialogExtractor'
import { collectInteractiveElements } from '../extract/ElementRecognizer'
import { extractTables } from '../extract/TableExtractor'
import { ElementMapper } from '../mapper/ElementMapper'
import {
  DEFAULT_BUILD_OPTIONS,
  type BuildOptions,
  type PageSnapshot,
  type SnapshotDialog,
  type SnapshotElement,
  type SnapshotTable,
} from '../types'

export interface BuildResult {
  snapshot: PageSnapshot
  mapper: ElementMapper
}

/**
 * 将 OA 当前业务页 DOM 构建为结构化快照。
 * 自动解析 tabs / frameset 中的业务 iframe，而不是采顶层外壳。
 * @param hostDoc 宿主文档（通常为顶层 document）；也可直接传入业务页 document（单测）
 * @param options 截断与过滤选项
 * @param mapper 可选外部 mapper
 */
export function buildPageSnapshot(
  hostDoc: Document = document,
  options: BuildOptions = {},
  mapper?: ElementMapper,
): BuildResult {
  const opts = { ...DEFAULT_BUILD_OPTIONS, ...options }
  const map = mapper ?? new ElementMapper()
  map.reset()

  const hostWin = hostDoc.defaultView || window
  const contentRefs = resolveContentRefs(hostDoc, hostWin)
  const primary = contentRefs[0]

  const page = primary
    ? {
        title: primary.title || capturePageInfo(hostDoc).title,
        url: primary.url || capturePageInfo(hostDoc).url,
        capturedAt: new Date().toISOString(),
        contentSource: primary.source,
      }
    : { ...capturePageInfo(hostDoc), contentSource: 'host-fallback' }

  const elements: SnapshotElement[] = []
  const tables: SnapshotTable[] = []
  const dialogs: SnapshotDialog[] = []
  let contentText = ''
  let contentTrunc = false
  let elTrunc = false

  const docsToScan: ContentDocRef[] =
    contentRefs.length > 0
      ? contentRefs
      : [{ doc: hostDoc, source: 'host-fallback', url: page.url, title: page.title }]

  for (const ref of docsToScan) {
    const root = ref.doc.body || ref.doc.documentElement
    if (!root) continue

    const textBlock = extractVisibleText(root, Math.max(0, opts.maxContentChars - contentText.length))
    if (textBlock.text) {
      contentText = contentText ? `${contentText} ${textBlock.text}` : textBlock.text
    }
    contentTrunc = contentTrunc || textBlock.truncated

    const remainEl = Math.max(0, opts.maxElements - elements.length)
    if (remainEl > 0) {
      const collected = collectInteractiveElements(root, map, {
        visibleOnly: opts.visibleOnly,
        maxElements: remainEl,
      })
      elements.push(...collected.elements)
      elTrunc = elTrunc || collected.truncated
    }

    tables.push(
      ...extractTables(root, map, {
        maxRows: opts.maxTableRows,
        maxCols: opts.maxTableCols,
        visibleOnly: opts.visibleOnly,
      }),
    )

    dialogs.push(
      ...extractDialogs(root, map, {
        maxElements: opts.maxElements,
        visibleOnly: opts.visibleOnly,
      }),
    )
  }

  // 顶层 Layui layer（常挂外壳 body，业务 iframe 内看不到）
  if (hostDoc !== docsToScan[0]?.doc) {
    for (const overlay of resolveOverlayRoots(hostWin)) {
      dialogs.push(
        ...extractDialogs(overlay.parentElement || overlay, map, {
          maxElements: Math.min(40, opts.maxElements),
          visibleOnly: opts.visibleOnly,
        }),
      )
    }
    // 若 resolveOverlayRoots 返回的就是 layer 节点本身，再直接抽一次
    const hostDialogs = extractDialogs(hostDoc.body || hostDoc.documentElement, map, {
      maxElements: Math.min(40, opts.maxElements),
      visibleOnly: opts.visibleOnly,
    })
    for (const d of hostDialogs) {
      if (!dialogs.some((x) => x.name === d.name && x.text === d.text)) dialogs.push(d)
    }
  }

  const dialogRefs = new Set<string>()
  for (const d of dialogs) {
    for (const e of d.elements) dialogRefs.add(e.ref)
  }
  const topElements = elements.filter((e) => !dialogRefs.has(e.ref))

  const note =
    contentRefs.length === 0
      ? '未解析到业务 iframe，已回退采集宿主文档（若挂在 index 外壳可能缺少业务表数据）'
      : undefined

  const snapshot: PageSnapshot = {
    page,
    content: { text: contentText.replace(/\s+/g, ' ').trim(), truncated: contentTrunc },
    elements: topElements,
    tables,
    dialogs,
    meta: {
      dirty: !!opts.dirty,
      elementCount: topElements.length,
      truncated: contentTrunc || elTrunc,
      contentDocCount: contentRefs.length,
      note,
    },
  }
  return { snapshot, mapper: map }
}

/**
 * 解析内容文档；若 hostDoc 本身已是业务页（无外壳特征），直接使用。
 */
function resolveContentRefs(hostDoc: Document, hostWin: Window): ContentDocRef[] {
  // 单测 / 直接在业务页注入：没有外壳结构时，host 即内容
  const hasShell =
    !!hostDoc.getElementById('tabs_container') ||
    !!hostDoc.getElementById('taskbar') ||
    !!hostDoc.querySelector('frameset')

  if (!hasShell) {
    return [
      {
        doc: hostDoc,
        source: 'direct-document',
        url: capturePageInfo(hostDoc).url,
        title: capturePageInfo(hostDoc).title,
      },
    ]
  }

  return resolveOaContentDocuments(hostWin)
}
