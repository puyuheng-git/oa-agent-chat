import { isContainerPresent, isElementVisible } from '../dom/visibility'
import { ElementMapper } from '../mapper/ElementMapper'
import type { SnapshotTable, TableRowAction } from '../types'
import { isInteractiveCandidate } from './ElementRecognizer'

/**
 * 提取页面表格：
 * - Layui `table.init` / `table.render` 产生的 `.layui-table-view`（表头/表体分离）
 * - 通达 OA jqGrid：`.ui-jqgrid`（htable 表头 + btable 表体分离）
 * - 原生 / `.layui-table` 静态表
 * - role=table
 * @param root 根节点
 * @param mapper 用于行内按钮 ref
 * @param opts 行/列上限与可见性
 */
export function extractTables(
  root: ParentNode,
  mapper: ElementMapper,
  opts: { maxRows: number; maxCols: number; visibleOnly: boolean },
): SnapshotTable[] {
  const tables: SnapshotTable[] = []
  const consumed = new WeakSet<Element>()

  // 1) Layui 动态视图（东审列表页主流）
  const views = root.querySelectorAll('.layui-table-view')
  for (const view of Array.from(views)) {
    // 表格容器用宽松可见性，避免 iframe 内零尺寸误杀
    if (opts.visibleOnly && !isContainerPresent(view)) continue
    tables.push(parseLayuiTableView(view, mapper, opts))
    for (const t of Array.from(view.querySelectorAll('table'))) consumed.add(t)
  }

  // 2) 通达 OA / jqGrid：表头 htable、表体 btable 拆开，合并成一张逻辑表
  const jqgrids = root.querySelectorAll('.ui-jqgrid')
  for (const grid of Array.from(jqgrids)) {
    if (opts.visibleOnly && !isContainerPresent(grid)) continue
    tables.push(parseJqGrid(grid, mapper, opts))
    for (const t of Array.from(grid.querySelectorAll('table'))) consumed.add(t)
  }

  // 3) 原生 / 静态 layui-table（未被 view / jqGrid 包住的）
  const native = root.querySelectorAll('table')
  for (const table of Array.from(native)) {
    if (consumed.has(table)) continue
    // 跳过仅作内部结构的空壳
    if (table.closest('.layui-table-view')) continue
    if (table.closest('.ui-jqgrid')) continue
    // 通达噪声：分页、列选择器、消息框、顶部筛选 TableList
    if (table.classList.contains('ui-pg-table')) continue
    if (table.classList.contains('MessageBox')) continue
    if (table.classList.contains('TableList')) continue
    if (table.closest('.nDiv')) continue
    if (opts.visibleOnly && !isContainerPresent(table)) continue
    const parsed = parseHtmlTable(table as HTMLTableElement, mapper, opts)
    // 无表头且无有效单元格的空表跳过
    if (!parsed.headers.some((h) => h) && !parsed.rows.some((r) => r.some((c) => c))) continue
    tables.push(parsed)
  }

  // 4) role=table
  const roleTables = root.querySelectorAll('[role="table"]')
  for (const node of Array.from(roleTables)) {
    if (node.tagName.toLowerCase() === 'table') continue
    if (opts.visibleOnly && !isElementVisible(node)) continue
    tables.push(parseRoleTable(node, mapper, opts))
  }

  return tables
}

/**
 * 解析 jqGrid：`.ui-jqgrid-htable` 取表头，`.ui-jqgrid-btable` 取数据行。
 */
