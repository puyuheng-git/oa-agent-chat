import { describe, expect, it } from 'vitest'
import { findReusableEmptyConversation, isConfirmedEmptyConversation } from './empty-conversation'

describe('isConfirmedEmptyConversation', () => {
  it('requires historyLoaded and zero messages', () => {
    expect(isConfirmedEmptyConversation({ messages: [], historyLoaded: true })).toBe(true)
    expect(isConfirmedEmptyConversation({ messages: [], historyLoaded: false })).toBe(false)
    expect(isConfirmedEmptyConversation({ messages: [], historyLoaded: undefined })).toBe(false)
    expect(
      isConfirmedEmptyConversation({
        messages: [{ id: '1', role: 'user', text: 'hi', createdAt: 1 }],
        historyLoaded: true,
      }),
    ).toBe(false)
    expect(isConfirmedEmptyConversation(null)).toBe(false)
  })
})

describe('findReusableEmptyConversation', () => {
  const list = [
    { id: 'a', messages: [{ id: '1', role: 'user' as const, text: 'x', createdAt: 1 }], historyLoaded: true },
    { id: 'b', messages: [], historyLoaded: true },
    { id: 'c', messages: [], historyLoaded: false },
  ]

  it('prefers current empty conversation', () => {
    expect(findReusableEmptyConversation(list, 'b')?.id).toBe('b')
  })

  it('falls back to first confirmed empty', () => {
    expect(findReusableEmptyConversation(list, 'a')?.id).toBe('b')
    expect(findReusableEmptyConversation(list)?.id).toBe('b')
  })

  it('ignores unloaded empties', () => {
    expect(findReusableEmptyConversation([{ id: 'c', messages: [], historyLoaded: false }])).toBeUndefined()
  })
})
