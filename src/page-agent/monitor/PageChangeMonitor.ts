/**
 * 监听 DOM 变化并标记快照 dirty；不在每次变化时触发 AI 请求。
 */
export class PageChangeMonitor {
  private observer: MutationObserver | null = null
  private dirty = false
  private readonly target: Node

  /**
   * @param target 观察根，默认 document.documentElement
   */
  constructor(target?: Node) {
    this.target = target || document.documentElement
  }

  /** 开始监听。 */
  start(): void {
    if (this.observer) return
    this.observer = new MutationObserver(() => {
      this.dirty = true
    })
    this.observer.observe(this.target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
  }

  /** 停止监听。 */
  stop(): void {
    this.observer?.disconnect()
    this.observer = null
  }

  /** 当前是否相对上次 clear 后发生过变化。 */
  isDirty(): boolean {
    return this.dirty
  }

  /** 构建新快照后清除 dirty。 */
  clearDirty(): void {
    this.dirty = false
  }
}
