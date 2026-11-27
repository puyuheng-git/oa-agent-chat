import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageChangeMonitor } from './PageChangeMonitor'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PageChangeMonitor', () => {
  it('DOM 变化后标记 dirty，clear 后复位', async () => {
    const monitor = new PageChangeMonitor(document.body)
    monitor.start()
    expect(monitor.isDirty()).toBe(false)
    document.body.appendChild(document.createElement('div'))
    await vi.waitFor(() => expect(monitor.isDirty()).toBe(true))
    monitor.clearDirty()
    expect(monitor.isDirty()).toBe(false)
    monitor.stop()
  })
})
