import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import markdownItContainer from 'markdown-it-container'

/** 默认导入在 vue-tsc 下只是构造函数，实例类型要单独取。 */
export type MarkdownItInstance = InstanceType<typeof MarkdownIt>

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** info 形如 "details 说明"。没写标题时用「详情」。 */
function detailsTitle(info: string): string {
  const text = String(info || '').trim()
  const title = text.replace(/^details\b\s*/, '').trim()
  return title || '详情'
}

function renderDetails(tokens: any[], idx: number): string {
  if (tokens[idx].nesting === 1) {
    const title = escapeHtml(detailsTitle(tokens[idx].info))
    return `<details class="md-container md-container--details" data-kind="details"><summary>${title}</summary><div class="md-container__body">\n`
  }
  return `</div></details>\n`
}

function addContainers(md: MarkdownItInstance) {
  const names = ['tip', 'info', 'warning', 'danger', 'details']
  names.forEach((name) => {
    md.use(markdownItContainer, name, {
      render(tokens: any[], idx: number) {
        // details 用原生折叠，标题留在 summary；其余容器仍是静态 div
        if (name === 'details') return renderDetails(tokens, idx)
        if (tokens[idx].nesting === 1) {
          return `<div class="md-container md-container--${name}" data-kind="${name}"><div class="md-container__body">\n`
        }
        return `</div></div>\n`
      },
    })
  })
}

function hardenLinks(md: MarkdownItInstance) {
  // javascript: 默认不会生成 link token，原文会留在 HTML 里；先放行，再在 link_open 改成 #
  const defaultValidateLink = md.validateLink.bind(md)
  md.validateLink = function (url: string) {
    if (/^\s*javascript:/i.test(url)) return true
    return defaultValidateLink(url)
  }

  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    function (tokens: any[], idx: number, options: any, _env: any, self: any) {
      return self.renderToken(tokens, idx, options)
    }

  md.renderer.rules.link_open = function (tokens: any[], idx: number, options: any, env: any, self: any) {
    const token = tokens[idx]
    const href = String(token.attrGet('href') || '')
    if (/^\s*javascript:/i.test(href)) {
      token.attrSet('href', '#')
    } else if (/^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }
}

/** 同步实例不挂公式。KaTeX 只在增强阶段用另一份实例。 */
export function createMarkdownIt(installMath?: (md: MarkdownItInstance) => void): MarkdownItInstance {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
  md.use(taskLists, { enabled: true, label: true })
  md.use(footnote)
  md.use(deflist)
  if (installMath) installMath(md)
  addContainers(md)
  hardenLinks(md)
  return md
}

const md = createMarkdownIt()

export function parseMarkdown(src: string): string {
  return md.render(src)
}
