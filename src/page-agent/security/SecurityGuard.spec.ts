import { describe, expect, it } from 'vitest'
import { SENSITIVE_VALUE_MASK } from '../types'
import { isSensitiveElement, sanitizeValue } from './SecurityGuard'

describe('SecurityGuard', () => {
  it('识别 password 与敏感 name', () => {
    document.body.innerHTML = `
      <input id="p" type="password" value="secret" />
      <input id="t" name="api_token" value="abc" />
      <input id="n" name="username" value="bob" />
    `
    expect(isSensitiveElement(document.getElementById('p')!)).toBe(true)
    expect(isSensitiveElement(document.getElementById('t')!)).toBe(true)
    expect(isSensitiveElement(document.getElementById('n')!)).toBe(false)
    expect(sanitizeValue(document.getElementById('p')!, 'secret')).toBe(SENSITIVE_VALUE_MASK)
    expect(sanitizeValue(document.getElementById('n')!, 'bob')).toBe('bob')
  })
})
