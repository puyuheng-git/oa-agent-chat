import type { PageInfo } from '../types'

/**
 * 采集页面基础信息。
 * @param doc 文档对象，默认当前 document
 */
export function capturePageInfo(doc: Document = document): PageInfo {
  const title = (doc.title || '').trim()
  let url = ''
  try {
    url = doc.defaultView?.location?.href || doc.URL || ''
  } catch {
    url = doc.URL || ''
  }
  return {
    title,
    url,
    capturedAt: new Date().toISOString(),
  }
}