function parseJqGrid(
  grid: Element,
  mapper: ElementMapper,
  opts: { maxRows: number; maxCols: number },
): SnapshotTable {
  const headerTable = grid.querySelector('table.ui-jqgrid-htable') as HTMLTableElement | null
  const bodyTable = grid.querySelector('table.ui-jqgrid-btable') as HTMLTableElement | null
  const gridId = grid.getAttribute('id') || undefined

  const headers: string[] = []
  if (headerTable) {
    const ths = headerTable.querySelectorAll('th')
    for (const th of Array.from(ths)) {
      if (headers.length >= opts.maxCols) break
      // jqGrid 常有隐藏列 / cb 列，仍保留文本便于对齐
      headers.push(cellText(th))
    }
  }

  const rows: string[][] = []
  const rowActions: TableRowAction[] = []
  if (bodyTable) {
    const trs = bodyTable.querySelectorAll('tbody > tr, tr')
    let rowIndex = 0
    for (const tr of Array.from(trs)) {
      if (rowIndex >= opts.maxRows) break
      // jqGrid 首行常为空占位，跳过无单元格文本的行
      const cells = Array.from(tr.querySelectorAll('td')).slice(0, opts.maxCols)
      if (!cells.length) continue
      const values = cells.map((c) => cellText(c))
      if (!values.some((v) => v)) continue
      rows.push(values)
      const refs: string[] = []
      for (const cell of cells) {
        for (const child of Array.from(cell.querySelectorAll('*'))) {
          if (!isInteractiveCandidate(child)) continue
          if (!isElementVisible(child)) continue
          refs.push(mapper.assign(child))
        }
      }
      if (refs.length) rowActions.push({ row: rowIndex, refs })
      rowIndex += 1
    }
  }

  const pagination =
    findNearbyPagination(grid) ||
    textOf(grid.parentElement?.querySelector('.ui-jqgrid-pager, .ui-pager-control, .ui-pg-table'))

  const out: SnapshotTable = { headers, rows }
  if (gridId) out.name = String(gridId).slice(0, 80)
  if (rowActions.length) out.rowActions = rowActions
  if (pagination) out.pagination = pagination
  return out
}

/**
 * 解析 Layui table-view：表头在 `.layui-table-header`，数据在 `.layui-table-body` / `.layui-table-main`。
 */
function parseLayuiTableView(
  view: Element,
  mapper: ElementMapper,
  opts: { maxRows: number; maxCols: number },
): SnapshotTable {
  const name =
    view.getAttribute('lay-id') ||
    view.getAttribute('aria-label') ||
    view.querySelector('.layui-table-tool .layui-table-tool-temp')?.textContent?.replace(/\s+/g, ' ').trim() ||
    undefined

  const headers: string[] = []
  const headerTable = view.querySelector('.layui-table-header table') || view.querySelector('thead')?.closest('table')
  const headerCells = headerTable
    ? headerTable.querySelectorAll('thead th, thead td, tr th')
    : view.querySelectorAll('.layui-table-header th, .layui-table-header td')
  for (const cell of Array.from(headerCells).slice(0, opts.maxCols)) {
    const t = cellText(cell)
    // layui 常把复选框列放在首列，保留空表头占位用「选择」
    headers.push(t || (cell.querySelector('input[type="checkbox"]') ? '选择' : ''))
  }

  const bodyTable =
    view.querySelector('.layui-table-body table') ||
    view.querySelector('.layui-table-main table') ||
    view.querySelector('.layui-table-box .layui-table-body table')

  const rows: string[][] = []
  const rowActions: TableRowAction[] = []
  const rowList = bodyTable ? Array.from(bodyTable.querySelectorAll('tbody tr')) : []

  let rowIndex = 0
  for (const tr of rowList) {
    if (rowIndex >= opts.maxRows) break
    // 跳过空数据提示行
    if (tr.querySelector('.layui-none')) continue
    const cells = Array.from(tr.querySelectorAll('td')).slice(0, opts.maxCols)
    if (!cells.length) continue
    rows.push(cells.map((c) => cellText(c)))
    const refs: string[] = []
    for (const cell of cells) {
      for (const child of Array.from(cell.querySelectorAll('*'))) {
        if (!isInteractiveCandidate(child)) continue
        if (!isElementVisible(child)) continue
        refs.push(mapper.assign(child))
      }
    }
    if (refs.length) rowActions.push({ row: rowIndex, refs })
    rowIndex += 1
  }

  const pagination =
    findNearbyPagination(view) ||
    textOf(view.parentElement?.querySelector('.layui-table-page, .layui-laypage, .page'))

  const out: SnapshotTable = { headers, rows }
  if (name) out.name = String(name).slice(0, 80)
  if (rowActions.length) out.rowActions = rowActions
  if (pagination) out.pagination = pagination
  return out
}

