/**
 * 解析东审 OA 实际业务内容所在 Document。
 *
 * OA 架构要点（本机实测）：
 * - 顶层 `general/index.php`：任务栏 + `#center .tabs-panel.selected > iframe`
 * - 许多模块（如工作流）iframe 内仍是 **frameset**：
 *   `frame[name=menu_top]` + `frame[name=menu_main]` + `frame[name=form_main]`
 * - 业务表格在 `menu_main`，不是外层空壳 document
 * - page-agent 挂在顶层，必须下钻 frame/iframe 才能采到数据
 */

export interface ContentDocRef {
  doc: Document
  /** 来源说明，便于快照 meta / 排障 */
  source: string
  url: string
  title: string
  /** 内容丰富度评分（内部选主文档用） */
  score?: number
}

const PREFERRED_FRAME_NAMES = [
  'menu_main',
  'main',
  'form_main',
  'iframe-main',
  'iframe_main',
  'right',
  'content',
]

/**
 * 尝试读取同源 iframe/frame 的 document。
 * @param win 目标 window
 */
export function trySameOriginDocument(win: Window | null | undefined): Document | null {
  if (!win) return null
  try {
    const doc = win.document
    void win.location.href
    return doc
  } catch {
    return null
  }
}

function docMeta(doc: Document, source: string, score?: number): ContentDocRef {
  let url = ''
  let title = ''
  try {
    url = doc.defaultView?.location?.href || doc.URL || ''
  } catch {
    url = doc.URL || ''
  }
  title = (doc.title || '').trim()
  const ref: ContentDocRef = { doc, source, url, title }
  if (score != null) ref.score = score
  return ref
}

/**
 * 从顶层窗口解析应采集的业务 Document 列表。
 * @param hostWin 宿主 window（page-agent 所在顶层）
 */
export function resolveOaContentDocuments(hostWin: Window = window): ContentDocRef[] {
  const seeds: ContentDocRef[] = []
  const hostDoc = hostWin.document

  // 1) 通达 2010：当前选中标签页 iframe
  const selectedPanel = hostDoc.querySelector('#center .tabs-panel.selected, .tabs-panel.selected')
  if (selectedPanel) {
    for (const iframe of Array.from(selectedPanel.querySelectorAll('iframe'))) {
      const child = trySameOriginDocument((iframe as HTMLIFrameElement).contentWindow)
      if (child) seeds.push(docMeta(child, 'tabs-panel.selected'))
    }
  }

  // 2) 经典 frameset：name=main
  if (!seeds.length) {
    try {
      const mainEl = hostDoc.querySelector('frame[name="main"]') as HTMLFrameElement | null
      const mainFrame =
        (mainEl?.contentWindow as Window | null) ||
        ((hostWin.frames as unknown as { main?: Window }).main ?? null)
      const mainDoc = trySameOriginDocument(mainFrame)
      if (mainDoc) seeds.push(docMeta(mainDoc, 'frame[name=main]'))
    } catch {
      // ignore
    }
  }

  // 3) #center 下可见大 iframe
  if (!seeds.length) {
    const center = hostDoc.getElementById('center')
    const scope = center || hostDoc.body
    if (scope) {
      for (const iframe of Array.from(scope.querySelectorAll('iframe'))) {
        const el = iframe as HTMLIFrameElement
        if (!isLikelyVisibleFrame(el)) continue
        const child = trySameOriginDocument(el.contentWindow)
        if (child) {
          seeds.push(docMeta(child, 'center-iframe'))
          break
        }
      }
    }
  }

  // 4) 非外壳则自身即内容
  if (!seeds.length && !looksLikeOaShell(hostDoc)) {
    seeds.push(docMeta(hostDoc, 'host-document'))
  }

  // 下钻 frameset / 嵌套 frame，展开为有实质内容的叶子文档
  const expanded: ContentDocRef[] = []
  const seen = new WeakSet<Document>()
  for (const seed of seeds) {
    for (const leaf of expandFrames(seed.doc, seed.source, 0, seen)) {
      expanded.push(leaf)
    }
  }

  if (!expanded.length) return []

  // 按丰富度排序；保留得分最高的若干页（主列表 + 顶栏/表单）
  expanded.sort((a, b) => (b.score || 0) - (a.score || 0))
  const useful = expanded.filter((d) => (d.score || 0) > 0)
  const pool = useful.length ? useful : expanded
  return pickContentDocs(pool)
}

/**
 * 顶层应额外扫描的弹层根（layui layer 常挂顶层）。
 * @param hostWin 宿主 window
 */
export function resolveOverlayRoots(hostWin: Window = window): Element[] {
  const doc = hostWin.document
  const roots: Element[] = []
  const nodes = doc.querySelectorAll('.layui-layer, .layui-layer-shade, [id^="layui-layer"]')
  for (const n of Array.from(nodes)) {
    const html = n as HTMLElement
    if (html.style && html.style.display === 'none') continue
    roots.push(n)
  }
  return roots
}

/** 日期控件等噪声 iframe，禁止再下钻。 */
function isNoiseFrame(el: Element): boolean {
  if (el.id === 'oa-agent-bubble-window' || el.closest('#oa-agent-bubble-window')) return true
  const hint = `${el.getAttribute('src') || ''} ${el.getAttribute('name') || ''} ${el.id || ''}`.toLowerCase()
  if (/datepicker|my97|laydate|calendar|ueditor|kindeditor|ckeditor|___engine/i.test(hint)) return true
  return false
}

