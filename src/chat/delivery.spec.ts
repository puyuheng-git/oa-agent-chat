import { describe, expect, it } from 'vitest'
import {
  buildDelivery,
  deliveryFromReply,
  linkifyExportFilename,
  parseExportDownloadHref,
} from './delivery'
import type { AgentTask } from './types'

describe('delivery', () => {
  it('从真实表格结果生成交付摘要', () => {
    const d = deliveryFromReply({
      type: 'markdown',
      content: '查到了',
      data: {
        kind: 'table',
        tool: 'travel.list',
        title: '行程报销列表',
        columns: [{ key: 'id', label: 'ID' }],
        items: [{ id: 1 }, { id: 2 }],
        total: 12,
      },
    })
    expect(d?.mock).toBe(false)
    expect(d?.title).toBe('行程报销列表')
    expect(d?.highlights.some((h) => h.value.includes('12'))).toBe(true)
    expect(d?.hasStructuredData).toBe(true)
  })

  it('bundle 内表格也能生成交付摘要', () => {
    const d = deliveryFromReply({
      type: 'markdown',
      content: '共查到 37 条',
      data: {
        kind: 'bundle',
        items: [
          {
            kind: 'table',
            tool: 'query_my_travel_expense_list',
            title: '行程报销查询',
            columns: [{ key: 'id', label: '单号' }],
            items: [{ id: 1 }],
            total: 37,
          },
        ],
      },
    })
    expect(d?.title).toBe('行程报销查询')
    expect(d?.highlights.some((h) => h.value.includes('37'))).toBe(true)
    expect(d?.hasStructuredData).toBe(true)
  })

  it('无结构化数据时可用 Mock 任务生成演示摘要', () => {
    const task: AgentTask = {
      id: 't1',
      name: '演示',
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      elapsedMs: 1000,
      steps: [
        { id: 'a', title: '理解需求', status: 'completed' },
        { id: 'b', title: '制定计划', status: 'completed' },
      ],
      tools: [{ id: '1', name: 'x', status: 'succeeded', durationMs: 10 }],
      artifacts: [
        {
          id: 'f1',
          name: '清单.xlsx',
          kind: 'xlsx',
          sizeLabel: '1 KB',
          status: 'ready',
          previewable: false,
        },
      ],
      approvals: [],
      mock: true,
    }
    const d = buildDelivery({ type: 'text', content: 'ok', data: null }, task)
    expect(d?.mock).toBe(true)
    expect(d?.artifacts?.length).toBe(1)
  })

  it('文件结果带上可下载的 Excel 票据', () => {
    const d = deliveryFromReply({
      type: 'markdown',
      content: '已生成文件',
      data: {
        kind: 'file',
        tool: 'builtin.export',
        title: '导出.xlsx',
        filename: '导出.xlsx',
        ticket: 'ticket-1',
        size_bytes: 2048,
      },
    })
    expect(d?.artifacts?.[0]?.exportTicket).toBe('ticket-1')
    expect(d?.artifacts?.[0]?.kind).toBe('xlsx')
    expect(d?.artifacts?.[0]?.name).toBe('导出.xlsx')
  })

  it('回答中的加粗文件名改成可下载链接', () => {
    const linked = linkifyExportFilename(
      '已生成文件 **报销明细.xlsx**，可下载。',
      '报销明细.xlsx',
      'ticket-abc',
    )
    expect(linked).toContain('[报销明细.xlsx](#ds-export:ticket-abc)')
    expect(linked).not.toContain('**报销明细.xlsx**')
    expect(parseExportDownloadHref('#ds-export:ticket-abc')).toEqual({ ticket: 'ticket-abc' })
    expect(parseExportDownloadHref('https://example.com')).toBeNull()
  })

  it('无票据或无文件名时不改写正文', () => {
    expect(linkifyExportFilename('已生成文件 **a.xlsx**，可下载。', 'a.xlsx', '')).toBe(
      '已生成文件 **a.xlsx**，可下载。',
    )
    expect(linkifyExportFilename('ok', '', 't1')).toBe('ok')
  })
})
