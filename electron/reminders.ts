import { BrowserWindow, Notification } from 'electron'
import { Repository } from './database/repository'

export class ReminderScheduler {
  private timer?: NodeJS.Timeout
  constructor(private readonly repository: Repository, private readonly showMainWindow: (taskId?: string) => void) {}
  start(): void { this.repository.purgeDeleted(); this.reschedule() }
  reschedule(): void {
    this.disposeTimer()
    for (const item of this.repository.dueReminders()) this.notify(item.task.id, item.task.title)
    const next = this.repository.nextReminder()
    if (!next) return
    const delay = Math.min(Math.max(next.remindAt.getTime() - Date.now(), 0), 2_147_000_000)
    this.timer = setTimeout(() => { this.notify(next.task.id, next.task.title); this.reschedule() }, delay)
  }
  private notify(taskId: string, title: string): void {
    this.repository.markReminderNotified(taskId)
    if (Notification.isSupported()) { const notification = new Notification({ title: 'Rumo-Flow 提醒', body: title, silent: false }); notification.on('click', () => this.showMainWindow(taskId)); notification.show() }
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('desktop:tasks-changed')
  }
  private disposeTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined }
  dispose(): void { this.disposeTimer() }
}
