import { BrowserWindow, ipcMain } from 'electron'
import crypto from 'node:crypto'
import type { LifecycleReason, LifecycleResume, TaskSynchronization } from '../src/shared/contracts'
export class WindowBarrier {
  private busy = false
  get running(): boolean { return this.busy; }
  locked = false
  private pending = new Map<string, {
    sender: number
    resolve: () => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }>()
  constructor() {
    ipcMain.on('lifecycle:ack', (event, response: {
      id: string
      error?: string
    }) => {
      const pending = this.pending.get(response?.id)
      if (!pending || event.sender.id !== pending.sender)
        return
      clearTimeout(pending.timer)
      this.pending.delete(response.id)
      if (response.error)
        pending.reject(new Error(response.error))
      else
        pending.resolve()
    })
  }
  release(): void {
    this.locked = false
    this.busy = false
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        try { window.webContents.send('lifecycle:resume', { replaced: false }) }
        catch (error) { console.error('窗口恢复通知失败', error) }
      }
    }
  }
  async run<Result>(reason: LifecycleReason, action: () => Promise<Result> | Result, synchronization?: { taskIds?: string[]; read?: () => TaskSynchronization[]; hold?: boolean }): Promise<Result> {
    if (this.busy)
      throw new Error('正在保留草稿或恢复数据，请稍后重试')
    this.busy = true
    let replaced = false
    let succeeded = false
    try {
      const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed())
      await Promise.all(windows.map(window => new Promise<void>((resolve, reject) => {
        const id = crypto.randomUUID()
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('窗口未能确认草稿已保留，请重试')); }, 10000)
        this.pending.set(id, { sender: window.webContents.id, resolve, reject, timer })
        window.webContents.send('lifecycle:prepare', { id, reason, ...(synchronization?.taskIds ? { taskIds: synchronization.taskIds } : {}) })
      })))
      this.locked = true
      const result = await action()
      replaced = reason === 'import'
      succeeded = true
      return result
    }
    finally {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('操作已结束'))
      }
      this.pending.clear()
      this.locked = Boolean(succeeded && synchronization?.hold)
      this.busy = this.locked
      const synchronizedTasks = succeeded ? synchronization?.read?.() : undefined
      const resume: LifecycleResume = { replaced, ...(synchronizedTasks ? { synchronizedTasks } : {}) }
      for (const window of BrowserWindow.getAllWindows()) {
        if (!this.locked && !window.isDestroyed()) {
          try { window.webContents.send('lifecycle:resume', resume) }
          catch (error) { console.error('窗口恢复通知失败', error) }
        }
      }
    }
  }
}
