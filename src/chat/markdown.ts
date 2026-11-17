/**
 * 将助手回复 Markdown 转为可安全插入 DOM 的 HTML。
 * 保留标题/粗体/列表/表格/代码块等结构，剥离脚本与危险属性。
 */
import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** 展示用：去掉思考标签外壳后保留 Markdown 标记（不剥 **）。 */
export function markdownSource(content: string): string {
  return (content ?? '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/<[^>]*$/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim()
}

export function renderMarkdown(content: string): string {
  const src = markdownSource(content)
  if (!src) return ''
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
  })
}
