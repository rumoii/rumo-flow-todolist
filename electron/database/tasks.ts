import { getDatabase } from './db'
import { localDay, shiftDay, validPlan } from '../../src/shared/planning'
import { removeTasks, recoverTasks, purgeExpiredTasks } from './task-trash'
import { timestamp, newId, reminders, mapTag, mapRule, validTime, validDate, nextDate } from './common'
import type { CreateTaskInput, Tag, Task, TaskQuery, UpdateTaskInput, TaskPriority } from '../../src/shared/contracts'
export class TaskRepository {
  private tagsFor(taskId: string): Tag[] { return (getDatabase().prepare('SELECT tags.* FROM tags JOIN task_tags ON task_tags.tag_id=tags.id WHERE task_tags.task_id=? ORDER BY tags.name').all(taskId) as any[]).map(mapTag); }
  private mapTask(row: any): Task { return { plan: row.plan_json ? JSON.parse(row.plan_json) : null, focusDate: row.focus_date, deletionBatch: row.deletion_batch, id: row.id, title: row.title, listId: row.list_id, dueDate: row.due_date, dueTime: row.due_time ?? null, reminderMinutesBefore: row.reminder_minutes_before ?? null, priority: row.priority, notes: row.notes, status: row.status, sortOrder: row.sort_order, isPinned: Boolean(row.is_pinned), parentTaskId: row.parent_task_id, recurrenceRuleId: row.recurrence_rule_id, recurrence: row.recurrence_rule_id ? mapRule(getDatabase().prepare('SELECT * FROM recurrence_rules WHERE id=?').get(row.recurrence_rule_id)) : null, generatedFromTaskId: row.generated_from_task_id ?? null, deletedAt: row.deleted_at ?? null, tags: this.tagsFor(row.id), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at }; }
  validateTask(input: Partial<CreateTaskInput>): void {
    if (input.plan !== undefined && !validPlan(input.plan)) throw new Error('任务安排无效')
    if (input.focusDate != null && (!input.plan || input.plan.kind !== 'day' || input.focusDate !== input.plan.start)) throw new Error('重点任务必须安排到当天')
    if (!validDate(input.dueDate) || !validDate(input.recurrence?.endDate))
    throw new Error('日期格式无效'); if (!validTime(input.dueTime))
    throw new Error('时间格式无效'); if (input.reminderMinutesBefore != null && !reminders.includes(input.reminderMinutesBefore))
    throw new Error('提醒时间无效'); if (input.reminderMinutesBefore != null && !input.dueDate)
    throw new Error('提醒任务必须设置日期'); }
  private validateTagIds(tagIds?: string[]): void { if (!tagIds?.length)
    return; const found = getDatabase().prepare(`SELECT id FROM tags WHERE id IN (${tagIds.map(() => '?').join(',')})`).all(...tagIds) as any[]; if (new Set(found.map((item) => item.id)).size !== new Set(tagIds).size)
    throw new Error('任务标签不存在'); }
  private saveTags(taskId: string, tagIds: string[] = []): void { const db = getDatabase(); db.prepare('DELETE FROM task_tags WHERE task_id=?').run(taskId); const insert = db.prepare('INSERT INTO task_tags(task_id,tag_id) VALUES (?,?)'); [...new Set(tagIds)].forEach((tagId) => insert.run(taskId, tagId)); }
  listTasks(query: TaskQuery = {}): Task[] {
    const clauses = query.includeDeleted ? [] : ['tasks.deleted_at IS NULL']
    const now = new Date()
    const params: Record<string, unknown> = { today: localDay(now), next7: shiftDay(localDay(now), 7), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` }
    if (query.listId !== undefined) {
      clauses.push('tasks.list_id IS :listId')
      params.listId = query.listId
    }
    if (query.status && query.status !== 'all') {
      clauses.push('tasks.status=:status')
      params.status = query.status
    }
    if (query.dueFrom) {
      clauses.push('tasks.due_date>=:dueFrom')
      params.dueFrom = query.dueFrom
    }
    if (query.dueTo) {
      clauses.push('tasks.due_date<=:dueTo')
      params.dueTo = query.dueTo
    }
    if (query.search?.trim()) {
      clauses.push('(tasks.title LIKE :search OR tasks.notes LIKE :search OR EXISTS (SELECT 1 FROM task_tags tt JOIN tags t ON t.id=tt.tag_id WHERE tt.task_id=tasks.id AND t.name LIKE :search))')
      params.search = `%${query.search.trim()}%`
    }
    if (query.priorities?.length) {
      clauses.push(`tasks.priority IN (${query.priorities.map((_, i) => `:p${i}`).join(',')})`)
      query.priorities.forEach((value, i) => { params[`p${i}`] = value; })
    }
    if (query.tagIds?.length) {
      clauses.push(`EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=tasks.id AND tt.tag_id IN (${query.tagIds.map((_, i) => `:t${i}`).join(',')}))`)
      query.tagIds.forEach((value, i) => { params[`t${i}`] = value; })
    }
    if (query.due === 'none')
      clauses.push('tasks.due_date IS NULL')
    if (query.due === 'today')
      clauses.push('tasks.due_date=:today')
    if (query.due === 'overdue')
      clauses.push("(tasks.due_date<:today OR (tasks.due_date=:today AND tasks.due_time<:time)) AND tasks.status='active'")
    if (query.due === 'next7')
      clauses.push('tasks.due_date>:today AND tasks.due_date<=:next7')
    return (getDatabase().prepare(`SELECT tasks.* FROM tasks ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY status, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, sort_order, created_at`).all(params) as any[]).map((row) => this.mapTask(row))
  }
  getTask(taskId: string): Task { const row = getDatabase().prepare('SELECT * FROM tasks WHERE id=?').get(taskId); if (!row)
    throw new Error('任务不存在'); return this.mapTask(row); }
  createTask(input: CreateTaskInput): Task {
    if (!input.title?.trim())
      throw new Error('任务标题不能为空')
    if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean')
      throw new Error('任务置顶状态无效')
    this.validateTask(input)
    this.validateTagIds(input.tagIds)
    const db = getDatabase()
    const taskId = newId()
    const createdAt = timestamp()
    const ruleId = input.recurrence ? newId() : null
    db.transaction(() => { db.prepare('INSERT INTO tasks(id,title,list_id,due_date,due_time,reminder_minutes_before,priority,notes,sort_order,is_pinned,parent_task_id,recurrence_rule_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(taskId, input.title.trim(), input.listId ?? null, input.dueDate ?? null, input.dueTime ?? null, input.reminderMinutesBefore ?? null, input.priority ?? 'none', input.notes ?? '', input.sortOrder ?? 0, input.isPinned ? 1 : 0, input.parentTaskId ?? null, ruleId, createdAt, createdAt); if (input.recurrence)
      db.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)').run(ruleId, taskId, input.recurrence.frequency, input.recurrence.interval ?? 1, JSON.stringify(input.recurrence.weekdays ?? []), input.recurrence.endDate ?? null, input.dueDate ?? null, input.recurrence.frequency === 'monthly' && input.dueDate ? Number(input.dueDate.slice(8, 10)) : null); this.saveTags(taskId, input.tagIds); db.prepare('UPDATE tasks SET plan_json=?,focus_date=? WHERE id=?').run(input.plan ? JSON.stringify(input.plan) : null, input.focusDate ?? null, taskId); })()
    return this.getTask(taskId)
  }
  updateTask(taskId: string, input: UpdateTaskInput): Task {
    const current = this.getTask(taskId)
    if (current.deletedAt) throw new Error('任务已删除')
    if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean')
      throw new Error('任务置顶状态无效')
    this.validateTagIds(input.tagIds)
    const merged = { ...current, ...input, title: input.title?.trim() ?? current.title }
    if (input.plan !== undefined && (input.plan?.kind !== 'day' || input.plan.start !== current.plan?.start)) merged.focusDate = input.focusDate ?? null
    this.validateTask(merged)
    if (!merged.title)
      throw new Error('任务标题不能为空')
    const db = getDatabase()
    db.transaction(() => { db.prepare('UPDATE tasks SET title=?,list_id=?,due_date=?,due_time=?,reminder_minutes_before=?,priority=?,notes=?,sort_order=?,is_pinned=?,parent_task_id=?,updated_at=?,reminder_notified_at=NULL WHERE id=?').run(merged.title, merged.listId ?? null, merged.dueDate ?? null, merged.dueTime ?? null, merged.reminderMinutesBefore ?? null, merged.priority, merged.notes ?? '', merged.sortOrder ?? 0, merged.isPinned ? 1 : 0, merged.parentTaskId ?? null, new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString(), taskId); if (input.sortOrder === undefined && (input.priority !== undefined && input.priority !== current.priority || input.isPinned !== undefined && input.isPinned !== current.isPinned))
      db.prepare('UPDATE tasks SET sort_order=(SELECT COALESCE(MAX(sort_order),-1)+1 FROM tasks AS grouped WHERE grouped.id<>tasks.id AND grouped.deleted_at IS NULL AND grouped.parent_task_id IS NULL AND grouped.is_pinned=tasks.is_pinned AND grouped.priority=tasks.priority) WHERE id=?').run(taskId); if (input.recurrence !== undefined) {
      db.prepare('DELETE FROM recurrence_rules WHERE task_id=?').run(taskId)
      db.prepare('UPDATE tasks SET recurrence_rule_id=NULL WHERE id=?').run(taskId)
      if (input.recurrence) {
        const ruleId = newId()
        db.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)').run(ruleId, taskId, input.recurrence.frequency, input.recurrence.interval ?? 1, JSON.stringify(input.recurrence.weekdays ?? []), input.recurrence.endDate ?? null, merged.dueDate ?? null, input.recurrence.frequency === 'monthly' && merged.dueDate ? Number(merged.dueDate.slice(8, 10)) : null)
        db.prepare('UPDATE tasks SET recurrence_rule_id=? WHERE id=?').run(ruleId, taskId)
      }
    } if (input.tagIds !== undefined)
      this.saveTags(taskId, input.tagIds); db.prepare('UPDATE tasks SET plan_json=?,focus_date=? WHERE id=?').run(merged.plan ? JSON.stringify(merged.plan) : null, merged.focusDate, taskId); })()
    return this.getTask(taskId)
  }
  organizeTask(taskId: string, input: {
    isPinned: boolean
    priority: TaskPriority
    orderedIds: string[]
  }): Task {
    if (!Array.isArray(input.orderedIds) || input.orderedIds.some((id) => typeof id !== 'string') || !input.orderedIds.includes(taskId))
      throw new Error('任务顺序无效')
    if (typeof input.isPinned !== 'boolean' || !['none', 'low', 'medium', 'high'].includes(input.priority))
      throw new Error('任务分组无效')
    const db = getDatabase()
    db.transaction(() => {
      if (db.prepare('UPDATE tasks SET is_pinned=?,priority=?,updated_at=? WHERE id=? AND deleted_at IS NULL AND parent_task_id IS NULL').run(input.isPinned ? 1 : 0, input.priority, timestamp(), taskId).changes !== 1)
        throw new Error('任务不存在')
      const groupIds = (db.prepare('SELECT id FROM tasks WHERE deleted_at IS NULL AND parent_task_id IS NULL AND is_pinned=? AND priority=?').all(input.isPinned ? 1 : 0, input.priority) as Array<{
        id: string
      }>).map((item) => item.id)
      if (new Set(input.orderedIds).size !== input.orderedIds.length || groupIds.length !== input.orderedIds.length || groupIds.some((id) => !input.orderedIds.includes(id)))
        throw new Error('任务顺序不完整')
      this.reorderTasks(input.orderedIds)
    })()
    return this.getTask(taskId)
  }
  completeTask(taskId: string): void { const db = getDatabase(); db.transaction(() => { if (db.prepare("UPDATE tasks SET status='completed',completed_at=?,updated_at=? WHERE id=? AND status='active' AND deleted_at IS NULL").run(timestamp(), timestamp(), taskId).changes)
    this.generateNext(taskId); })(); }
  reopenTask(taskId: string): void { const db = getDatabase(); db.transaction(() => { db.prepare("UPDATE tasks SET status='active',completed_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NULL").run(timestamp(), taskId); const generated = db.prepare('SELECT id FROM tasks WHERE generated_from_task_id=? AND deleted_at IS NULL').all(taskId) as { id: string }[]; removeTasks(generated.map(task => task.id)); db.prepare('UPDATE tasks SET generated_from_task_id=NULL WHERE generated_from_task_id=?').run(taskId); })(); }
  removeTask(taskId: string): void { this.getTask(taskId); removeTasks([taskId]); }
  recoverTask(taskId: string): void { this.getTask(taskId); recoverTasks([taskId]); }
  reorderTasks(taskIds: string[]): void { const db = getDatabase(); const update = db.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND deleted_at IS NULL'); db.transaction(() => taskIds.forEach((taskId, index) => { if (update.run(index, timestamp(), taskId).changes !== 1)
    throw new Error('任务不存在'); }))(); }
  private generateNext(taskId: string): void { const db = getDatabase(); const row = db.prepare('SELECT * FROM recurrence_rules WHERE task_id=?').get(taskId); const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId) as any; if (!row || !task?.due_date || db.prepare('SELECT 1 FROM tasks WHERE generated_from_task_id=? AND deleted_at IS NULL').get(taskId))
    return; const rule = mapRule(row); const dueDate = nextDate(task.due_date, rule); if (rule.endDate && dueDate > rule.endDate)
    return; const next = this.createTask({ title: task.title, listId: task.list_id, dueDate, dueTime: task.due_time, reminderMinutesBefore: task.reminder_minutes_before, priority: task.priority, notes: task.notes, sortOrder: task.sort_order, parentTaskId: task.parent_task_id, tagIds: this.tagsFor(taskId).map((tag) => tag.id), recurrence: { frequency: rule.frequency, interval: rule.interval, weekdays: rule.weekdays, endDate: rule.endDate } }); db.prepare('UPDATE tasks SET generated_from_task_id=? WHERE id=?').run(taskId, next.id); }
  dueReminders(reference = new Date()): Array<{
    task: Task
    remindAt: Date
  }> { return (getDatabase().prepare("SELECT * FROM tasks WHERE status='active' AND deleted_at IS NULL AND due_date IS NOT NULL AND due_time IS NOT NULL AND reminder_minutes_before IS NOT NULL AND reminder_notified_at IS NULL").all() as any[]).map((row) => { const task = this.mapTask(row); const remindAt = new Date(`${task.dueDate}T${task.dueTime}:00`); remindAt.setMinutes(remindAt.getMinutes() - (task.reminderMinutesBefore ?? 0)); return { task, remindAt }; }).filter(({ remindAt }) => remindAt <= reference && reference.getTime() - remindAt.getTime() <= 86400000); }
  nextReminder(): {
    task: Task
    remindAt: Date
  } | null { const current = new Date(); const items = (getDatabase().prepare("SELECT * FROM tasks WHERE status='active' AND deleted_at IS NULL AND due_date IS NOT NULL AND due_time IS NOT NULL AND reminder_minutes_before IS NOT NULL AND reminder_notified_at IS NULL").all() as any[]).map((row) => { const task = this.mapTask(row); const remindAt = new Date(`${task.dueDate}T${task.dueTime}:00`); remindAt.setMinutes(remindAt.getMinutes() - (task.reminderMinutesBefore ?? 0)); return { task, remindAt }; }).filter((item) => item.remindAt > current).sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime()); return items[0] ?? null; }
  markReminderNotified(id: string): void { getDatabase().prepare('UPDATE tasks SET reminder_notified_at=?,updated_at=? WHERE id=?').run(timestamp(), timestamp(), id); }
  purgeDeleted(olderThan = new Date(Date.now() - 30 * 86400000)): number { return purgeExpiredTasks(olderThan.toISOString()); }
}
