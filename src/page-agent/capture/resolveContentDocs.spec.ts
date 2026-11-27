import { afterEach, describe, expect, it } from 'vitest'
import { resolveOaContentDocuments } from './resolveContentDocs'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('resolveOaContentDocuments', () => {
  it('优先解析通达 2010 选中标签页 iframe', () => {
    document.body.innerHTML = `
      <div id="taskbar"><div id="tabs_container"></div></div>
      <div id="center">
        <div class="tabs-panel" style="display:none">
          <iframe id="tabs_1_iframe"></iframe>
        </div>
        <div class="tabs-panel selected">
          <iframe id="tabs_2_iframe"></iframe>
        </div>
      </div>
    `
    const iframe = document.getElementById('tabs_2_iframe') as HTMLIFrameElement
    const childDoc = iframe.contentDocument!
    childDoc.open()
    childDoc.write(
      '<html><head><title>业务页</title></head><body><table><tr><td>数据</td></tr></table><a href="#">链接</a></body></html>',
    )
    childDoc.close()

    const refs = resolveOaContentDocuments(window)
    expect(refs.length).toBeGreaterThanOrEqual(1)
    expect(refs[0].source).toContain('tabs-panel.selected')
    expect(refs[0].doc.body?.textContent).toContain('数据')
  })

  it('下钻业务 iframe 内的 frameset（工作流 menu_main）', () => {
    document.body.innerHTML = `
      <div id="taskbar"><div id="tabs_container"></div></div>
      <div id="funcbar"></div>
      <div id="center">
        <div class="tabs-panel selected">
          <iframe id="tabs_5_iframe"></iframe>
        </div>
      </div>
    `
    const outer = document.getElementById('tabs_5_iframe') as HTMLIFrameElement
    const outerDoc = outer.contentDocument!
    // jsdom 对 frameset 支持有限：用嵌套 iframe 模拟 menu_main
    outerDoc.open()
    outerDoc.write(`
      <html><head><title>工作流</title></head><body>
        <iframe name="menu_top" id="menu_top"></iframe>
        <iframe name="menu_main" id="menu_main"></iframe>
      </body></html>
    `)
    outerDoc.close()

    const topFrame = outerDoc.getElementById('menu_top') as HTMLIFrameElement
    topFrame.contentDocument!.body.innerHTML = '<a href="#">未接收</a><a href="#">办理中</a>'

    const mainFrame = outerDoc.getElementById('menu_main') as HTMLIFrameElement
    mainFrame.contentDocument!.title = '我的工作'
    mainFrame.contentDocument!.body.innerHTML = `
      <table class="layui-table"><thead><tr><th>流水号</th><th>工作名称</th></tr></thead>
      <tbody><tr><td>1640525</td><td>派工-测试</td></tr></tbody></table>
      <button type="button">办理</button>
    `

    const refs = resolveOaContentDocuments(window)
    expect(refs.some((r) => r.source.includes('menu_main'))).toBe(true)
    const main = refs.find((r) => r.source.includes('menu_main'))!
    expect(main.doc.body?.textContent).toContain('1640525')
    expect((main.score || 0)).toBeGreaterThan(0)
  })
})
