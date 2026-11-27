import { isHtmlElement } from '../dom/realm'
import { isContainerPresent } from '../dom/visibility'
import type { ContentBlock } from '../types'

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'TEMPLATE'])

/**
 * 提取页面可见正文（非无条件全文）。
 * @param root 根元素，通常为 body
 * @param maxChars 最大字符数
 */
export function extractVisibleText(root: Element | null, maxChars: number): ContentBlock {
  if (!root) return { text: '', truncated: false }
  const parts: string[] = []
  let total = 0
  let truncated = false

  const walk = (node: Node): void => {
    if (truncated) return
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = (node.textContent || '').replace(/\s+/g, ' ').trim()
      if (!raw) return
      const parent = node.parentElement
      // 正文用宽松可见性，避免 iframe 内零尺寸父节点导致整页无文本
      if (parent && !isContainerPresent(parent)) return
      if (parent && SKIP_TAGS.has(parent.tagName)) return
      const room = maxChars - total
      if (raw.length > room) {
        parts.push(raw.slice(0, room))
        total = maxChars
        truncated = true
        return
      }
      parts.push(raw)
      total += raw.length
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (SKIP_TAGS.has(el.tagName)) return
    if (isHtmlElement(el) && !isContainerPresent(el)) return
    // 跳过助手挂件自身，避免污染正文
    if (el.id === 'oa-agent-bubble-window' || el.id === 'oa-agent-bubble-button') return
    for (const child of Array.from(el.childNodes)) walk(child)
  }

  walk(root)
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), truncated }
}
