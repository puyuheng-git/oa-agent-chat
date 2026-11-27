import { asInput, isHtmlElement } from '../dom/realm'
import { SENSITIVE_VALUE_MASK } from '../types'

/** 敏感 name/id/placeholder 关键字（中英文）。 */
const SENSITIVE_NAME_RE =
  /password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|身份证|银行卡|银行卡号|信用卡|cvv|ssn|id[_-]?card/i

const SENSITIVE_AUTOCOMPLETE = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
])

/**
 * 判断元素是否为敏感输入（值不应明文交给 AI）。
 * @param el 待检查的 DOM 元素
 */
export function isSensitiveElement(el: Element): boolean {
  if (!isHtmlElement(el)) return false
  const input = asInput(el)
  if (input) {
    const type = (input.type || 'text').toLowerCase()
    if (type === 'password') return true
    const ac = (input.getAttribute('autocomplete') || '').toLowerCase()
    if (SENSITIVE_AUTOCOMPLETE.has(ac)) return true
  }
  const attrs = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('placeholder'), el.getAttribute('aria-label')]
  for (const a of attrs) {
    if (a && SENSITIVE_NAME_RE.test(a)) return true
  }
  return false
}

/**
 * 对可能敏感的值做脱敏；非敏感原样返回。
 * @param el 关联元素
 * @param value 原始值
 */
export function sanitizeValue(el: Element, value: string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  if (isSensitiveElement(el)) return SENSITIVE_VALUE_MASK
  return value
}

/**
 * 过滤快照元素上的敏感 value（就地安全：返回新对象）。
 * @param el DOM 元素
 * @param value 候选值
 */
export function maskIfSensitive(el: Element, value: string | undefined): string | undefined {
  return sanitizeValue(el, value)
}
