import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ElementPlus, { ElMessage } from 'element-plus'
import { clearTicket, openSession, sendMessageStream, uploadAttachments } from '../api'
import App from '../App.vue'
import type { ChatMessage, LocalConversation, PendingAttachment } from '../types'
import { canSendMessage, captionBesideFiles, filesFromClipboard, appendPending } from './files-from-clipboard'

function clipboard(parts: { type: string; file?: File; text?: string }[]): DataTransfer {
  const text = parts.find((part) => part.type === 'text/plain')?.text ?? ''
  const items = parts.map((part) => ({
    kind: part.file ? 'file' : 'string',
    type: part.type,
    getAsFile: () => part.file ?? null,
  }))
  return {
    items,
    getData: (format: string) => (format === 'text/plain' ? text : ''),
  } as unknown as DataTransfer
}

describe('filesFromClipboard', () => {
  it('image/png 进入 images，text 为空', () => {
    const png = new File(['png'], 'shot.png', { type: 'image/png' })
    const result = filesFromClipboard(clipboard([{ type: 'image/png', file: png }]))
    expect(result.images).toEqual([png])
    expect(result.text).toBe('')
  })

  it('只有 text/plain 时 images 为空，text 为那段文字', () => {
    const result = filesFromClipboard(clipboard([{ type: 'text/plain', text: '你好' }]))
    expect(result.images).toEqual([])
    expect(result.text).toBe('你好')
  })

  it('图片和文字都保留', () => {
    const png = new File(['png'], 'shot.png', { type: 'image/png' })
    const result = filesFromClipboard(
      clipboard([
        { type: 'image/png', file: png },
        { type: 'text/plain', text: '看这张图' },
      ]),
    )
    expect(result.images).toEqual([png])
    expect(result.text).toBe('看这张图')
  })

  it('image/bmp 被丢弃', () => {
    const bmp = new File(['bmp'], 'old.bmp', { type: 'image/bmp' })
    const png = new File(['png'], 'shot.png', { type: 'image/png' })
    const result = filesFromClipboard(
      clipboard([
        { type: 'image/bmp', file: bmp },
        { type: 'image/png', file: png },
      ]),
    )
    expect(result.images).toEqual([png])
    expect(result.images).not.toContain(bmp)
    expect(result.files).toEqual([bmp, png])
    expect(result.text).toBe('')
  })

  it('pdf 和 xlsx 进入 files，不进入 images', () => {
    const pdf = new File(['%PDF'], '合同.pdf', { type: 'application/pdf' })
    const sheet = new File(['sheet'], '表.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const result = filesFromClipboard(
      clipboard([
        { type: 'application/pdf', file: pdf },
        { type: sheet.type, file: sheet },
      ]),
    )
    expect(result.files).toEqual([pdf, sheet])
    expect(result.images).toEqual([])
  })
})

describe('appendPending', () => {
  it('收下 pdf，拒绝 bmp，并保留已有附件', () => {
    const pdf = new File(['%PDF'], '合同.pdf', { type: 'application/pdf' })
    const bmp = new File(['bmp'], 'old.bmp', { type: 'image/bmp' })
    const existing = [{ id: 'att_old', name: 'a.csv', size: 1, mime: 'text/csv' }]
    const { next, rejected } = appendPending(existing, [pdf, bmp])
    expect(rejected).toBe(true)
    expect(next.map((item) => item.name)).toEqual(['a.csv', '合同.pdf'])
    expect(next[1]?.file).toBe(pdf)
  })
})

describe('captionBesideFiles', () => {
  it('文件路径不写进输入框，说明文字保留', () => {
    const pdf = new File(['%PDF'], '合同.pdf', { type: 'application/pdf' })
    expect(captionBesideFiles('C:\\docs\\合同.pdf', [pdf])).toBe('')
    expect(captionBesideFiles('请看这份合同', [pdf])).toBe('请看这份合同')
  })
})

describe('canSendMessage', () => {
  it('非发送中，正文为空但有附件可以发送；没有正文也没有附件、或正在发送则不可以', () => {
    expect(canSendMessage('', 1, false)).toBe(true)
    expect(canSendMessage('', 0, false)).toBe(false)
    expect(canSendMessage('hi', 0, true)).toBe(false)
  })
})

