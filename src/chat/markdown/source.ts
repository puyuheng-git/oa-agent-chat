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
