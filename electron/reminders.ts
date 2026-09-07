import { BrowserWindow, Notification } from 'electron'
import { Repository } from './database/repository'

export class ReminderScheduler {
  private taskTimer?: NodeJS.Timeout
  private flowTimer?: NodeJS.Timeout
  constructor(private readonly repository: Repository, private readonly showMainWindow: (taskId?: string) => void, private readonly showFlow: () => void) {}
  start(): void { this.repository.tasks.purgeDeleted(); this.reschedule() }
  reschedule(): void {
    this.disposeTimers()
    for (const item of this.repository.tasks.dueReminders()) this.notify(item.task.id, item.task.title)
    const next = this.repository.tasks.nextReminder()
    if (next) {
      const delay = Math.min(Math.max(next.remindAt.getTime() - Date.now(), 0), 2_147_000_000)
      this.taskTimer = setTimeout(() => { this.notify(next.task.id, next.task.title); this.reschedule() }, delay)
    }
    const flow = this.repository.flow.nextFlowReviewReminder()
    if (flow) {
      const delay = Math.min(Math.max(flow.remindAt.getTime() - Date.now(), 0), 2_147_000_000)
      this.flowTimer = setTimeout(() => { this.notifyFlow(flow.date); this.reschedule() }, delay)
    }
  }
  private notify(taskId: string, title: string): void {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title: 'Rumo-Flow 提醒', body: title, silent: false })
    notification.on('click', () => this.showMainWindow(taskId))
    notification.show()
    this.repository.tasks.markReminderNotified(taskId)
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('desktop:tasks-changed')
  }
  private notifyFlow(date: string): void {
    if (!Notification.isSupported() || !this.repository.flow.claimFlowReviewReminder(date)) return
    const notification = new Notification({ title: 'Rumo-Flow · 心流', body: '让今天慢下来，留几分钟完成每日复盘。', silent: false })
    notification.on('click', this.showFlow)
    notification.show()
  }
  private disposeTimers(): void { if (this.taskTimer) clearTimeout(this.taskTimer); if (this.flowTimer) clearTimeout(this.flowTimer); this.taskTimer = undefined; this.flowTimer = undefined }
  dispose(): void { this.disposeTimers() }
}
