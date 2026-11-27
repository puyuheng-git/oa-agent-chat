/**
 * 快照生命周期内的 ref ↔ DOM 映射。
 * ref 不依赖 CSS Selector / XPath；页面变化后应新建实例。
 */
export class ElementMapper {
  private readonly refToEl = new Map<string, Element>()
  private readonly elToRef = new WeakMap<Element, string>()
  private seq = 0

  /** 清空映射并重置序号（新快照开始时调用）。 */
  reset(): void {
    this.refToEl.clear()
    this.seq = 0
  }

  /**
   * 为元素分配或复用当前快照内的 ref。
   * @param el DOM 元素
   */
  assign(el: Element): string {
    const existing = this.elToRef.get(el)
    if (existing) return existing
    this.seq += 1
    const ref = `e${this.seq}`
    this.elToRef.set(el, ref)
    this.refToEl.set(ref, el)
    return ref
  }

  /**
   * 通过 ref 取回 DOM；元素已脱离文档或不存在则返回 null。
   * @param ref 快照内临时 ref
   */
  resolve(ref: string): Element | null {
    const el = this.refToEl.get(ref)
    if (!el) return null
    if (!el.isConnected) {
      this.refToEl.delete(ref)
      return null
    }
    return el
  }

  /** 当前已登记的 ref 数量。 */
  size(): number {
    return this.refToEl.size
  }
}