function parseHtmlTable(
  table: HTMLTableElement,
  mapper: ElementMapper,
  opts: { maxRows: number; maxCols: number },
): SnapshotTable {
  const name = table.getAttribute('aria-label') || table.getAttribute('summary') || table.getAttribute('lay-filter') || undefined
  const headers: string[] = []
  const headerCells = table.querySelectorAll('thead th, thead td')
  if (headerCells.length) {
    for (const cell of Array.from(headerCells).slice(0, opts.maxCols)) {
      const t = cellText(cell)
      // 静态 layui 表头可能写在 lay-data 的 title 里
      const layTitle = parseLayDataTitle(cell)
      headers.push(t || layTitle || '')
    }
  } else {
    const firstRow = table.querySelector('tr')
    if (firstRow) {
      for (const cell of Array.from(firstRow.querySelectorAll('th, td')).slice(0, opts.maxCols)) {
        headers.push(cellText(cell) || parseLayDataTitle(cell) || '')
      }
    }
  }

  const rows: string[][] = []
  const rowActions: TableRowAction[] = []
  const bodyRows = table.querySelectorAll('tbody tr')
  const rowList = bodyRows.length
    ? Array.from(bodyRows)
    : Array.from(table.querySelectorAll('tr')).slice(headers.length ? 1 : 0)

  let rowIndex = 0
  for (const tr of rowList) {
    if (rowIndex >= opts.maxRows) break
    const cells = Array.from(tr.querySelectorAll('th, td')).slice(0, opts.maxCols)
    if (!cells.length) continue
    rows.push(cells.map((c) => cellText(c)))
    const refs: string[] = []
    for (const cell of cells) {
      for (const child of Array.from(cell.querySelectorAll('*'))) {
        if (!isInteractiveCandidate(child)) continue
        if (!isElementVisible(child)) continue
        refs.push(mapper.assign(child))
      }
    }
    if (refs.length) rowActions.push({ row: rowIndex, refs })
    rowIndex += 1
  }

  const pagination = findNearbyPagination(table)
  const out: SnapshotTable = { headers, rows }
  if (name) out.name = name
  if (rowActions.length) out.rowActions = rowActions
  if (pagination) out.pagination = pagination
  return out
}

function parseRoleTable(
  node: Element,
  mapper: ElementMapper,
  opts: { maxRows: number; maxCols: number },
): SnapshotTable {
  const name = node.getAttribute('aria-label') || undefined
  const headers: string[] = []
  const headerCells = node.querySelectorAll('[role="columnheader"]')
  for (const cell of Array.from(headerCells).slice(0, opts.maxCols)) {
    headers.push(cellText(cell))
  }
  const rows: string[][] = []
  const rowActions: TableRowAction[] = []
  const rowNodes = node.querySelectorAll('[role="row"]')
  let rowIndex = 0
  for (const row of Array.from(rowNodes)) {
    if (row.querySelector('[role="columnheader"]') && !row.querySelector('[role="cell"], [role="gridcell"]')) continue
    if (rowIndex >= opts.maxRows) break
    const cells = Array.from(row.querySelectorAll('[role="cell"], [role="gridcell"]')).slice(0, opts.maxCols)
    if (!cells.length) continue
    rows.push(cells.map((c) => cellText(c)))
    const refs: string[] = []
    for (const cell of cells) {
      for (const child of Array.from(cell.querySelectorAll('*'))) {
        if (!isInteractiveCandidate(child)) continue
        if (!isElementVisible(child)) continue
        refs.push(mapper.assign(child))
      }
    }
    if (refs.length) rowActions.push({ row: rowIndex, refs })
    rowIndex += 1
  }
  const out: SnapshotTable = { headers, rows }
  if (name) out.name = name
  if (rowActions.length) out.rowActions = rowActions
  return out
}

function parseLayDataTitle(cell: Element): string {
  const raw = cell.getAttribute('lay-data')
  if (!raw) return ''
  const m = raw.match(/title\s*:\s*['"]([^'"]+)['"]/)
  return m ? m[1] : ''
}

function cellText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function textOf(el: Element | null | undefined): string | undefined {
  if (!el) return undefined
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 120) : undefined
}

function findNearbyPagination(table: Element): string | undefined {
  const parent = table.parentElement
  if (!parent) return undefined
  const candidates = parent.querySelectorAll(
    '.pagination, .layui-laypage, .layui-table-page, .el-pagination, .page, [class*="page"]',
  )
  for (const c of Array.from(candidates)) {
    if (!isElementVisible(c)) continue
    const t = (c.textContent || '').replace(/\s+/g, ' ').trim()
    if (t) return t.slice(0, 120)
  }
  return undefined
}
