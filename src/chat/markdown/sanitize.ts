import DOMPurify from 'dompurify'
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // svg 是安全子集：不含 script / foreignObject / use。滤镜留给 Mermaid 的阴影。
    USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
    // semantics/annotation 不在 mathMl 默认名单里，放行后公式源码留在 annotation 里
    ADD_TAGS: ['semantics', 'annotation'],
    // class / style 留给 Shiki、KaTeX 与 Mermaid；aria-hidden 是 katex-html
    ADD_ATTR: ['target', 'rel', 'class', 'style', 'data-kind', 'data-lang', 'aria-hidden'],
  })
}
