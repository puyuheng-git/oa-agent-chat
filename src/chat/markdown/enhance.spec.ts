import { describe, expect, it } from 'vitest'
import { enhanceHtml, renderMarkdown, renderMarkdownEnhanced } from './index'

describe('enhance code', () => {
  it('代码块带复制按钮与高亮 class 或 style', async () => {
    const html = await renderMarkdownEnhanced('```ts\nconst a = 1\n```')
    expect(html).toMatch(/md-code|复制|data-lang|shiki|foreground/i)
    expect(html).toContain('const')
  })

  it('消毒后仍保留复制外壳与 shiki class', async () => {
    const html = await renderMarkdownEnhanced('```ts\nconst a = 1\n```')
    expect(html).toContain('md-code__copy')
    expect(html).toContain('复制')
    expect(html).toContain('data-lang="ts"')
    expect(html).toMatch(/class="[^"]*\bshiki\b/)
    expect(html).toMatch(/style=/)
    expect(html).toContain('const')
    expect(html).not.toMatch(/<script/i)
  })

  it('enhanceHtml 在 jsdom 里包复制外壳并高亮', async () => {
    const html = await enhanceHtml('<pre><code class="language-ts">const a = 1</code></pre>')
    expect(html).toContain('md-code')
    expect(html).toContain('md-code__copy')
    expect(html).toContain('复制')
    expect(html).toContain('data-lang="ts"')
    expect(html).toMatch(/shiki/i)
    expect(html).toContain('const')
  })

  it('未知语言保留原文', async () => {
    const html = await renderMarkdownEnhanced('```not-a-real-lang\nkeep-me-raw\n```')
    expect(html).toContain('keep-me-raw')
    expect(html).toContain('md-code')
    expect(html).toContain('复制')
    expect(html).toContain('data-lang="not-a-real-lang"')
  })

  it('行内代码不加复制外壳', async () => {
    const html = await renderMarkdownEnhanced('用 `const` 即可')
    expect(html).toContain('const')
    expect(html).not.toContain('md-code')
  })

  it('同步 renderMarkdown 不加复制外壳', () => {
    const html = renderMarkdown('```ts\nconst a = 1\n```')
    expect(html).toContain('const')
    expect(html).not.toContain('md-code')
    expect(html).not.toContain('复制')
  })
})

describe('containers', () => {
  it('details 保留标题且可折叠', async () => {
    const html = await renderMarkdownEnhanced('::: details 说明\n内容\n:::')
    expect(html).toMatch(/<details/i)
    expect(html).toMatch(/<summary[^>]*>\s*说明\s*<\/summary>/i)
    expect(html).toContain('内容')
  })

  it('details 空标题回退为详情', async () => {
    const html = await renderMarkdownEnhanced('::: details\n内容\n:::')
    expect(html).toMatch(/<summary[^>]*>\s*详情\s*<\/summary>/i)
    expect(html).toContain('内容')
  })
})

describe('katex math', () => {
  it('同步路径不渲染公式，增强后才有 katex', async () => {
    expect(renderMarkdown('面积 $a^2$')).not.toMatch(/katex/i)
    const html = await renderMarkdownEnhanced('面积 $a^2$')
    expect(html).toMatch(/katex/i)
  })

  it('行内与块级公式', async () => {
    const html = await renderMarkdownEnhanced('面积 $a^2$ \n\n$$\nE=mc^2\n$$')
    expect(html).toMatch(/katex/i)
    expect(html).not.toContain('<script')
  })

  it('裸货币不按公式', async () => {
    const html = await renderMarkdownEnhanced('报销 $12.5 元')
    expect(html).toContain('$12.5')
    expect(html).not.toMatch(/katex/i)
  })

  it('同行货币与公式互不吞掉', async () => {
    const html = await renderMarkdownEnhanced('合计 $12.5 元，面积 $a^2$')
    expect(html).toContain('$12.5')
    expect(html).toMatch(/katex/i)
  })

  it('非法公式保留源码', async () => {
    const html = await renderMarkdownEnhanced('坏 $\\notacommand{x}$')
    expect(html).toContain('$\\notacommand{x}$')
    expect(html).not.toMatch(/katex/i)
  })
})

describe('mermaid', () => {
  it('渲染 mindmap', async () => {
    const src = '```mermaid\nmindmap\n  root((报销))\n    行程\n    金额\n```'
    const html = await renderMarkdownEnhanced(src)
    expect(html).toMatch(/svg|md-mermaid/i)
    expect(html).toContain('md-mermaid')
    expect(html).toMatch(/<svg/i)
    expect(html).toContain('报销')
    expect(html).not.toContain('md-mermaid__error')
    expect(html).not.toMatch(/\bshiki\b/)
    expect(html).not.toContain('md-code')
    expect(html).not.toMatch(/<script/i)
  })

  it('非法 mermaid 降级', async () => {
    const html = await renderMarkdownEnhanced('```mermaid\nnot_a_diagram@@@\n```')
    expect(html).toMatch(/md-mermaid__error/)
    expect(html).toContain('图表渲染失败')
    expect(html).toContain('not_a_diagram@@@')
    expect(html).not.toMatch(/\bshiki\b/)
    expect(html).not.toContain('md-code')
    expect(html).not.toMatch(/<script/i)
  })
})
