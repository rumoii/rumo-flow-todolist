import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDatabase } from './db'
import type { BackupPayload, CreateTaskInput, CreateTaskListInput, RecurrenceRule, Task, TaskList, TaskQuery, UpdateTaskInput, UpdateTaskListInput } from '../../src/shared/contracts'

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

function mapTask(row: any): Task {
  return { id: row.id, title: row.title, listId: row.list_id, dueDate: row.due_date, priority: row.priority, notes: row.notes, status: row.status, sortOrder: row.sort_order, parentTaskId: row.parent_task_id, recurrenceRuleId: row.recurrence_rule_id, generatedFromTaskId: row.generated_from_task_id ?? null, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at }
}
function mapList(row: any): TaskList { return { id: row.id, name: row.name, color: row.color, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at } }
function mapRule(row: any): RecurrenceRule { return { id: row.id, taskId: row.task_id, frequency: row.frequency, interval: row.interval, weekdays: JSON.parse(row.weekdays), monthDay: row.month_day ?? null, endDate: row.end_date, nextDueDate: row.next_due_date } }

function nextRecurrenceDate(value: string, frequency: RecurrenceRule['frequency'], interval: number, weekdays: number[], monthDay?: number | null): string {
  const [year, month, day] = value.split('-').map(Number)
  if (frequency === 'daily') { const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() + interval); return date.toISOString().slice(0, 10) }
  if (frequency === 'weekly') {
    const date = new Date(Date.UTC(year, month - 1, day)); const selected = [...new Set(weekdays)].sort((a, b) => a - b)
    if (selected.length === 0) date.setUTCDate(date.getUTCDate() + 7 * interval)
    else { const current = date.getUTCDay(); const later = selected.find((weekday) => weekday > current); date.setUTCDate(date.getUTCDate() + (later === undefined ? 7 * interval - current + selected[0] : later - current)) }
    return date.toISOString().slice(0, 10)
  }
  const targetMonth = month - 1 + interval; const target = new Date(Date.UTC(year, targetMonth, 1)); const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate(); return `${target.getUTCFullYear().toString().padStart(4, '0')}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(monthDay ?? day, lastDay)).padStart(2, '0')}`
}

