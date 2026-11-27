import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElementMapper } from '../mapper/ElementMapper'
import { SENSITIVE_VALUE_MASK } from '../types'
import { buildPageSnapshot } from './SnapshotBuilder'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.style.display === 'none' || this.hasAttribute('hidden')) {
      return { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON() {} }
    }
    return { width: 40, height: 20, top: 0, left: 0, bottom: 20, right: 40, x: 0, y: 0, toJSON() {} }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.title = ''
})

describe('buildPageSnapshot', () => {
  it('采集页面基础信息与常见控件', () => {
    document.title = '测试页'
    document.body.innerHTML = `
      <h1>标题</h1>
      <button type="button">保存</button>
      <input type="text" placeholder="姓名" value="张三" />
      <textarea>备注</textarea>
      <select><option value="a">甲</option><option value="b" selected>乙</option></select>
      <label><input type="checkbox" checked />同意</label>
      <label><input type="radio" name="g" checked />选项1</label>
      <input type="password" value="secret" name="password" />
      <button type="button" style="display:none">隐藏</button>
      <button type="button" disabled>禁用</button>
    `
    const { snapshot, mapper } = buildPageSnapshot(document)
    expect(snapshot.page.title).toBe('测试页')
    expect(snapshot.page.url).toBeTruthy()
    expect(snapshot.content.text).toContain('标题')

    const byName = (n: string) => snapshot.elements.find((e) => e.name.includes(n))
    expect(byName('保存')?.role).toBe('button')
    expect(byName('姓名')?.tag).toBe('input')
    expect(byName('备注') || snapshot.elements.find((e) => e.tag === 'textarea')).toBeTruthy()
    expect(snapshot.elements.some((e) => e.tag === 'select')).toBe(true)
    expect(snapshot.elements.some((e) => e.role === 'checkbox' && e.checked)).toBe(true)
    expect(snapshot.elements.some((e) => e.role === 'radio' && e.checked)).toBe(true)

    const pwd = snapshot.elements.find((e) => e.type === 'password')
    expect(pwd?.value).toBe(SENSITIVE_VALUE_MASK)

    expect(snapshot.elements.some((e) => e.name === '隐藏')).toBe(false)
    const disabled = snapshot.elements.find((e) => e.name === '禁用')
    expect(disabled?.enabled).toBe(false)

    const ref = byName('保存')!.ref
    expect(mapper.resolve(ref)?.tagName.toLowerCase()).toBe('button')
  })

  it('识别表格与弹窗', () => {
    document.body.innerHTML = `
      <table aria-label="员工表">
        <thead><tr><th>姓名</th><th>操作</th></tr></thead>
        <tbody>
          <tr><td>李四</td><td><button type="button">编辑</button></td></tr>
        </tbody>
      </table>
      <div role="dialog" aria-label="确认" style="display:block;width:100px;height:100px">
        <p>是否删除？</p>
        <button type="button">确定</button>
      </div>
    `
    const { snapshot } = buildPageSnapshot(document)
    expect(snapshot.tables.length).toBeGreaterThanOrEqual(1)
    expect(snapshot.tables[0].headers).toContain('姓名')
    expect(snapshot.tables[0].rows[0][0]).toContain('李四')
    expect(snapshot.tables[0].rowActions?.length).toBeGreaterThan(0)

    expect(snapshot.dialogs.length).toBeGreaterThanOrEqual(1)
    expect(snapshot.dialogs[0].name).toContain('确认')
    expect(snapshot.dialogs[0].elements.some((e) => e.name.includes('确定'))).toBe(true)
  })

  it('ref 仅当前 mapper 生命周期有效', () => {
    document.body.innerHTML = `<button type="button">A</button>`
    const mapper = new ElementMapper()
    const first = buildPageSnapshot(document, {}, mapper)
    const ref = first.snapshot.elements[0].ref
    expect(mapper.resolve(ref)).toBeTruthy()
    mapper.reset()
    expect(mapper.resolve(ref)).toBeNull()
  })

  it('从 OA 外壳选中 iframe 采集业务表数据', () => {
    document.body.innerHTML = `
      <div id="taskbar"><div id="tabs_container"></div></div>
      <div id="funcbar"></div>
      <div id="center">
        <div class="tabs-panel selected">
          <iframe id="tabs_biz_iframe"></iframe>
        </div>
      </div>
    `
    const iframe = document.getElementById('tabs_biz_iframe') as HTMLIFrameElement
    const doc = iframe.contentDocument!
    doc.title = '函证列表'
    doc.body!.innerHTML = `
      <div class="layui-table-view">
        <div class="layui-table-header"><table><thead><tr><th>快递单号</th><th>操作</th></tr></thead></table></div>
        <div class="layui-table-body"><table><tbody>
          <tr><td>SF123</td><td><button type="button" class="layui-btn layui-btn-xs">详情</button></td></tr>
        </tbody></table></div>
      </div>
    `

    const { snapshot } = buildPageSnapshot(document)
    expect(snapshot.page.contentSource).toContain('tabs-panel.selected')
    expect(snapshot.page.title).toContain('函证列表')
    expect(snapshot.tables.length).toBeGreaterThanOrEqual(1)
    expect(snapshot.tables[0].headers.join(',')).toContain('快递单号')
    expect(snapshot.tables[0].rows[0]?.[0]).toContain('SF123')
    expect(snapshot.meta.contentDocCount).toBeGreaterThanOrEqual(1)
  })

  it('合并通达 jqGrid 表头与表体行', () => {
    document.body.innerHTML = `
      <div class="ui-jqgrid" id="gbox_list">
        <div class="ui-jqgrid-hbox">
          <table class="ui-jqgrid-htable"><thead><tr>
            <th>流水号</th><th>工作名称</th><th>操作</th>
          </tr></thead></table>
        </div>
        <table class="ui-jqgrid-btable"><tbody>
          <tr><td></td><td></td><td></td></tr>
          <tr>
            <td>1640525</td>
            <td>派工-浅潜城市</td>
            <td><a href="#">主办</a></td>
          </tr>
        </tbody></table>
        <div class="ui-jqgrid-pager"><table class="ui-pg-table"><tr><td>共 1 页</td></tr></table></div>
      </div>
    `
    const { snapshot } = buildPageSnapshot(document)
    const grid = snapshot.tables.find((t) => t.headers.includes('流水号'))
    expect(grid).toBeTruthy()
    expect(grid!.rows.some((r) => r[0] === '1640525')).toBe(true)
    expect(grid!.rows.some((r) => r.join('').includes('派工'))).toBe(true)
    expect(grid!.pagination || '').toContain('共')
  })
})
