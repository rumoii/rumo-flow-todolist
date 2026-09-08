import type { TaskRepository } from './tasks'
import type { ArrangeTaskInput, BatchTaskInput, Task, TaskPlan } from '../../src/shared/contracts'
import { getDatabase } from './db'
import { removeTasks, recoverTasks, purgeTasks } from './task-trash'
import { localDay, planFor, shiftDay, validPlan } from '../../src/shared/planning'
import { validCalendarDate } from './common'

export class TaskCommands {
  constructor(private readonly tasks: TaskRepository) {}
  arrange(input: ArrangeTaskInput): Task {
    if (!input || typeof input.taskId !== 'string' || !input.taskId || typeof input.updatedAt !== 'string' || typeof input.generation !== 'string') throw new Error('任务安排参数无效')
    const action = input.action
    if (!action || !['plan', 'focus'].includes(action.kind)) throw new Error('任务安排操作无效')
    const today = localDay()
    let plan: TaskPlan | null = null
    if (action.kind === 'focus') {
      if (typeof action.enabled !== 'boolean') throw new Error('重点状态无效')
    } else if (action.target !== null) {
      if (typeof action.target === 'string') {
        if (!['today', 'tomorrow', 'week', 'month'].includes(action.target)) throw new Error('任务安排目标无效')
        plan = action.target === 'today' || action.target === 'tomorrow' ? planFor('day', action.target === 'today' ? today : shiftDay(today, 1)) : planFor(action.target, today)
      } else {
        if (!action.target || !['day', 'week', 'month'].includes(action.target.kind) || !validCalendarDate(action.target.start)) throw new Error('任务安排日期无效')
        plan = planFor(action.target.kind, action.target.start)
        if (!validPlan(plan)) throw new Error('任务安排日期无效')
      }
    }
    const db = getDatabase()
    return db.transaction(() => {
      const generation = (db.prepare('SELECT generation FROM editor_draft_meta WHERE id=1').get() as { generation: string }).generation
      if (input.generation !== generation) throw new Error('数据已恢复，请重新打开任务')
      const current = this.tasks.getTask(input.taskId)
      if (current.deletedAt || current.status !== 'active' || current.parentTaskId) throw new Error('只能安排未完成的顶层任务')
      if (current.updatedAt !== input.updatedAt) throw new Error('任务已变化，请刷新后重新安排')
      if (db.prepare("SELECT 1 FROM editor_drafts WHERE kind='task' AND entity_key=? AND payload IS NOT NULL").get(input.taskId)) throw new Error('该任务有未保存修改，请先在详情中保存或放弃')
      let focusDate = current.focusDate
      if (action.kind === 'focus') {
        plan = action.enabled ? planFor('day', today) : current.plan
        focusDate = action.enabled ? today : null
      } else if (plan?.kind !== 'day' || plan.start !== current.plan?.start) focusDate = null
      if (JSON.stringify(plan) === JSON.stringify(current.plan) && focusDate === current.focusDate) return current
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
      db.prepare('UPDATE tasks SET plan_json=?,focus_date=?,updated_at=? WHERE id=?').run(plan ? JSON.stringify(plan) : null, focusDate, updatedAt, current.id)
      return this.tasks.getTask(current.id)
    })()
  }
  batch(input: BatchTaskInput): void {
    if (!input || !Array.isArray(input.targets) || input.targets.some(target => !target || typeof target.updatedAt !== 'string') || typeof input.generation !== 'string') throw new Error('批量任务参数无效')
    const ids = input.targets.map(target => target.id)
    const action = input.action
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !id)) throw new Error('请选择 1 至 500 个任务')
    if (!action || !['plan','deadline','move','tags','complete','remove','recover','purge'].includes(action.kind)) throw new Error('批量操作无效')
    if (action.kind === 'plan' && !validPlan(action.plan)) throw new Error('任务安排无效')
    if (action.kind === 'deadline' && action.date !== null && !validCalendarDate(action.date)) throw new Error('截止日期无效')
    if (action.kind === 'move' && action.listId !== null && (typeof action.listId !== 'string' || !getDatabase().prepare('SELECT 1 FROM task_lists WHERE id=?').get(action.listId))) throw new Error('目标清单不存在')
    getDatabase().transaction(() => {
      const unique = [...new Set(ids)]
      const generation = (getDatabase().prepare('SELECT generation FROM editor_draft_meta WHERE id=1').get() as { generation: string }).generation
      if (generation !== input.generation) throw new Error('数据已恢复，请重新选择任务')
      const selected = unique.map(id => this.tasks.getTask(id))
      if (input.targets.some(target => selected.find(task => task.id === target.id)?.updatedAt !== target.updatedAt)) throw new Error('任务已变化，请刷新后重新选择')
      const trash = action.kind === 'recover' || action.kind === 'purge'
      if (selected.some(task => Boolean(task.deletedAt) !== trash)) throw new Error('任务状态已变化，请刷新后重试')
      if (action.kind === 'plan') {
        const conflict = selected.find(task => getDatabase().prepare("SELECT 1 FROM editor_drafts WHERE kind='task' AND entity_key=? AND payload IS NOT NULL").get(task.id))
        if (conflict) throw new Error(`任务「${conflict.title}」有未保存修改，请先在详情中保存或放弃`)
      }
      if (action.kind === 'remove') { removeTasks(unique); return }
      if (action.kind === 'recover') { recoverTasks(unique); return }
      if (action.kind === 'purge') { purgeTasks(unique); return }
      for (const task of selected) {
        if (action.kind === 'complete') this.tasks.completeTask(task.id)
        else if (action.kind === 'plan') {
          if (task.parentTaskId) throw new Error('子任务不能独立安排计划')
          const focus = action.plan?.kind === 'day' && action.plan.start === task.plan?.start ? task.focusDate : null
          if (JSON.stringify(action.plan) !== JSON.stringify(task.plan) || focus !== task.focusDate) {
            const updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString()
            getDatabase().prepare('UPDATE tasks SET plan_json=?,focus_date=?,updated_at=? WHERE id=?').run(action.plan ? JSON.stringify(action.plan) : null, focus, updatedAt, task.id)
          }
        }
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
