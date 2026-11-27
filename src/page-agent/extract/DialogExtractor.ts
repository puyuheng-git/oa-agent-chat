import { asDialog, isHtmlElement } from '../dom/realm'
import { isElementVisible } from '../dom/visibility'
import { ElementMapper } from '../mapper/ElementMapper'
import type { SnapshotDialog } from '../types'
import { collectInteractiveElements } from './ElementRecognizer'

const DIALOG_SELECTOR = [
  'dialog',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.modal',
  '.layui-layer',
  '.layui-layer-page',
  '.layui-layer-dialog',
  '.el-dialog',
  '.el-drawer',
  '.ant-modal',
  '[class*="drawer"]',
].join(',')

/**
 * 识别可见弹窗并提取标题、文本与内部可操作元素。
 * @param root 根节点
 * @param mapper ref 映射（与页面元素共用，保证 ref 唯一）
 * @param opts 元素上限
 */
export function extractDialogs(
  root: ParentNode,
  mapper: ElementMapper,
  opts: { maxElements: number; visibleOnly: boolean },
): SnapshotDialog[] {
  const dialogs: SnapshotDialog[] = []
  const nodes = root.querySelectorAll(DIALOG_SELECTOR)
  for (const node of Array.from(nodes)) {
    if (!isHtmlElement(node)) continue
    if (opts.visibleOnly && !isElementVisible(node)) continue
    const dialogEl = asDialog(node)
    if (dialogEl && !dialogEl.open && !isElementVisible(node)) continue

    const name = dialogTitle(node)
    const text = (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 800)
    const { elements } = collectInteractiveElements(node, mapper, {
      visibleOnly: opts.visibleOnly,
      maxElements: Math.min(40, opts.maxElements),
    })
    dialogs.push({ name, text, elements })
  }
  return dialogs
}

function dialogTitle(node: HTMLElement): string | undefined {
  const labelled = node.getAttribute('aria-label')
  if (labelled) return labelled.trim()
  const labelledBy = node.getAttribute('aria-labelledby')
  if (labelledBy) {
    const el = node.ownerDocument.getElementById(labelledBy)
    if (el) return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }
  const heading = node.querySelector('h1, h2, h3, h4, .el-dialog__title, .layui-layer-title, [class*="title"]')
  if (heading) {
    const t = (heading.textContent || '').replace(/\s+/g, ' ').trim()
    if (t) return t.slice(0, 80)
  }
  return undefined
}
