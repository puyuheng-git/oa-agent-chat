import type { KatexOptions } from 'katex'
import { createMarkdownIt, type MarkdownItInstance } from './parse'

const SHIKI_THEME = 'github-light'
const MERMAID_TIMEOUT_MS = 3000

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 解析失败时只回源码，不把 KaTeX 的报错 HTML 写进回答。 */
function katexEngine(katex: { renderToString(tex: string, options?: KatexOptions): string }) {
  return {
    renderToString(tex: string, options?: KatexOptions): string {
      const next: KatexOptions = { ...options, throwOnError: true }
      try {
        return katex.renderToString(tex, next)
      } catch {
        const source = next.displayMode ? `$$${tex}$$` : `$${tex}$`
        return escapeHtml(source)
      }
    },
  }
}

let mathMd: Promise<MarkdownItInstance> | null = null

/**
 * 复制 dollars 规则，但行内 $ 紧跟数字时不开公式。
 * texmath 的 $...$ 会让 `.` 吃掉后面的 `$`，`$12.5 ... $a^2$` 会被收成一段失败公式。
 */
function installCurrencySafeDollars(texmath: any) {
  if (texmath.rules.dollarsCurrencySafe) return
  const base = texmath.rules.dollars
  texmath.rules.dollarsCurrencySafe = {
    inline: base.inline.map((rule: any) => {
      const next = { ...rule, rex: new RegExp(rule.rex.source, rule.rex.flags) }
      if (rule.tag !== '$') return next
      const allow = rule.pre || texmath.$_pre
      // 正文里不能再出现 $，避免金额的起始 $ 一直配对到公式的结束 $
      next.rex = /\$((?:[^\s\\$])|(?:\S[^$]*?[^\s\\$]))\$/gy
      next.pre = (str: string, outerSpace: boolean, beg: number) => {
        const code = str.charCodeAt(beg + 1)
        if (code >= 48 && code <= 57) return false
        return allow(str, outerSpace, beg)
      }
      return next
    }),
    block: base.block.map((rule: any) => ({
      ...rule,
      rex: new RegExp(rule.rex.source, rule.rex.flags),
    })),
  }
}

/** dollars：成对 $...$ / $$...$$。$12.5 这种金额保持原文，不切开后面的公式。 */
function loadMathMarkdown(): Promise<MarkdownItInstance> {
  if (!mathMd) {
    mathMd = Promise.all([import('katex'), import('markdown-it-texmath')])
      .then(([katexMod, texmathMod]) => {
        const texmath = texmathMod.default
        installCurrencySafeDollars(texmath)
        return createMarkdownIt((instance) => {
          instance.use(texmath, {
            engine: katexEngine(katexMod.default),
            delimiters: 'dollarsCurrencySafe',
            katexOptions: { throwOnError: true },
          })
        })
      })
      .catch((err) => {
        mathMd = null
        throw err
      })
  }
  return mathMd
}

async function renderMathMarkdown(source: string): Promise<string> {
  const parser = await loadMathMarkdown()
  return parser.render(source)
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (result instanceof ArrayBuffer) resolve(new Uint8Array(result))
      else reject(new Error('blob read failed'))
    }
    reader.onerror = () => reject(reader.error || new Error('blob read failed'))
    reader.readAsArrayBuffer(blob)
  })
}

/** jsdom 的 Blob 没有 stream()，Shiki 内联 wasm 解压会直接抛。浏览器里已有则不动。 */
function ensureBlobStream(): void {
  const proto = Blob.prototype as Blob & { stream?: () => ReadableStream<Uint8Array> }
  if (typeof proto.stream === 'function') return
  proto.stream = function stream(this: Blob): ReadableStream<Uint8Array> {
    const blob = this
    return new ReadableStream({
      async start(controller) {
        const bytes = await readBlobBytes(blob)
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }
}

function fenceLang(code: Element): string {
  const className = code.getAttribute('class') || ''
  const matched = /(?:^|\s)language-([^\s]+)/.exec(className)
  if (!matched) return ''
  return matched[1]
}

function takeHighlightedPre(doc: Document, html: string): Element | null {
  const holder = doc.createElement('div')
  holder.innerHTML = html
  return holder.querySelector('pre')
}

function isJsdom(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.indexOf('jsdom') >= 0
}

let mermaidDomReady = false

/** jsdom 没有 canvas 2d，思维导图的布局会直接抛。只在 jsdom 里补测量桩。 */
function ensureMermaidDom(): void {
  if (!isJsdom() || mermaidDomReady) return
  mermaidDomReady = true

  const host = globalThis as typeof globalThis & { CSSStyleSheet?: typeof CSSStyleSheet }
  if (typeof host.CSSStyleSheet === 'undefined' && 'CSSStyleSheet' in window) {
    host.CSSStyleSheet = window.CSSStyleSheet
  }

  const canvasProto = HTMLCanvasElement.prototype
  const getContext = function getContext(type: string): CanvasRenderingContext2D | null {
    if (type !== '2d') return null
    return new Proxy({} as CanvasRenderingContext2D, {
      get(target, prop, receiver) {
        if (prop === 'measureText') return () => ({ width: 12 })
        if (prop === 'canvas') return document.createElement('canvas')
        if (typeof prop === 'symbol') return undefined
        const value = Reflect.get(target, prop, receiver)
        if (typeof value === 'function') return value.bind(target)
        if (value !== undefined) return value
        return () => 0
      },
    })
  }
  canvasProto.getContext = getContext as typeof canvasProto.getContext

  const svgProto = SVGElement.prototype as SVGElement & {
    getBBox?: () => { x: number; y: number; width: number; height: number }
    getComputedTextLength?: () => number
  }
  if (typeof svgProto.getBBox !== 'function') {
    svgProto.getBBox = () => ({ x: 0, y: 0, width: 120, height: 24 })
  }
  if (typeof svgProto.getComputedTextLength !== 'function') {
    svgProto.getComputedTextLength = () => 40
  }

  const sample = document.createElement('div')
  document.body.appendChild(sample)
  const sampleWidth = sample.clientWidth
  sample.remove()
  if (!sampleWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  }

  const origStyle = window.getComputedStyle.bind(window)
  window.getComputedStyle = (elt: Element, pseudo?: string | null) => {
    const style = origStyle(elt, pseudo)
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === 'getPropertyValue') {
          return (name: string) => {
            const value = target.getPropertyValue(name)
            if (value === '' && /^(padding|border|margin)/.test(name)) return '0px'
            return value
          }
        }
        const value = Reflect.get(target, prop, receiver)
        if (typeof value === 'function') return value.bind(target)
        return value
      },
    })
  }
}