describe('uploadAttachments', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearTicket()
  })

  it('用 files 字段上传，带 Bearer，不设置 Content-Type，响应不含在请求 JSON 里', async () => {
    const fn = vi.fn()
    fn.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({ ticket: 't-1', expires_in: 1800, display_name: '张三', thread_id: 'thr_1' }),
          { status: 200 },
        ),
    )
    fn.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            files: [{ file_id: 'upl_1', filename: 'a.png', size_bytes: 3, media_kind: 'image' }],
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fn)
    await openSession('code-1')
    const file = new File(['png'], 'a.png', { type: 'image/png' })
    const rows = await uploadAttachments([file])
    expect(rows).toEqual([{ file_id: 'upl_1', filename: 'a.png', size_bytes: 3, media_kind: 'image' }])
    const [url, init] = fn.mock.calls[1] as unknown as [string, RequestInit]
    expect(String(url)).toContain('/v1/chat/attachments')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer t-1')
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers['content-type']).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
    const got = (init.body as FormData).getAll('files')
    expect(got).toHaveLength(1)
    expect(got[0]).toBeInstanceOf(File)
    expect(typeof init.body).not.toBe('string')
  })

  it('上传失败时抛出服务端 message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'BAD_TYPE', message: '只能上传指定类型' } }), { status: 400 }),
      ),
    )
    const file = new File(['x'], 'a.exe', { type: 'application/octet-stream' })
    await expect(uploadAttachments([file])).rejects.toMatchObject({ status: 400, message: '只能上传指定类型' })
  })

  it('sendMessageStream 把 attachment_ids 放进 JSON，不放文件字节', async () => {
    const sse =
      'event: done\ndata: {"run_id":"r1","thread_id":"t","run_status":"succeeded","reply":{"type":"text","content":"ok","data":null}}\n\n'
    const fn = vi.fn(async () => new Response(sse, { status: 200 }))
    vi.stubGlobal('fetch', fn)
    await sendMessageStream('', () => {}, undefined, ['upl_1', 'upl_2'])
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(String(init.body))
    expect(body.message).toBe('')
    expect(body.attachment_ids).toEqual(['upl_1', 'upl_2'])
    expect(body.client_msg_id).toMatch(/^[\w-]{8,64}$/)
    expect(body.files).toBeUndefined()
    expect(body.file).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('base64')
  })

  it('把 AbortSignal 交给 fetch；已经中止时直接以 AbortError 拒绝，不发出请求', async () => {
    const ctrl = new AbortController()
    const fn = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fn)
    const file = new File(['png'], 'a.png', { type: 'image/png' })
    const pending = uploadAttachments([file], ctrl.signal)
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(ctrl.signal)
    await pending

    ctrl.abort()
    const blocked = vi.fn()
    vi.stubGlobal('fetch', blocked)
    await expect(uploadAttachments([file], ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(blocked).not.toHaveBeenCalled()
  })

  it('上传过程中止时，fetch 的 AbortError 原样抛出', async () => {
    const ctrl = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      ),
    )
    const file = new File(['png'], 'a.png', { type: 'image/png' })
    const pending = uploadAttachments([file], ctrl.signal)
    ctrl.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(pending).rejects.not.toMatchObject({ status: expect.any(Number) })
  })
})

const THREAD = {
  thread_id: 'thr_1',
  title: null,
  status: 'active',
  created_channel: 'oa_web',
  last_channel: null,
  pinned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_message_at: null,
}

const SSE_OK =
  'event: done\ndata: {"run_id":"r1","thread_id":"thr_1","run_status":"succeeded","reply":{"type":"text","content":"ok","data":null}}\n\n'

type ChatHandle = {
  send: (text?: string) => Promise<void>
  stop: () => void
  input: string
  sending: boolean
  attachments: PendingAttachment[]
  messages: ChatMessage[]
  conversations: LocalConversation[]
  activeConversationId: string
  threadId: string
}

function uploadedResponse() {
  return new Response(
    JSON.stringify({ files: [{ file_id: 'upl_1', filename: 'a.png', size_bytes: 3, media_kind: 'image' }] }),
    { status: 200 },
  )
}

function threadsResponse() {
  return new Response(JSON.stringify({ items: [THREAD], page: 1, page_size: 50, total: 1 }), { status: 200 })
}

async function mountChat() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ticket: 't-1', expires_in: 1800, display_name: '张三', thread_id: 'thr_1' }),
          { status: 200 },
        ),
    ),
  )
  await openSession('code-1')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(App)
  app.use(ElementPlus)
  const vm = app.mount(el) as unknown as ChatHandle
  await nextTick()
  vm.threadId = 'thr_1'
  vm.activeConversationId = 'thr_1'
  vm.conversations = [{ id: 'thr_1', title: null, updatedAt: Date.now(), messages: [], historyLoaded: true }]
  return {
    vm,
    async unmount() {
      app.unmount()
      el.remove()
    },
  }
}

