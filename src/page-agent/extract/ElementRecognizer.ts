import { asInput, asSelect, asTextArea, isHtmlElement } from '../dom/realm'
import { isElementEnabled, isElementVisible } from '../dom/visibility'
import { ElementMapper } from '../mapper/ElementMapper'
import { maskIfSensitive } from '../security/SecurityGuard'
import type { SnapshotElement } from '../types'
import { inferAccessibleName } from './naming'

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'combobox',
  'listbox',
  'option',
  'slider',
  'spinbutton',
])

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'textarea', 'select', 'option', 'summary'])

/**
 * 判断是否为可交互候选（尚未做可见性过滤）。
 * @param el DOM 元素
 */
export function isInteractiveCandidate(el: Element): boolean {
  if (!isHtmlElement(el)) return false
  const tag = el.tagName.toLowerCase()
  if (INTERACTIVE_TAGS.has(tag)) return true
  if (el.isContentEditable) return true
  const role = (el.getAttribute('role') || '').toLowerCase()
  if (role && INTERACTIVE_ROLES.has(role)) return true
  const tabindex = el.getAttribute('tabindex')
  if (tabindex != null && tabindex !== '' && Number(tabindex) >= 0) return true
  if (el.hasAttribute('onclick')) return true
  const cls = el.className && typeof el.className === 'string' ? el.className : ''
  if (
    /\b(btn|button|el-button|layui-btn|SmallButton|BigButton|layui-form-checkbox|layui-form-radio|layui-form-switch|layui-form-select)\b/i.test(
      cls,
    )
  ) {
    return true
  }
  return false
}

/**
 * 推断 role 字符串。
 * @param el DOM 元素
 */
export function inferRole(el: Element): string {
  const explicit = (el.getAttribute('role') || '').toLowerCase()
  if (explicit) return explicit
  const tag = el.tagName.toLowerCase()
  if (tag === 'a') return 'link'
  if (tag === 'button') return 'button'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (tag === 'option') return 'option'
  const input = asInput(el)
  if (input) {
    const type = (input.type || 'text').toLowerCase()
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button'
    return 'textbox'
  }
  if (isHtmlElement(el) && el.isContentEditable) return 'textbox'
  return tag
}

/**
 * 采集单个元素的快照字段（含 ref）。
 * @param el DOM 元素
 * @param mapper ref 映射器
 */
export function describeElement(el: Element, mapper: ElementMapper): SnapshotElement {
  const tag = el.tagName.toLowerCase()
  const role = inferRole(el)
  const name = inferAccessibleName(el)
  const visible = isElementVisible(el)
  const enabled = isElementEnabled(el)
  const ref = mapper.assign(el)

  const out: SnapshotElement = {
    ref,
    role,
    name,
    tag,
    visible,
    enabled,
  }

  const input = asInput(el)
  const textarea = asTextArea(el)
  const select = asSelect(el)
  if (input) {
    const type = (input.type || 'text').toLowerCase()
    out.type = type
    if (type === 'checkbox' || type === 'radio') out.checked = input.checked
    const masked = maskIfSensitive(el, input.value)
    if (masked !== undefined) out.value = masked
    if (input.placeholder) out.placeholder = input.placeholder
  } else if (textarea) {
    out.type = 'textarea'
    const masked = maskIfSensitive(el, textarea.value)
    if (masked !== undefined) out.value = masked
    if (textarea.placeholder) out.placeholder = textarea.placeholder
  } else if (select) {
    out.type = 'select'
    out.value = select.value
  } else if (isHtmlElement(el) && el.isContentEditable) {
    out.type = 'contenteditable'
    const text = (el.innerText || '').trim()
    if (text) out.value = text.slice(0, 200)
  }

  if (role === 'checkbox' || role === 'radio' || role === 'switch') {
    const ariaChecked = el.getAttribute('aria-checked')
    if (ariaChecked != null && out.checked === undefined) out.checked = ariaChecked === 'true'
  }

  return out
}

/**
 * 收集文档内可交互元素描述。
 * @param root 根节点
 * @param mapper ref 映射
 * @param opts 可见性与数量上限
 */
export function collectInteractiveElements(
  root: ParentNode,
  mapper: ElementMapper,
  opts: { visibleOnly: boolean; maxElements: number },
): { elements: SnapshotElement[]; truncated: boolean } {
  const all = root.querySelectorAll('*')
  const elements: SnapshotElement[] = []
  let truncated = false
  for (const node of Array.from(all)) {
    if (!isInteractiveCandidate(node)) continue
    if (opts.visibleOnly && !isElementVisible(node)) continue
    if (elements.length >= opts.maxElements) {
      truncated = true
      break
    }
    elements.push(describeElement(node, mapper))
  }
  return { elements, truncated }
}
