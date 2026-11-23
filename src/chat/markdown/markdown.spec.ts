import { describe, expect, it } from 'vitest'
import { markdownSource, renderMarkdown } from './index'

describe('markdown basics', () => {
  it('剥 think 标签保留正文 Markdown', () => {
    expect(markdownSource('<think>x</think>**你好**')).toBe('**你好**')
  })

  it('渲染标题与粗体且无 script', () => {
    const html = renderMarkdown('# 标题\n\n**粗** <script>alert(1)</script>')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>')
    expect(html).not.toMatch(/<script/i)
  })

  it('GFM 表格', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(html).toContain('<table')
    expect(html).toContain('<td')
  })

  it('任务列表与删除线', () => {
    const html = renderMarkdown('- [ ] 待办\n- [x] 完成\n\n~~旧~~')
    expect(html).toMatch(/checkbox|task-list|type="checkbox"/i)
    expect(html).toMatch(/<s>|<del>/i)
  })

  it('脚注与定义列表', () => {
    const html = renderMarkdown('注[^1]\n\n[^1]: 说明\n\n术语\n: 定义')
    expect(html).toMatch(/footnote|fn-/i)
    expect(html).toContain('<dl')
  })

  it('tip 容器', () => {
    const html = renderMarkdown('::: tip\n注意\n:::')
    expect(html).toContain('md-container')
    expect(html).toContain('注意')
  })

  it('外链 noopener，拒绝 javascript', () => {
    const ok = renderMarkdown('[开](https://example.com)')
    expect(ok).toContain('noopener')
    expect(ok).toContain('_blank')
    const bad = renderMarkdown('[x](javascript:alert(1))')
    expect(bad).not.toMatch(/javascript:/i)
  })

  it('导出哈希链接不加 target=_blank', () => {
    const html = renderMarkdown('[下载](#ds-export:ticket-abc)')
    expect(html).toContain('#ds-export:ticket-abc')
    expect(html).not.toContain('target="_blank"')
    expect(html).not.toContain('_blank')
    const encoded = renderMarkdown('[下载](#ds-export:ticket%3Aabc)')
    expect(encoded).toContain('#ds-export:ticket%3Aabc')
    expect(encoded).not.toContain('_blank')
  })

  it('相对链接不加 target=_blank', () => {
    const html = renderMarkdown('[内](/oa/path)')
    expect(html).toContain('href="/oa/path"')
    expect(html).not.toContain('_blank')
  })
})
