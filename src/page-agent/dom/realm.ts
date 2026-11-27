/**
 * 跨 iframe 的 DOM 类型判断（顶层 instanceof 对业务 iframe 节点会失败）。
 */

/** @param el 候选节点 */
export function isHtmlElement(el: Element | Node | null | undefined): el is HTMLElement {
  if (!el || el.nodeType !== 1) return false
  const view = (el as Element).ownerDocument?.defaultView
  if (view?.HTMLElement) {
    try {
      return el instanceof view.HTMLElement
    } catch {
      // ignore
    }
  }
  return typeof (el as HTMLElement).style === 'object'
}

function isType(el: Element, name: 'HTMLInputElement' | 'HTMLTextAreaElement' | 'HTMLSelectElement' | 'HTMLButtonElement' | 'HTMLOptionElement' | 'HTMLDialogElement' | 'HTMLIFrameElement' | 'HTMLTableElement'): boolean {
  const view = el.ownerDocument?.defaultView as unknown as Record<string, new () => Element> | null
  const Ctor = view?.[name]
  if (!Ctor) {
    // 退化：用 tagName
    const tag = el.tagName.toLowerCase()
    if (name === 'HTMLInputElement') return tag === 'input'
    if (name === 'HTMLTextAreaElement') return tag === 'textarea'
    if (name === 'HTMLSelectElement') return tag === 'select'
    if (name === 'HTMLButtonElement') return tag === 'button'
    if (name === 'HTMLOptionElement') return tag === 'option'
    if (name === 'HTMLDialogElement') return tag === 'dialog'
    if (name === 'HTMLIFrameElement') return tag === 'iframe'
    if (name === 'HTMLTableElement') return tag === 'table'
    return false
  }
  try {
    return el instanceof Ctor
  } catch {
    return false
  }
}

/** @param el 候选 */
export function asInput(el: Element): HTMLInputElement | null {
  return isType(el, 'HTMLInputElement') ? (el as HTMLInputElement) : null
}
/** @param el 候选 */
export function asTextArea(el: Element): HTMLTextAreaElement | null {
  return isType(el, 'HTMLTextAreaElement') ? (el as HTMLTextAreaElement) : null
}
/** @param el 候选 */
export function asSelect(el: Element): HTMLSelectElement | null {
  return isType(el, 'HTMLSelectElement') ? (el as HTMLSelectElement) : null
}
/** @param el 候选 */
export function asButton(el: Element): HTMLButtonElement | null {
  return isType(el, 'HTMLButtonElement') ? (el as HTMLButtonElement) : null
}
/** @param el 候选 */
export function asDialog(el: Element): HTMLDialogElement | null {
  return isType(el, 'HTMLDialogElement') ? (el as HTMLDialogElement) : null
}
/** @param el 候选 */
export function asTable(el: Element): HTMLTableElement | null {
  return isType(el, 'HTMLTableElement') ? (el as HTMLTableElement) : null
}