type MermaidApi = typeof import('mermaid').default

let mermaidApi: Promise<MermaidApi> | null = null
let mermaidSeq = 0

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidApi) {
    mermaidApi = import('mermaid').then((mod) => {
      const api = mod.default
      api.startOnLoad = false
      // strict：禁用点击与宽松 HTML。htmlLabels 关掉后标签是 SVG 文本，消毒时不必放行 foreignObject。
      api.initialize({
        securityLevel: 'strict',
        startOnLoad: false,
        htmlLabels: false,
        suppressErrorRendering: true,
      })
      return api
    })
  }
  return mermaidApi
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('mermaid timeout')), ms)
  })
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

function nextMermaidId(): string {
  mermaidSeq += 1
  return `mdmermaid${mermaidSeq}`
}

async function renderMermaidSvg(source: string): Promise<string> {
  ensureMermaidDom()
  const api = await loadMermaid()
  const id = nextMermaidId()
  const rendered = api.render(id, source)
  const result = await withTimeout(rendered, MERMAID_TIMEOUT_MS)
  if (!result.svg || result.svg.indexOf('<svg') < 0) throw new Error('mermaid svg missing')
  return result.svg
}

function takeSvg(doc: Document, svg: string): Element {
  const holder = doc.createElement('div')
  holder.innerHTML = svg
  const node = holder.querySelector('svg')
  if (!node) throw new Error('mermaid svg missing')
  return node
}

/** 围栏换成图，失败则留下代码块和错误文案。不走 Shiki。 */
async function mountMermaid(doc: Document, pre: Element, code: Element): Promise<void> {
  const shell = doc.createElement('div')
  shell.className = 'md-mermaid'
  pre.replaceWith(shell)
  try {
    const source = code.textContent || ''
    const svg = await renderMermaidSvg(source)
    shell.appendChild(takeSvg(doc, svg))
  } catch {
    const error = doc.createElement('p')
    error.className = 'md-mermaid__error'
    error.textContent = '图表渲染失败'
    shell.appendChild(error)
    shell.appendChild(pre)
  }
}

/** 给已消毒的 HTML 加复制外壳、Shiki、KaTeX 与 Mermaid。没有代码块也没有 $ 时原样返回。 */
export async function enhanceHtml(html: string, source?: string): Promise<string> {
  if (!html) return html
  // 纯公式没有 <pre。这里放行，否则增强阶段碰不到 KaTeX。
  const hasPre = html.indexOf('<pre') >= 0
  const hasMath = html.indexOf('$') >= 0 || (source != null && source.indexOf('$') >= 0)
  if (!hasPre && !hasMath) return html

  let current = html
  if (source != null && source.indexOf('$') >= 0) {
    current = await renderMathMarkdown(source)
  }
  if (current.indexOf('<pre') < 0) return current

  const doc = new DOMParser().parseFromString(current, 'text/html')
  const codes = doc.querySelectorAll('pre > code')
  if (!codes.length) return current

  let shiki: typeof import('shiki') | null = null
  for (const code of Array.from(codes)) {
    const pre = code.parentElement
    if (!pre || pre.closest('.md-code') || pre.closest('.md-mermaid')) continue

    const lang = fenceLang(code)
    if (lang.toLowerCase() === 'mermaid') {
      await mountMermaid(doc, pre, code)
      continue
    }

    const shell = doc.createElement('div')
    shell.className = 'md-code'
    shell.setAttribute('data-lang', lang)

    const button = doc.createElement('button')
    button.className = 'md-code__copy'
    button.setAttribute('type', 'button')
    button.textContent = '复制'
    shell.appendChild(button)

    // 未知语言或高亮失败时留下原来的 pre，不打断整段
    let highlighted: Element | null = null
    if (lang) {
      try {
        if (!shiki) {
          ensureBlobStream()
          shiki = await import('shiki')
        }
        const source = code.textContent || ''
        const nextHtml = await shiki.codeToHtml(source, {
          lang,
          theme: SHIKI_THEME,
        })
        highlighted = takeHighlightedPre(doc, nextHtml)
      } catch {
        highlighted = null
      }
    }

    pre.replaceWith(shell)
    if (highlighted) shell.appendChild(highlighted)
    else shell.appendChild(pre)
  }

  return doc.body.innerHTML
}