function draftFile(): PendingAttachment {
  const file = new File(['png'], 'a.png', { type: 'image/png' })
  return { id: 'att_1', name: file.name, size: file.size, mime: file.type, file }
}

describe('发送草稿在上传中止和流式失败时保留', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    clearTicket()
  })

  it('上传返回时若已停止，不调用流式发送，不清输入，不写入用户气泡，也不弹出错误', async () => {
    const chat = await mountChat()
    const errors = vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close() {} }) as ReturnType<typeof ElMessage.error>)
    const file = draftFile()
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(String(url))
        chat.vm.stop()
        return Promise.resolve(uploadedResponse())
      }),
    )
    chat.vm.input = '你好'
    chat.vm.attachments = [file]
    await chat.vm.send()
    expect(urls.some((url) => url.includes('/messages/stream'))).toBe(false)
    expect(urls.some((url) => url.includes('/attachments'))).toBe(true)
    expect(chat.vm.input).toBe('你好')
    expect(chat.vm.attachments).toEqual([file])
    expect(chat.vm.attachments[0]?.file).toBe(file.file)
    expect(chat.vm.messages.filter((item) => item.role === 'user')).toEqual([])
    expect(errors).not.toHaveBeenCalled()
    expect(chat.vm.sending).toBe(false)
    await chat.unmount()
  })

  it('上传未结束时再次发送不会并发第二次上传', async () => {
    const chat = await mountChat()
    let release: (value: Response) => void = () => {}
    let uploads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const target = String(url)
        if (target.includes('/attachments')) {
          uploads += 1
          return new Promise<Response>((resolve) => {
            release = resolve
          })
        }
        if (target.includes('/messages/stream')) return Promise.resolve(new Response(SSE_OK, { status: 200 }))
        if (target.includes('/threads')) return Promise.resolve(threadsResponse())
        return Promise.resolve(new Response('{}', { status: 404 }))
      }),
    )
    chat.vm.input = '你好'
    chat.vm.attachments = [draftFile()]
    const first = chat.vm.send()
    await vi.waitFor(() => expect(uploads).toBe(1))
    await chat.vm.send()
    expect(uploads).toBe(1)
    expect(chat.vm.sending).toBe(true)
    release(uploadedResponse())
    await first
    expect(chat.vm.input).toBe('')
    expect(chat.vm.messages.some((item) => item.role === 'user' && item.text === '你好')).toBe(true)
    await chat.unmount()
  })

  it('流式发送失败时保留正文和 File，不留下用户气泡', async () => {
    const chat = await mountChat()
    const file = draftFile()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const target = String(url)
        if (target.includes('/attachments')) return Promise.resolve(uploadedResponse())
        if (target.includes('/messages/stream')) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: { code: 'STREAM', message: '发送失败' } }), { status: 500 }),
          )
        }
        return Promise.resolve(new Response('{}', { status: 404 }))
      }),
    )
    chat.vm.input = '你好'
    chat.vm.attachments = [file]
    await chat.vm.send()
    expect(chat.vm.input).toBe('你好')
    expect(chat.vm.attachments[0]?.file).toBe(file.file)
    expect(chat.vm.messages.filter((item) => item.role === 'user')).toEqual([])
    expect(chat.vm.messages.some((item) => item.role === 'assistant' && item.text === '发送失败')).toBe(true)
    await chat.unmount()
  })

  it('流式发送成功后才清空输入和本地附件，并写入用户气泡', async () => {
    const chat = await mountChat()
    const file = draftFile()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const target = String(url)
        if (target.includes('/attachments')) return Promise.resolve(uploadedResponse())
        if (target.includes('/messages/stream')) return Promise.resolve(new Response(SSE_OK, { status: 200 }))
        if (target.includes('/threads')) return Promise.resolve(threadsResponse())
        return Promise.resolve(new Response('{}', { status: 404 }))
      }),
    )
    chat.vm.input = '你好'
    chat.vm.attachments = [file]
    await chat.vm.send()
    await nextTick()
    expect(chat.vm.input).toBe('')
    expect(chat.vm.attachments).toEqual([])
    const roles = chat.vm.messages.map((item) => item.role)
    expect(roles[0]).toBe('user')
    expect(chat.vm.messages[0]?.text).toBe('你好')
    expect(chat.vm.messages[0]?.attachments?.[0]?.id).toBe('upl_1')
    expect(chat.vm.messages[0]?.attachments?.[0]?.file).toBeUndefined()
    await chat.unmount()
  })
})
