import { asButton, asInput, asSelect, asTextArea, isHtmlElement } from './realm'

export { isHtmlElement } from './realm'

/**
 * 取元素所属窗口，供跨 iframe 计算样式。
 * @param el 目标元素
 */
function ownerWindow(el: Element): Window | null {
  return el.ownerDocument.defaultView
}

/**
 * 判断元素在当前布局下是否可见（保守：不可见则不当作可操作）。
 * 必须使用元素所属 document 的 window，否则 OA 业务 iframe 内节点会被误判不可见。
 * @param el 目标元素
 */
export function isElementVisible(el: Element): boolean {
  if (!isHtmlElement(el)) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  if (el.hasAttribute('hidden')) return false
  const win = ownerWindow(el)
  if (!win) return false
  let style: CSSStyleDeclaration
  try {
    style = win.getComputedStyle(el)
  } catch {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 || rect.height > 0
  }
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 && rect.height <= 0) {
    // 业务页在 iframe 内时，部分环境/未完成布局会给出 0 尺寸；勿据此判不可见
    try {
      if (win !== win.top) return true
    } catch {
      return true
    }
    return false
  }
  return true
}

/**
 * 表格/大容器可见性：不因零尺寸误杀（iframe + 滚动容器在部分环境 rect 为 0）。
 * 仍排除 display:none / visibility:hidden / hidden / aria-hidden。
 * @param el 目标元素
 */
export function isContainerPresent(el: Element): boolean {
  if (!isHtmlElement(el)) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  if (el.hasAttribute('hidden')) return false
  const win = ownerWindow(el)
  if (!win) return true
  try {
    const style = win.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  } catch {
    return true
  }
  return true
}

/**
 * 元素是否启用（非 disabled / aria-disabled）。
 * @param el 目标元素
 */
export function isElementEnabled(el: Element): boolean {
  if (!isHtmlElement(el)) return false
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-disabled') === 'true') return false
  const input = asInput(el)
  if (input?.disabled) return false
  const button = asButton(el)
  if (button?.disabled) return false
  const select = asSelect(el)
  if (select?.disabled) return false
  const textarea = asTextArea(el)
  if (textarea?.disabled) return false
  return true
}
