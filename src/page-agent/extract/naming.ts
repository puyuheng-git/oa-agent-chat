import { asInput, asSelect, asTextArea, isHtmlElement } from '../dom/realm'

/** 折叠空白。 */
function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * 按优先级推断可访问名称。
 * aria-label → labelledby → label → 文本 → placeholder → title → alt → 邻近文本
 * @param el 目标元素
 */
export function inferAccessibleName(el: Element): string {
  if (!isHtmlElement(el)) return ''

  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel && normalizeText(ariaLabel)) return normalizeText(ariaLabel)

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const parts: string[] = []
    for (const id of labelledBy.split(/\s+/)) {
      const node = el.ownerDocument.getElementById(id)
      if (node) {
        const t = normalizeText(node.textContent || '')
        if (t) parts.push(t)
      }
    }
    if (parts.length) return parts.join(' ')
  }

  if (asInput(el) || asTextArea(el) || asSelect(el)) {
    const id = el.id
    if (id) {
      const label = el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`)
      if (label) {
        const t = normalizeText(label.textContent || '')
        if (t) return t
      }
    }
    const wrapping = el.closest('label')
    if (wrapping) {
      const t = normalizeText(wrapping.textContent || '')
      if (t) return t
    }
  }

  const own = normalizeText(el.innerText || el.textContent || '')
  if (own && own.length <= 80) return own
  if (own) return own.slice(0, 80)

  const placeholder = el.getAttribute('placeholder')
  if (placeholder && normalizeText(placeholder)) return normalizeText(placeholder)

  const title = el.getAttribute('title')
  if (title && normalizeText(title)) return normalizeText(title)

  const alt = el.getAttribute('alt')
  if (alt && normalizeText(alt)) return normalizeText(alt)

  const nearby = nearbyLabelText(el)
  if (nearby) return nearby

  return ''
}

function cssEscape(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id)
  return id.replace(/"/g, '\\"')
}

/** 取前一个兄弟或父级短文本作为邻近标签。 */
function nearbyLabelText(el: Element): string {
  const prev = el.previousElementSibling
  if (prev && !asInput(prev) && prev.tagName.toLowerCase() !== 'button') {
    const t = normalizeText(prev.textContent || '')
    if (t && t.length <= 40) return t
  }
  const parent = el.parentElement
  if (parent && parent.childElementCount <= 3) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = normalizeText(child.textContent || '')
        if (t && t.length <= 40) return t
      }
    }
  }
  return ''
}
