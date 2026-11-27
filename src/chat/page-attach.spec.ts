import { describe, expect, it } from 'vitest'
import type { PageSnapshot } from '../page-agent/types'
import { composeWireMessage, wireHasSnapshot } from './page-attach'

const sample: PageSnapshot = {
  page: { title: 't', url: 'http://x', capturedAt: '2026-01-01T00:00:00.000Z' },
  content: { text: 'hi', truncated: false },
  elements: [{ ref: 'e1', role: 'button', name: '保存', tag: 'button', visible: true, enabled: true }],
  tables: [],
  dialogs: [],
  meta: { dirty: false, elementCount: 1, truncated: false },
}

describe('page-attach', () => {
  it('拼装 wire message，且可检测快照块', () => {
    const wire = composeWireMessage('帮我点保存', sample)
    expect(wire.startsWith('帮我点保存')).toBe(true)
    expect(wireHasSnapshot(wire)).toBe(true)
    expect(wireHasSnapshot('帮我点保存')).toBe(false)
  })
})
