import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import AssistantMessage from './AssistantMessage.vue'
import type { ChatMessage } from '../types'

function message(text: string): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    text,
    streaming: true,
    createdAt: 1,
  }
}

async function mount(text: string) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(AssistantMessage, { message: message(text) })
  app.use(ElementPlus)
  app.mount(el)
  await nextTick()
  return {
    el,
    unmount() {
      app.unmount()
      el.remove()
      document.body.querySelector('.img-lightbox')?.remove()
    },
  }
}

describe('AssistantMessage 图片灯箱', () => {
  let mounted: { unmount: () => void } | null = null

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('点击正文图片打开同 src 遮罩，再点遮罩关闭', async () => {
    const view = await mount('看图 ![示意图](https://example.com/a.png)')
    mounted = view
    const img = view.el.querySelector('.md img')
    expect(img).toBeInstanceOf(HTMLImageElement)
    const src = (img as HTMLImageElement).src
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    img?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await nextTick()
    const overlay = document.body.querySelector('.img-lightbox')
    expect(overlay).toBeTruthy()
    expect(overlay?.querySelector('img')?.getAttribute('src')).toBe(src)
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('.img-lightbox')).toBeNull()
  })

  it('点正文文字不打开灯箱', async () => {
    const view = await mount('只有文字')
    mounted = view
    const md = view.el.querySelector('.md')
    md?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextTick()
    expect(document.body.querySelector('.img-lightbox')).toBeNull()
  })
})
