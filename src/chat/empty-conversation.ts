import type { LocalConversation } from './types'

/** 已确认无任何消息的空白对话（避免未加载完历史就被误删）。 */
export function isConfirmedEmptyConversation(
  c: Pick<LocalConversation, 'messages' | 'historyLoaded'> | null | undefined,
): boolean {
  return !!c && !!c.historyLoaded && c.messages.length === 0
}

/** 优先复用当前空白对话，否则找列表中第一个已确认空白对话。 */
export function findReusableEmptyConversation<
  T extends Pick<LocalConversation, 'id' | 'messages' | 'historyLoaded'>,
>(list: T[], preferId?: string): T | undefined {
  if (preferId) {
    const current = list.find((c) => c.id === preferId)
    if (current && isConfirmedEmptyConversation(current)) return current
  }
  return list.find((c) => isConfirmedEmptyConversation(c))
}
