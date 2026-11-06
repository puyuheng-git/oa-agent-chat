import type { PendingAttachment } from '../types'

const CLIP_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ACCEPT_EXT = new Set([
  'xlsx', 'xls', 'docx', 'pdf', 'md', 'markdown', 'csv', 'png', 'jpg', 'jpeg', 'webp', 'gif',
])
const ACCEPT_MIME = new Set([
  ...CLIP_IMAGE_TYPES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
])

export const ACCEPT = '.xlsx,.xls,.docx,.pdf,.md,.markdown,.csv,.png,.jpg,.jpeg,.webp,.gif'
export const TYPE_HINT = '只能上传 Excel、Word、PDF、Markdown、CSV，以及 png、jpeg、webp、gif 图片'

export function fileAllowed(file: File): boolean {
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
  if (ACCEPT_EXT.has(ext)) return true
  return ACCEPT_MIME.has(file.type)
}

/** 剪贴板里的文件项原样放进 files；images 只保留 png/jpeg/webp/gif。bmp 留在 files 里，由 appendPending 拒绝。 */
export function filesFromClipboard(data: DataTransfer | null): { images: File[]; files: File[]; text: string } {
  if (!data) return { images: [], files: [], text: '' }
  const files: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  const images = files.filter((file) => CLIP_IMAGE_TYPES.has(file.type))
  let text = ''
  try {
    text = data.getData('text/plain') ?? ''
  } catch {
    text = ''
  }
  return { images, files, text }
}

/** 剪贴板文字只是被粘贴文件的文件名或路径时，不再写进输入框。 */
export function captionBesideFiles(text: string, files: File[]): string {
  const trimmed = text.trim()
  if (!trimmed || !files.length) return text
  const isFileLabel = files.some((file) => {
    const name = file.name
    if (!name) return false
    return trimmed === name || trimmed.endsWith(`\\${name}`) || trimmed.endsWith(`/${name}`)
  })
  return isFileLabel ? '' : text
}

export function appendPending(
  existing: PendingAttachment[],
  incoming: File[],
): { next: PendingAttachment[]; rejected: boolean } {
  const allowed: File[] = []
  let rejected = false
  for (const file of incoming) {
    if (fileAllowed(file)) allowed.push(file)
    else rejected = true
  }
  if (!allowed.length) return { next: existing, rejected }
  const next = [...existing]
  for (const file of allowed) {
    next.push({
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name || 'image',
      size: file.size,
      mime: file.type || 'application/octet-stream',
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    })
  }
  return { next, rejected }
}

/** 非发送中，且正文非空或已有附件。 */
export function canSendMessage(text: string, attachmentCount: number, sending: boolean): boolean {
  if (sending) return false
  return text.trim().length > 0 || attachmentCount > 0
}
