import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPageAgentHost, stopPageAgentHost } from './bridge'
import { PAGE_MSG_PING, PAGE_MSG_PONG, PAGE_MSG_SNAPSHOT_REQUEST, PAGE_MSG_SNAPSHOT_RESULT } from './protocol'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 40,
    height: 20,
    top: 0,
    left: 0,
    bottom: 20,
    right: 40,
    x: 0,
    y: 0,
    toJSON() {},
  })
})

afterEach(() => {
  stopPageAgentHost()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('page-agent host bridge', () => {
  it('响应 ping 与 snapshot-request（requestId 配对）', async () => {
    document.body.innerHTML = `<button type="button">OK</button>`
    startPageAgentHost()

    const source = {
      postMessage: vi.fn(),
    }

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: PAGE_MSG_PING },
        source: source as unknown as MessageEventSource,
      }),
    )
    expect(source.postMessage).toHaveBeenCalledWith({ type: PAGE_MSG_PONG }, '*')

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: PAGE_MSG_SNAPSHOT_REQUEST, requestId: 'r1' },
        source: source as unknown as MessageEventSource,
      }),
    )

    await vi.waitFor(() => expect(source.postMessage.mock.calls.length).toBeGreaterThanOrEqual(2))
    const result = source.postMessage.mock.calls.find((c) => c[0]?.type === PAGE_MSG_SNAPSHOT_RESULT)?.[0]
    expect(result).toMatchObject({ requestId: 'r1', ok: true })
    expect(result.snapshot.elements.some((e: { name: string }) => e.name.includes('OK'))).toBe(true)
  })
})