/**
 * 是否为「只有 frameset/空壳、正文在子 frame」的文档。
 * 已有实质表格/正文的业务页即使带日期控件 iframe，也不再下钻。
 * @param doc 当前文档
 * @param frames 子 frame 列表
 */
function isFrameShell(doc: Document, frames: Element[]): boolean {
  if (doc.querySelector('frameset')) return true
  if (!frames.length) return false
  // 有子 frame 但本页几乎无业务内容 → 当作壳
  return scoreDocument(doc) < 8
}

/**
 * 递归展开 frame/iframe；仅 frameset/空壳才进入子 frame，避免误入日期控件。
 * @param doc 当前文档
 * @param source 来源路径
 * @param depth 深度
 * @param seen 已访问文档
 */
function expandFrames(doc: Document, source: string, depth: number, seen: WeakSet<Document>): ContentDocRef[] {
  if (seen.has(doc) || depth > 5) return []
  seen.add(doc)

  const frameEls = Array.from(doc.querySelectorAll('frame, iframe')) as (HTMLFrameElement | HTMLIFrameElement)[]
  const frames = frameEls.filter((el) => !isNoiseFrame(el))

  // 业务页（非壳）：直接作为叶子，不再钻进内部 DatePicker 等 iframe
  if (!isFrameShell(doc, frames)) {
    const score = scoreDocument(doc)
    return score > 0 ? [docMeta(doc, source, score)] : []
  }

  if (!frames.length) {
    const score = scoreDocument(doc)
    return score > 0 ? [docMeta(doc, source, score)] : []
  }

  frames.sort((a, b) => framePriority(a) - framePriority(b))

  const children: ContentDocRef[] = []
  for (const el of frames) {
    const name = (el.getAttribute('name') || el.id || el.tagName).toString()
    const childDoc = trySameOriginDocument(el.contentWindow)
    if (!childDoc) continue
    // 子文档若是日期页等噪声 URL，跳过
    try {
      const href = childDoc.defaultView?.location?.href || ''
      if (/datepicker|my97|laydate/i.test(href)) continue
    } catch {
      // ignore
    }
    const nested = expandFrames(childDoc, `${source}>${name}`, depth + 1, seen)
    children.push(...nested)
  }

  if (!children.length) {
    const score = scoreDocument(doc)
    if (score > 0) return [docMeta(doc, source, score)]
  }
  return children
}

function framePriority(el: Element): number {
  const name = (el.getAttribute('name') || el.id || '').toLowerCase()
  const idx = PREFERRED_FRAME_NAMES.findIndex((n) => name === n || name.includes(n))
  return idx >= 0 ? idx : 100
}

/**
 * 选取要交给 SnapshotBuilder 的文档：主内容 + 可选顶栏/表单。
 * @param pool 候选
 */
function pickContentDocs(pool: ContentDocRef[]): ContentDocRef[] {
  if (pool.length <= 3) return pool
  const out: ContentDocRef[] = []
  const used = new Set<string>()
  const add = (ref: ContentDocRef) => {
    const key = ref.source + '|' + ref.url
    if (used.has(key)) return
    used.add(key)
    out.push(ref)
  }
  // 最高分作主文档
  add(pool[0])
  // 再补顶栏 / 表单类
  for (const ref of pool) {
    if (out.length >= 3) break
    const src = ref.source.toLowerCase()
    if (src.includes('menu_top') || src.includes('form_main') || src.includes('menu_main')) add(ref)
  }
  // 仍不足则按分数补
  for (const ref of pool) {
    if (out.length >= 3) break
    add(ref)
  }
  return out
}

/** 文档内容丰富度：表格、链接、控件、正文。 */
function scoreDocument(doc: Document): number {
  try {
    const root = doc.body || doc.documentElement
    if (!root) return 0
    const tables = root.querySelectorAll('table, .layui-table-view').length
    const inputs = root.querySelectorAll('input, button, select, textarea, a').length
    const textLen = (root.innerText || '').replace(/\s+/g, ' ').trim().length
    // frameset 外壳正文几乎为空
    if (doc.querySelector('frameset') && textLen < 20 && tables === 0) return 0
    return tables * 50 + Math.min(inputs, 40) * 2 + Math.min(textLen, 2000) / 20
  } catch {
    return 0
  }
}

function isMostlyEmpty(doc: Document): boolean {
  return scoreDocument(doc) <= 0
}

function isLikelyVisibleFrame(el: HTMLIFrameElement): boolean {
  if (el.id === 'oa-agent-bubble-window' || el.closest('#oa-agent-bubble-window')) return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
  const rect = el.getBoundingClientRect()
  return rect.width >= 200 && rect.height >= 200
}

function looksLikeOaShell(doc: Document): boolean {
  if (doc.getElementById('tabs_container') && doc.getElementById('center')) return true
  if (doc.getElementById('taskbar') && doc.getElementById('funcbar')) return true
  if (doc.querySelector('frameset') && doc.querySelector('frame[name="main"]')) return true
  return false
}