export class Repository {
  listTasks(query: TaskQuery = {}): Task[] {
    const where: string[] = []
    const params: Record<string, unknown> = {}
    if (query.listId !== undefined) { where.push('list_id IS :listId'); params.listId = query.listId }
    if (query.status) { where.push('status = :status'); params.status = query.status }
    if (query.dueFrom) { where.push('due_date >= :dueFrom'); params.dueFrom = query.dueFrom }
    if (query.dueTo) { where.push('due_date <= :dueTo'); params.dueTo = query.dueTo }
    if (!query.includeOverdue && query.dueFrom) where.push('(status = \'completed\' OR due_date IS NULL OR due_date >= :today)')
    if (query.search) { where.push('(title LIKE :search OR notes LIKE :search)'); params.search = `%${query.search}%` }
    const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY status ASC, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, sort_order ASC, created_at ASC`
    params.today = new Date().toISOString().slice(0, 10)
    return (getDatabase().prepare(sql).all(params) as any[]).map(mapTask)
  }

  getTask(taskId: string): Task {
    const row = getDatabase().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
    if (!row) throw new Error('任务不存在')
    return mapTask(row)
  }

  createTask(input: CreateTaskInput): Task {
    const database = getDatabase(); const taskId = id(); const timestamp = now()
    if (!input.title?.trim()) throw new Error('任务标题不能为空')
    const ruleId = input.recurrence ? id() : null
    database.transaction(() => {
      database.prepare(`INSERT INTO tasks(id,title,list_id,due_date,priority,notes,sort_order,parent_task_id,recurrence_rule_id,created_at,updated_at) VALUES (@id,@title,@listId,@dueDate,@priority,@notes,@sortOrder,@parentTaskId,@ruleId,@createdAt,@updatedAt)`).run({ id: taskId, title: input.title.trim(), listId: input.listId ?? null, dueDate: input.dueDate ?? null, priority: input.priority ?? 'none', notes: input.notes ?? '', sortOrder: input.sortOrder ?? 0, parentTaskId: input.parentTaskId ?? null, ruleId, createdAt: timestamp, updatedAt: timestamp })
      if (input.recurrence) database.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)').run(ruleId, taskId, input.recurrence.frequency, input.recurrence.interval ?? 1, JSON.stringify(input.recurrence.weekdays ?? []), input.recurrence.endDate ?? null, input.dueDate ?? null, input.recurrence.frequency === 'monthly' && input.dueDate ? Number(input.dueDate.slice(8, 10)) : null)
    })()
    return this.getTask(taskId)
  }

  updateTask(taskId: string, input: UpdateTaskInput): Task {
    const current = this.getTask(taskId); const merged = { ...current, ...input, title: input.title?.trim() ?? current.title }; if (!merged.title) throw new Error('任务标题不能为空')
    const database = getDatabase(); const timestamp = now(); const recurrence = input.recurrence
    database.transaction(() => {
      database.prepare(`UPDATE tasks SET title=@title,list_id=@listId,due_date=@dueDate,priority=@priority,notes=@notes,sort_order=@sortOrder,parent_task_id=@parentTaskId,updated_at=@updatedAt WHERE id=@id`).run({ id: taskId, title: merged.title, listId: merged.listId ?? null, dueDate: merged.dueDate ?? null, priority: merged.priority, notes: merged.notes ?? '', sortOrder: merged.sortOrder ?? 0, parentTaskId: merged.parentTaskId ?? null, updatedAt: timestamp })
      if (recurrence !== undefined) {
        database.prepare('DELETE FROM recurrence_rules WHERE task_id = ?').run(taskId)
        database.prepare('UPDATE tasks SET recurrence_rule_id = NULL WHERE id = ?').run(taskId)
        if (recurrence) { const ruleId = id(); database.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)').run(ruleId, taskId, recurrence.frequency, recurrence.interval ?? 1, JSON.stringify(recurrence.weekdays ?? []), recurrence.endDate ?? null, merged.dueDate ?? null, recurrence.frequency === 'monthly' && merged.dueDate ? Number(merged.dueDate.slice(8, 10)) : null); database.prepare('UPDATE tasks SET recurrence_rule_id = ? WHERE id = ?').run(ruleId, taskId) }
      }
    })()
    return this.getTask(taskId)
  }

  completeTask(taskId: string): void { const database = getDatabase(); const timestamp = now(); database.transaction(() => { const result = database.prepare("UPDATE tasks SET status='completed',completed_at=?,updated_at=? WHERE id=? AND status='active'").run(timestamp, timestamp, taskId); if (result.changes > 0) this.generateNext(taskId) })() }
  restoreTask(taskId: string): void { getDatabase().prepare("UPDATE tasks SET status='active',completed_at=NULL,updated_at=? WHERE id=?").run(now(), taskId) }
  removeTask(taskId: string): void { getDatabase().prepare('DELETE FROM tasks WHERE id=?').run(taskId) }

  private generateNext(taskId: string): void {
    const database = getDatabase(); const rule = database.prepare('SELECT * FROM recurrence_rules WHERE task_id=?').get(taskId); const task = database.prepare('SELECT * FROM tasks WHERE id=?').get(taskId) as any
    if (!rule || !task?.due_date) return
    const r = mapRule(rule); const nextDate = nextRecurrenceDate(task.due_date, r.frequency, r.interval, r.weekdays, r.monthDay); if (r.endDate && nextDate > r.endDate) return
    if (database.prepare('SELECT 1 FROM tasks WHERE generated_from_task_id=?').get(taskId)) return
    const next = this.createTask({ title: task.title, listId: task.list_id, dueDate: nextDate, priority: task.priority, notes: task.notes, sortOrder: task.sort_order, parentTaskId: task.parent_task_id, recurrence: { frequency: r.frequency, interval: r.interval, weekdays: r.weekdays, endDate: r.endDate } })
    database.prepare('UPDATE tasks SET generated_from_task_id=? WHERE id=?').run(taskId, next.id)
    if (r.frequency === 'monthly') database.prepare('UPDATE recurrence_rules SET month_day=? WHERE task_id=?').run(r.monthDay, next.id)
  }

  listLists(): TaskList[] { return (getDatabase().prepare('SELECT * FROM task_lists ORDER BY sort_order,name').all() as any[]).map(mapList) }
  createList(input: CreateTaskListInput): TaskList { const timestamp = now(); const listId = id(); getDatabase().prepare('INSERT INTO task_lists(id,name,color,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(listId, input.name.trim(), input.color ?? null, input.sortOrder ?? 0, timestamp, timestamp); return mapList(getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(listId)) }
  updateList(listId: string, input: UpdateTaskListInput): TaskList { const current = getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(listId) as any; if (!current) throw new Error('清单不存在'); getDatabase().prepare('UPDATE task_lists SET name=?,color=?,sort_order=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.color === undefined ? current.color : input.color, input.sortOrder ?? current.sort_order, now(), listId); return mapList(getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(listId)) }
  removeList(listId: string): void { getDatabase().prepare('DELETE FROM task_lists WHERE id=?').run(listId) }

  exportBackup(): BackupPayload { const database = getDatabase(); const settings = Object.fromEntries((database.prepare('SELECT key,value FROM app_settings').all() as any[]).map((x) => [x.key, JSON.parse(x.value)])); return { format: 'rumo-flow-backup', version: 1, exportedAt: now(), taskLists: this.listLists(), tasks: this.listTasks({}), recurrenceRules: (database.prepare('SELECT * FROM recurrence_rules').all() as any[]).map(mapRule), settings } }
  importBackup(payload: BackupPayload): { importedTasks: number; importedLists: number; importedRules: number } {
    this.validateBackup(payload)
    const database = getDatabase(); const snapshot = this.exportBackup(); const backupDirectory = path.join(path.dirname(database.name), 'backups'); fs.mkdirSync(backupDirectory, { recursive: true }); fs.writeFileSync(path.join(backupDirectory, `pre-import-${Date.now()}.json`), JSON.stringify(snapshot, null, 2), 'utf8')
    database.transaction(() => {
      database.exec('DELETE FROM recurrence_rules; DELETE FROM tasks; DELETE FROM task_lists; DELETE FROM app_settings;')
      const listStmt = database.prepare('INSERT INTO task_lists(id,name,color,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      payload.taskLists.forEach((x) => listStmt.run(x.id, x.name, x.color, x.sortOrder, x.createdAt, x.updatedAt))
      const taskStmt = database.prepare('INSERT INTO tasks(id,title,list_id,due_date,priority,notes,status,sort_order,parent_task_id,recurrence_rule_id,created_at,updated_at,completed_at,generated_from_task_id) VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL)')
      payload.tasks.forEach((x) => taskStmt.run(x.id,x.title,x.listId,x.dueDate,x.priority,x.notes,x.status,x.sortOrder,x.recurrenceRuleId,x.createdAt,x.updatedAt,x.completedAt))
      const links = database.prepare('UPDATE tasks SET parent_task_id=?, generated_from_task_id=? WHERE id=?')
      payload.tasks.forEach((x) => links.run(x.parentTaskId, x.generatedFromTaskId ?? null, x.id))
      const ruleStmt = database.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)')
      payload.recurrenceRules.forEach((x) => ruleStmt.run(x.id,x.taskId,x.frequency,x.interval,JSON.stringify(x.weekdays),x.endDate,x.nextDueDate,x.monthDay ?? null))
      const settingsStmt = database.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)')
      Object.entries(payload.settings ?? {}).forEach(([key,value]) => settingsStmt.run(key,JSON.stringify(value)))
    })()
    return { importedTasks: payload.tasks.length, importedLists: payload.taskLists.length, importedRules: payload.recurrenceRules.length }
  }

  private validateBackup(payload: BackupPayload): void {
    if (!payload || !['rumo-flow-backup', 'rumo-daiban-backup'].includes(payload.format) || payload.version !== 1 || !Array.isArray(payload.tasks) || !Array.isArray(payload.taskLists) || !Array.isArray(payload.recurrenceRules) || !payload.settings || typeof payload.settings !== 'object') throw new Error('备份文件格式不受支持')
    const listIds = new Set(payload.taskLists.map((x) => x.id)); const taskIds = new Set(payload.tasks.map((x) => x.id)); if (listIds.size !== payload.taskLists.length || taskIds.size !== payload.tasks.length) throw new Error('备份文件包含重复编号')
    for (const list of payload.taskLists) if (!list.id || !list.name || !Number.isInteger(list.sortOrder)) throw new Error('备份清单数据无效')
    for (const task of payload.tasks) { if (!task.id || !task.title || !['none','low','medium','high'].includes(task.priority) || !['active','completed'].includes(task.status) || (task.listId && !listIds.has(task.listId)) || (task.parentTaskId && !taskIds.has(task.parentTaskId))) throw new Error('备份任务数据无效') }
    const ruleIds = new Set<string>(); for (const rule of payload.recurrenceRules) { if (!rule.id || ruleIds.has(rule.id) || !taskIds.has(rule.taskId) || !['daily','weekly','monthly'].includes(rule.frequency) || !Number.isInteger(rule.interval) || rule.interval < 1 || !Array.isArray(rule.weekdays) || rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('备份重复规则无效'); ruleIds.add(rule.id) }
    for (const task of payload.tasks) if ((task.recurrenceRuleId && !ruleIds.has(task.recurrenceRuleId)) || (task.generatedFromTaskId && !taskIds.has(task.generatedFromTaskId))) throw new Error('备份任务关联无效')
  }
}
