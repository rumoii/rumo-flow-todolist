import type { TaskRepository } from './tasks'
import type { TaskBatchAction } from '../../src/shared/contracts'
import { getDatabase } from './db'
import { removeTasks, recoverTasks, purgeTasks } from './task-trash'
import { validPlan } from '../../src/shared/planning'
import { validCalendarDate } from './common'

export class TaskCommands {
  constructor(private readonly tasks: TaskRepository) {}
  batch(ids: string[], action: TaskBatchAction): void {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !id)) throw new Error('请选择 1 至 500 个任务')
    if (!action || !['plan','deadline','move','tags','complete','remove','recover','purge'].includes(action.kind)) throw new Error('批量操作无效')
    if (action.kind === 'plan' && !validPlan(action.plan)) throw new Error('任务安排无效')
    if (action.kind === 'deadline' && action.date !== null && !validCalendarDate(action.date)) throw new Error('截止日期无效')
    if (action.kind === 'move' && action.listId !== null && (typeof action.listId !== 'string' || !getDatabase().prepare('SELECT 1 FROM task_lists WHERE id=?').get(action.listId))) throw new Error('目标清单不存在')
    getDatabase().transaction(() => {
      const unique = [...new Set(ids)]
      const selected = unique.map(id => this.tasks.getTask(id))
      const trash = action.kind === 'recover' || action.kind === 'purge'
      if (selected.some(task => Boolean(task.deletedAt) !== trash)) throw new Error('任务状态已变化，请刷新后重试')
      if (action.kind === 'remove') { removeTasks(unique); return }
      if (action.kind === 'recover') { recoverTasks(unique); return }
      if (action.kind === 'purge') { purgeTasks(unique); return }
      for (const task of selected) {
        if (action.kind === 'complete') this.tasks.completeTask(task.id)
        else if (action.kind === 'plan') this.tasks.updateTask(task.id, { plan: action.plan, focusDate: null })
        else if (action.kind === 'deadline') this.tasks.updateTask(task.id, { dueDate: action.date, ...(action.date === null ? { dueTime: null, reminderMinutesBefore: null } : {}) })
        else if (action.kind === 'move') this.tasks.updateTask(task.id, { listId: action.listId })
        else if (action.kind === 'tags') {
          if (!Array.isArray(action.tagIds)) throw new Error('标签选择无效')
          this.tasks.updateTask(task.id, { tagIds: [...new Set([...task.tags.map(tag => tag.id), ...action.tagIds])] })
        }
      }
    })()
  }
}
