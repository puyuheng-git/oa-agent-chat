import { markdownSource } from './source'
import { parseMarkdown } from './parse'
import { sanitizeHtml } from './sanitize'
import { enhanceHtml } from './enhance'
export { markdownSource } from './source'
export { enhanceHtml }
export function renderMarkdown(content: string): string {
  const src = markdownSource(content)
  if (!src) return ''
  return sanitizeHtml(parseMarkdown(src))
}
export async function renderMarkdownEnhanced(content: string): Promise<string> {
  const src = markdownSource(content)
  if (!src) return ''
  const base = sanitizeHtml(parseMarkdown(src))
  const enhanced = await enhanceHtml(base, src)
  return sanitizeHtml(enhanced)
}
