import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDatabase } from './db'
import type { AppSettings, BackupPayload, CreateSavedFilterInput, CreateTagInput, CreateTaskInput, CreateTaskListInput, CreateVideoReflectionInput, DailyReview, FlowDay, FlowDaySummary, FlowSummary, RecurrenceRule, SaveDailyReviewInput, SavedFilter, Tag, Task, TaskFilterCriteria, TaskList, TaskQuery, UpdateSavedFilterInput, UpdateTagInput, UpdateTaskInput, UpdateTaskListInput, UpdateVideoReflectionInput, VideoReflection } from '../../src/shared/contracts'

const timestamp = () => new Date().toISOString()
const newId = () => crypto.randomUUID()
const reminders = [5, 15, 60, 1440]
const defaults: AppSettings = { theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }

const mapList = (row: any): TaskList => ({ id: row.id, name: row.name, color: row.color ?? null, sortOrder: row.sort_order, isPinned: Boolean(row.is_pinned), createdAt: row.created_at, updatedAt: row.updated_at })
const mapTag = (row: any): Tag => ({ id: row.id, name: row.name, color: row.color ?? null, createdAt: row.created_at, updatedAt: row.updated_at })
const mapRule = (row: any): RecurrenceRule => ({ id: row.id, taskId: row.task_id, frequency: row.frequency, interval: row.interval, weekdays: JSON.parse(row.weekdays), monthDay: row.month_day ?? null, endDate: row.end_date, nextDueDate: row.next_due_date })
const validDate = (value?: string | null) => value == null || /^\d{4}-\d{2}-\d{2}$/.test(value)
const validTime = (value?: string | null) => value == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const parseLocalDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day) }
const shiftDate = (value: string, days: number) => { const date = parseLocalDate(value); date.setDate(date.getDate() + days); return localDate(date) }
const validCalendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(parseLocalDate(value)) === value

function normalizeHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
    return url.toString()
  } catch { throw new Error('视频来源必须是有效的 HTTP 或 HTTPS 链接') }
}

function platformForUrl(value: string): string {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  if (hostname === 'douyin.com' || hostname.endsWith('.douyin.com')) return '抖音'
  if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com') || hostname === 'b23.tv') return '哔哩哔哩'
  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') return 'YouTube'
  if (hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com') || hostname === 'xhslink.com') return '小红书'
  if (hostname === 'kuaishou.com' || hostname.endsWith('.kuaishou.com')) return '快手'
  return hostname
}

function nextDate(value: string, rule: RecurrenceRule): string {
  const [year, month, day] = value.split('-').map(Number)
  if (rule.frequency === 'daily') { const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() + rule.interval); return date.toISOString().slice(0, 10) }
  if (rule.frequency === 'weekly') { const date = new Date(Date.UTC(year, month - 1, day)); const days = [...new Set(rule.weekdays)].sort(); if (!days.length) date.setUTCDate(date.getUTCDate() + rule.interval * 7); else { const later = days.find((item) => item > date.getUTCDay()); date.setUTCDate(date.getUTCDate() + (later === undefined ? rule.interval * 7 - date.getUTCDay() + days[0] : later - date.getUTCDay())) } return date.toISOString().slice(0, 10) }
  const date = new Date(Date.UTC(year, month - 1 + rule.interval, 1)); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); return `${date.getUTCFullYear().toString().padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(rule.monthDay ?? day, last)).padStart(2, '0')}`
}

export class Repository {
  private tagsFor(taskId: string): Tag[] { return (getDatabase().prepare('SELECT tags.* FROM tags JOIN task_tags ON task_tags.tag_id=tags.id WHERE task_tags.task_id=? ORDER BY tags.name').all(taskId) as any[]).map(mapTag) }
  private mapTask(row: any): Task { return { id: row.id, title: row.title, listId: row.list_id, dueDate: row.due_date, dueTime: row.due_time ?? null, reminderMinutesBefore: row.reminder_minutes_before ?? null, priority: row.priority, notes: row.notes, status: row.status, sortOrder: row.sort_order, isPinned: Boolean(row.is_pinned), parentTaskId: row.parent_task_id, recurrenceRuleId: row.recurrence_rule_id, generatedFromTaskId: row.generated_from_task_id ?? null, deletedAt: row.deleted_at ?? null, tags: this.tagsFor(row.id), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at } }
  private validateTask(input: Partial<CreateTaskInput>): void { if (!validDate(input.dueDate)) throw new Error('日期格式无效'); if (!validTime(input.dueTime)) throw new Error('时间格式无效'); if (input.reminderMinutesBefore != null && !reminders.includes(input.reminderMinutesBefore)) throw new Error('提醒时间无效'); if (input.reminderMinutesBefore != null && !input.dueDate) throw new Error('提醒任务必须设置日期') }
  private validateTagIds(tagIds?: string[]): void { if (!tagIds?.length) return; const found = getDatabase().prepare(`SELECT id FROM tags WHERE id IN (${tagIds.map(() => '?').join(',')})`).all(...tagIds) as any[]; if (new Set(found.map((item) => item.id)).size !== new Set(tagIds).size) throw new Error('任务标签不存在') }
  private saveTags(taskId: string, tagIds: string[] = []): void { const db = getDatabase(); db.prepare('DELETE FROM task_tags WHERE task_id=?').run(taskId); const insert = db.prepare('INSERT INTO task_tags(task_id,tag_id) VALUES (?,?)'); [...new Set(tagIds)].forEach((tagId) => insert.run(taskId, tagId)) }

  listTasks(query: TaskQuery = {}): Task[] {
    const clauses = query.includeDeleted ? [] : ['tasks.deleted_at IS NULL']; const params: Record<string, unknown> = { today: new Date().toISOString().slice(0, 10), next7: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }
    if (query.listId !== undefined) { clauses.push('tasks.list_id IS :listId'); params.listId = query.listId }
    if (query.status && query.status !== 'all') { clauses.push('tasks.status=:status'); params.status = query.status }
    if (query.dueFrom) { clauses.push('tasks.due_date>=:dueFrom'); params.dueFrom = query.dueFrom }
    if (query.dueTo) { clauses.push('tasks.due_date<=:dueTo'); params.dueTo = query.dueTo }
    if (query.search?.trim()) { clauses.push('(tasks.title LIKE :search OR tasks.notes LIKE :search OR EXISTS (SELECT 1 FROM task_tags tt JOIN tags t ON t.id=tt.tag_id WHERE tt.task_id=tasks.id AND t.name LIKE :search))'); params.search = `%${query.search.trim()}%` }
    if (query.priorities?.length) { clauses.push(`tasks.priority IN (${query.priorities.map((_, i) => `:p${i}`).join(',')})`); query.priorities.forEach((value, i) => { params[`p${i}`] = value }) }
    if (query.tagIds?.length) { clauses.push(`EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id=tasks.id AND tt.tag_id IN (${query.tagIds.map((_, i) => `:t${i}`).join(',')}))`); query.tagIds.forEach((value, i) => { params[`t${i}`] = value }) }
    if (query.due === 'none') clauses.push('tasks.due_date IS NULL')
    if (query.due === 'today') clauses.push('tasks.due_date=:today')
    if (query.due === 'overdue') clauses.push("tasks.due_date<:today AND tasks.status='active'")
    if (query.due === 'next7') clauses.push('tasks.due_date>:today AND tasks.due_date<=:next7')
    return (getDatabase().prepare(`SELECT tasks.* FROM tasks ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY status, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, sort_order, created_at`).all(params) as any[]).map((row) => this.mapTask(row))
  }
  getTask(taskId: string): Task { const row = getDatabase().prepare('SELECT * FROM tasks WHERE id=?').get(taskId); if (!row) throw new Error('任务不存在'); return this.mapTask(row) }
  createTask(input: CreateTaskInput): Task {
    if (!input.title?.trim()) throw new Error('任务标题不能为空'); if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean') throw new Error('任务置顶状态无效'); this.validateTask(input); this.validateTagIds(input.tagIds)
    const db = getDatabase(); const taskId = newId(); const createdAt = timestamp(); const ruleId = input.recurrence ? newId() : null
    db.transaction(() => { db.prepare('INSERT INTO tasks(id,title,list_id,due_date,due_time,reminder_minutes_before,priority,notes,sort_order,is_pinned,parent_task_id,recurrence_rule_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(taskId, input.title.trim(), input.listId ?? null, input.dueDate ?? null, input.dueTime ?? null, input.reminderMinutesBefore ?? null, input.priority ?? 'none', input.notes ?? '', input.sortOrder ?? 0, input.isPinned ? 1 : 0, input.parentTaskId ?? null, ruleId, createdAt, createdAt); if (input.recurrence) db.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)').run(ruleId, taskId, input.recurrence.frequency, input.recurrence.interval ?? 1, JSON.stringify(input.recurrence.weekdays ?? []), input.recurrence.endDate ?? null, input.dueDate ?? null, input.recurrence.frequency === 'monthly' && input.dueDate ? Number(input.dueDate.slice(8, 10)) : null); this.saveTags(taskId, input.tagIds) })()
    return this.getTask(taskId)
  }
  updateTask(taskId: string, input: UpdateTaskInput): Task {
    const current = this.getTask(taskId); if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean') throw new Error('任务置顶状态无效'); this.validateTask(input); this.validateTagIds(input.tagIds); const merged = { ...current, ...input, title: input.title?.trim() ?? current.title }; if (!merged.title) throw new Error('任务标题不能为空')
    const db = getDatabase(); db.transaction(() => { db.prepare('UPDATE tasks SET title=?,list_id=?,due_date=?,due_time=?,reminder_minutes_before=?,priority=?,notes=?,sort_order=?,is_pinned=?,parent_task_id=?,updated_at=?,reminder_notified_at=NULL WHERE id=?').run(merged.title, merged.listId ?? null, merged.dueDate ?? null, merged.dueTime ?? null, merged.reminderMinutesBefore ?? null, merged.priority, merged.notes ?? '', merged.sortOrder ?? 0, merged.isPinned ? 1 : 0, merged.parentTaskId ?? null, timestamp(), taskId); if (input.recurrence !== undefined) { db.prepare('DELETE FROM recurrence_rules WHERE task_id=?').run(taskId); db.prepare('UPDATE tasks SET recurrence_rule_id=NULL WHERE id=?').run(taskId); if (input.recurrence) { const ruleId = newId(); db.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)').run(ruleId, taskId, input.recurrence.frequency, input.recurrence.interval ?? 1, JSON.stringify(input.recurrence.weekdays ?? []), input.recurrence.endDate ?? null, merged.dueDate ?? null, input.recurrence.frequency === 'monthly' && merged.dueDate ? Number(merged.dueDate.slice(8, 10)) : null); db.prepare('UPDATE tasks SET recurrence_rule_id=? WHERE id=?').run(ruleId, taskId) } } if (input.tagIds !== undefined) this.saveTags(taskId, input.tagIds) })()
    return this.getTask(taskId)
  }
  completeTask(taskId: string): void { const db = getDatabase(); db.transaction(() => { if (db.prepare("UPDATE tasks SET status='completed',completed_at=?,updated_at=? WHERE id=? AND status='active' AND deleted_at IS NULL").run(timestamp(), timestamp(), taskId).changes) this.generateNext(taskId) })() }
  restoreTask(taskId: string): void { const db = getDatabase(); db.transaction(() => { db.prepare("UPDATE tasks SET status='active',completed_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NULL").run(timestamp(), taskId); db.prepare('UPDATE tasks SET deleted_at=?,updated_at=?,generated_from_task_id=NULL WHERE generated_from_task_id=? AND deleted_at IS NULL').run(timestamp(), timestamp(), taskId) })() }
  removeTask(taskId: string): void { getDatabase().prepare('UPDATE tasks SET deleted_at=?,updated_at=? WHERE id=? OR parent_task_id=?').run(timestamp(), timestamp(), taskId, taskId) }
  restoreRemoved(taskId: string): void { getDatabase().prepare('UPDATE tasks SET deleted_at=NULL,updated_at=? WHERE id=? OR parent_task_id=?').run(timestamp(), taskId, taskId) }
  reorderTasks(taskIds: string[]): void { const db = getDatabase(); const update = db.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND deleted_at IS NULL'); db.transaction(() => taskIds.forEach((taskId, index) => { if (update.run(index, timestamp(), taskId).changes !== 1) throw new Error('任务不存在') }))() }
  private generateNext(taskId: string): void { const db = getDatabase(); const row = db.prepare('SELECT * FROM recurrence_rules WHERE task_id=?').get(taskId); const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId) as any; if (!row || !task?.due_date || db.prepare('SELECT 1 FROM tasks WHERE generated_from_task_id=? AND deleted_at IS NULL').get(taskId)) return; const rule = mapRule(row); const dueDate = nextDate(task.due_date, rule); if (rule.endDate && dueDate > rule.endDate) return; const next = this.createTask({ title: task.title, listId: task.list_id, dueDate, dueTime: task.due_time, reminderMinutesBefore: task.reminder_minutes_before, priority: task.priority, notes: task.notes, sortOrder: task.sort_order, parentTaskId: task.parent_task_id, tagIds: this.tagsFor(taskId).map((tag) => tag.id), recurrence: { frequency: rule.frequency, interval: rule.interval, weekdays: rule.weekdays, endDate: rule.endDate } }); db.prepare('UPDATE tasks SET generated_from_task_id=? WHERE id=?').run(taskId, next.id) }

  listLists(): TaskList[] { return (getDatabase().prepare('SELECT * FROM task_lists ORDER BY is_pinned DESC,sort_order,name').all() as any[]).map(mapList) }
  createList(input: CreateTaskListInput): TaskList { if (!input.name?.trim()) throw new Error('清单名称不能为空'); if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean') throw new Error('清单置顶状态无效'); const id = newId(); const createdAt = timestamp(); getDatabase().prepare('INSERT INTO task_lists(id,name,color,sort_order,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, input.name.trim(), input.color ?? null, input.sortOrder ?? 0, input.isPinned ? 1 : 0, createdAt, createdAt); return mapList(getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(id)) }
  updateList(id: string, input: UpdateTaskListInput): TaskList { const current = getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(id) as any; if (!current) throw new Error('清单不存在'); if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean') throw new Error('清单置顶状态无效'); getDatabase().prepare('UPDATE task_lists SET name=?,color=?,sort_order=?,is_pinned=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.color === undefined ? current.color : input.color, input.sortOrder ?? current.sort_order, input.isPinned === undefined ? current.is_pinned : input.isPinned ? 1 : 0, timestamp(), id); return mapList(getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(id)) }
  reorderLists(ids: string[]): void { const db = getDatabase(); const update = db.prepare('UPDATE task_lists SET sort_order=?,updated_at=? WHERE id=?'); db.transaction(() => ids.forEach((id, index) => { if (update.run(index, timestamp(), id).changes !== 1) throw new Error('清单不存在') }))() }
  removeList(id: string, policy: 'keep' | 'delete' = 'keep'): void { const db = getDatabase(); db.transaction(() => { if (policy === 'delete') db.prepare('UPDATE tasks SET deleted_at=?,updated_at=? WHERE list_id=?').run(timestamp(), timestamp(), id); else db.prepare('UPDATE tasks SET list_id=NULL,updated_at=? WHERE list_id=?').run(timestamp(), id); if (db.prepare('DELETE FROM task_lists WHERE id=?').run(id).changes !== 1) throw new Error('清单不存在') })() }

  listTags(): Tag[] { return (getDatabase().prepare('SELECT * FROM tags ORDER BY name').all() as any[]).map(mapTag) }
  createTag(input: CreateTagInput): Tag { if (!input.name?.trim()) throw new Error('标签名称不能为空'); const id = newId(); const createdAt = timestamp(); try { getDatabase().prepare('INSERT INTO tags(id,name,color,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, input.name.trim(), input.color ?? null, createdAt, createdAt) } catch { throw new Error('标签名称已存在') } return mapTag(getDatabase().prepare('SELECT * FROM tags WHERE id=?').get(id)) }
  updateTag(id: string, input: UpdateTagInput): Tag { const current = getDatabase().prepare('SELECT * FROM tags WHERE id=?').get(id) as any; if (!current) throw new Error('标签不存在'); getDatabase().prepare('UPDATE tags SET name=?,color=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.color === undefined ? current.color : input.color, timestamp(), id); return mapTag(getDatabase().prepare('SELECT * FROM tags WHERE id=?').get(id)) }
  removeTag(id: string): void { if (getDatabase().prepare('DELETE FROM tags WHERE id=?').run(id).changes !== 1) throw new Error('标签不存在') }
  private validateCriteria(criteria: TaskFilterCriteria): void { if (!criteria || typeof criteria !== 'object' || (criteria.status && !['active', 'completed', 'all'].includes(criteria.status)) || (criteria.due && !['today', 'overdue', 'next7', 'none', 'any'].includes(criteria.due))) throw new Error('筛选条件无效') }
  listSavedFilters(): SavedFilter[] { return (getDatabase().prepare('SELECT * FROM saved_filters ORDER BY sort_order,name').all() as any[]).map((row) => ({ id: row.id, name: row.name, criteria: JSON.parse(row.criteria_json), sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })) }
  createSavedFilter(input: CreateSavedFilterInput): SavedFilter { if (!input.name?.trim()) throw new Error('筛选名称不能为空'); this.validateCriteria(input.criteria); const id = newId(); const createdAt = timestamp(); getDatabase().prepare('INSERT INTO saved_filters(id,name,criteria_json,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, input.name.trim(), JSON.stringify(input.criteria), input.sortOrder ?? 0, createdAt, createdAt); return this.listSavedFilters().find((item) => item.id === id)! }
  updateSavedFilter(id: string, input: UpdateSavedFilterInput): SavedFilter { const current = getDatabase().prepare('SELECT * FROM saved_filters WHERE id=?').get(id) as any; if (!current) throw new Error('筛选不存在'); if (input.criteria) this.validateCriteria(input.criteria); getDatabase().prepare('UPDATE saved_filters SET name=?,criteria_json=?,sort_order=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.criteria ? JSON.stringify(input.criteria) : current.criteria_json, input.sortOrder ?? current.sort_order, timestamp(), id); return this.listSavedFilters().find((item) => item.id === id)! }
  removeSavedFilter(id: string): void { if (getDatabase().prepare('DELETE FROM saved_filters WHERE id=?').run(id).changes !== 1) throw new Error('筛选不存在') }

  private mapFlowDay(row: any): DailyReview {
    const inputVideoId = row.input_video_id ?? null
    return { date: row.entry_date, videoLimit: row.video_limit, didWell: row.did_well, didNotWell: row.did_not_well, reflection: row.reflection, inputType: row.input_type === 'video' && !inputVideoId ? 'none' : row.input_type, inputVideoId, inputText: row.input_text, outputText: row.output_text, tomorrowExpectation: row.tomorrow_expectation, savedAt: row.saved_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at }
  }
  private mapFlowVideo(row: any): VideoReflection { return { id: row.id, date: row.entry_date, title: row.title, sourceUrl: row.source_url, sourcePlatform: platformForUrl(row.source_url), author: row.author, thought: row.thought, createdAt: row.created_at, updatedAt: row.updated_at } }
  private ensureFlowDay(date: string): DailyReview {
    if (!validCalendarDate(date)) throw new Error('心流日期无效')
    const db = getDatabase(); const createdAt = timestamp(); const currentLimit = this.getSettings().dailyVideoLimit
    db.prepare('INSERT OR IGNORE INTO flow_days(entry_date,video_limit,created_at,updated_at) VALUES (?,?,?,?)').run(date, currentLimit, createdAt, createdAt)
    if (date === localDate()) db.prepare('UPDATE flow_days SET video_limit=? WHERE entry_date=?').run(currentLimit, date)
    return this.mapFlowDay(db.prepare('SELECT * FROM flow_days WHERE entry_date=?').get(date))
  }
  getFlowDay(date: string): FlowDay { const review = this.ensureFlowDay(date); const videos = (getDatabase().prepare('SELECT * FROM flow_videos WHERE entry_date=? ORDER BY created_at').all(date) as any[]).map((row) => this.mapFlowVideo(row)); return { review, videos } }
  saveFlowReview(input: SaveDailyReviewInput): DailyReview {
    const review = this.ensureFlowDay(input.date); const inputType = input.inputType ?? 'none'; if (!['none', 'video', 'other'].includes(inputType)) throw new Error('输入类型无效')
    let inputVideoId = inputType === 'video' ? input.inputVideoId ?? null : null
    if (inputVideoId) { const video = getDatabase().prepare('SELECT entry_date FROM flow_videos WHERE id=?').get(inputVideoId) as { entry_date: string } | undefined; if (!video || video.entry_date !== input.date) throw new Error('关联的视频不存在') }
    if (inputType === 'video' && !inputVideoId) throw new Error('请选择当天的视频')
    const savedAt = timestamp()
    getDatabase().prepare('UPDATE flow_days SET did_well=?,did_not_well=?,reflection=?,input_type=?,input_video_id=?,input_text=?,output_text=?,tomorrow_expectation=?,saved_at=?,updated_at=? WHERE entry_date=?').run(input.didWell ?? '', input.didNotWell ?? '', input.reflection ?? '', inputType, inputVideoId, input.inputText ?? '', input.outputText ?? '', input.tomorrowExpectation ?? '', savedAt, savedAt, review.date)
    return this.mapFlowDay(getDatabase().prepare('SELECT * FROM flow_days WHERE entry_date=?').get(review.date))
  }
  createFlowVideo(input: CreateVideoReflectionInput): VideoReflection {
    if (!validCalendarDate(input.date)) throw new Error('心流日期无效')
    this.ensureFlowDay(input.date); const id = newId(); const createdAt = timestamp(); const sourceUrl = normalizeHttpUrl(input.sourceUrl)
    getDatabase().prepare('INSERT INTO flow_videos(id,entry_date,title,source_url,author,thought,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id, input.date, input.title?.trim() ?? '', sourceUrl, input.author?.trim() ?? '', '', createdAt, createdAt)
    return this.mapFlowVideo(getDatabase().prepare('SELECT * FROM flow_videos WHERE id=?').get(id))
  }
  updateFlowVideo(id: string, input: UpdateVideoReflectionInput): VideoReflection {
    const db = getDatabase(); const current = db.prepare('SELECT * FROM flow_videos WHERE id=?').get(id) as any; if (!current) throw new Error('视频记录不存在')
    const title = input.title === undefined ? current.title : input.title.trim()
    const sourceUrl = input.sourceUrl === undefined ? current.source_url : normalizeHttpUrl(input.sourceUrl)
    db.prepare('UPDATE flow_videos SET title=?,source_url=?,author=?,thought=?,updated_at=? WHERE id=?').run(title, sourceUrl, input.author === undefined ? current.author : input.author.trim(), input.thought === undefined ? current.thought : input.thought, timestamp(), id)
    return this.mapFlowVideo(db.prepare('SELECT * FROM flow_videos WHERE id=?').get(id))
  }
  removeFlowVideo(id: string): void { if (getDatabase().prepare('DELETE FROM flow_videos WHERE id=?').run(id).changes !== 1) throw new Error('视频记录不存在') }
  listFlowMonth(month: string): FlowDaySummary[] {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式无效')
    return (getDatabase().prepare(`SELECT d.entry_date,d.video_limit,d.saved_at,COUNT(v.id) AS video_count,SUM(CASE WHEN v.id IS NOT NULL AND TRIM(v.thought)='' THEN 1 ELSE 0 END) AS pending_count FROM flow_days d LEFT JOIN flow_videos v ON v.entry_date=d.entry_date WHERE d.entry_date LIKE ? GROUP BY d.entry_date ORDER BY d.entry_date`).all(`${month}-%`) as any[]).map((row) => ({ date: row.entry_date, videoLimit: row.video_limit, videoCount: row.video_count, pendingThoughtCount: row.pending_count, reviewSaved: Boolean(row.saved_at), overLimit: row.video_count > row.video_limit }))
  }
  getFlowSummary(days = 7, reference = new Date()): FlowSummary {
    if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('统计天数无效')
    const to = localDate(reference); const from = shiftDate(to, 1 - days)
    const row = getDatabase().prepare(`SELECT COALESCE(SUM(CASE WHEN saved_at IS NOT NULL THEN 1 ELSE 0 END),0) AS reviewed_days,COALESCE(SUM(video_count),0) AS video_count,COALESCE(SUM(CASE WHEN video_count>video_limit THEN 1 ELSE 0 END),0) AS over_limit_days,COALESCE(SUM(pending_count),0) AS pending_thoughts FROM (SELECT d.*,COUNT(v.id) AS video_count,SUM(CASE WHEN v.id IS NOT NULL AND TRIM(v.thought)='' THEN 1 ELSE 0 END) AS pending_count FROM flow_days d LEFT JOIN flow_videos v ON v.entry_date=d.entry_date WHERE d.entry_date BETWEEN ? AND ? GROUP BY d.entry_date)`).get(from, to) as any
    return { from, to, reviewedDays: row.reviewed_days, videoCount: row.video_count, overLimitDays: row.over_limit_days, pendingThoughts: row.pending_thoughts }
  }
  nextFlowReviewReminder(reference = new Date()): { date: string; remindAt: Date } | null {
    const settings = this.getSettings(); if (!settings.reviewReminderEnabled) return null
    const date = localDate(reference); const day = this.ensureFlowDay(date); const remindAt = new Date(`${date}T${settings.reviewReminderTime}:00`)
    if (!day.savedAt && !getDatabase().prepare('SELECT reminder_notified_at FROM flow_days WHERE entry_date=?').get(date)?.reminder_notified_at) return { date, remindAt: remindAt <= reference ? reference : remindAt }
    const nextDateValue = shiftDate(date, 1); return { date: nextDateValue, remindAt: new Date(`${nextDateValue}T${settings.reviewReminderTime}:00`) }
  }
  claimFlowReviewReminder(date: string): boolean {
    if (date !== localDate()) return false
    this.ensureFlowDay(date)
    return getDatabase().prepare('UPDATE flow_days SET reminder_notified_at=?,updated_at=? WHERE entry_date=? AND saved_at IS NULL AND reminder_notified_at IS NULL').run(timestamp(), timestamp(), date).changes === 1
  }
  getSettings(): AppSettings { const values = Object.fromEntries((getDatabase().prepare('SELECT key,value FROM app_settings').all() as any[]).map((row) => [row.key, JSON.parse(row.value)])); return { ...defaults, ...values } }
  updateSettings(input: Partial<AppSettings>): AppSettings { const result = { ...this.getSettings(), ...input }; if (!['light', 'dark'].includes(result.theme) || !['comfortable', 'compact'].includes(result.density) || !result.globalShortcut.trim() || !Number.isInteger(result.dailyVideoLimit) || result.dailyVideoLimit < 0 || result.dailyVideoLimit > 10 || typeof result.reviewReminderEnabled !== 'boolean' || !validTime(result.reviewReminderTime)) throw new Error('设置无效'); const db = getDatabase(); const save = db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'); db.transaction(() => { Object.entries(result).forEach(([key, value]) => save.run(key, JSON.stringify(value))); db.prepare('UPDATE flow_days SET video_limit=?,updated_at=? WHERE entry_date=?').run(result.dailyVideoLimit, timestamp(), localDate()) })(); return result }
  dueReminders(reference = new Date()): Array<{ task: Task; remindAt: Date }> { return (getDatabase().prepare("SELECT * FROM tasks WHERE status='active' AND deleted_at IS NULL AND due_date IS NOT NULL AND due_time IS NOT NULL AND reminder_minutes_before IS NOT NULL AND reminder_notified_at IS NULL").all() as any[]).map((row) => { const task = this.mapTask(row); const remindAt = new Date(`${task.dueDate}T${task.dueTime}:00`); remindAt.setMinutes(remindAt.getMinutes() - (task.reminderMinutesBefore ?? 0)); return { task, remindAt } }).filter(({ remindAt }) => remindAt <= reference && reference.getTime() - remindAt.getTime() <= 86400000) }
  nextReminder(): { task: Task; remindAt: Date } | null { const current = new Date(); const items = (getDatabase().prepare("SELECT * FROM tasks WHERE status='active' AND deleted_at IS NULL AND due_date IS NOT NULL AND due_time IS NOT NULL AND reminder_minutes_before IS NOT NULL AND reminder_notified_at IS NULL").all() as any[]).map((row) => { const task = this.mapTask(row); const remindAt = new Date(`${task.dueDate}T${task.dueTime}:00`); remindAt.setMinutes(remindAt.getMinutes() - (task.reminderMinutesBefore ?? 0)); return { task, remindAt } }).filter((item) => item.remindAt > current).sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime()); return items[0] ?? null }
  markReminderNotified(id: string): void { getDatabase().prepare('UPDATE tasks SET reminder_notified_at=?,updated_at=? WHERE id=?').run(timestamp(), timestamp(), id) }
  purgeDeleted(olderThan = new Date(Date.now() - 30 * 86400000)): number { return getDatabase().prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at<?').run(olderThan.toISOString()).changes }

  exportBackup(): BackupPayload { const db = getDatabase(); const tasks = this.listTasks(); return { format: 'rumo-flow-backup', version: 3, exportedAt: timestamp(), taskLists: this.listLists(), tasks, recurrenceRules: (db.prepare('SELECT * FROM recurrence_rules WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NULL)').all() as any[]).map(mapRule), tags: this.listTags(), taskTags: (db.prepare('SELECT task_id AS taskId,tag_id AS tagId FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NULL)').all() as any[]), savedFilters: this.listSavedFilters(), flowDays: (db.prepare('SELECT * FROM flow_days ORDER BY entry_date').all() as any[]).map((row) => this.mapFlowDay(row)), videoReflections: (db.prepare('SELECT * FROM flow_videos ORDER BY entry_date,created_at').all() as any[]).map((row) => this.mapFlowVideo(row)), settings: this.getSettings() } }
  importBackup(payload: BackupPayload): { importedTasks: number; importedLists: number; importedRules: number; importedReviews: number; importedVideos: number } {
    this.validateBackup(payload); const db = getDatabase(); const flowDays = payload.version === 3 ? payload.flowDays ?? [] : []; const videoReflections = payload.version === 3 ? payload.videoReflections ?? [] : []; const folder = path.join(path.dirname(db.name), 'backups'); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, `pre-import-${Date.now()}.json`), JSON.stringify(this.exportBackup(), null, 2))
    db.transaction(() => {
      db.exec('DELETE FROM flow_days; DELETE FROM flow_videos; DELETE FROM recurrence_rules; DELETE FROM task_tags; DELETE FROM tasks; DELETE FROM task_lists; DELETE FROM tags; DELETE FROM saved_filters; DELETE FROM app_settings;')
      const lists = db.prepare('INSERT INTO task_lists(id,name,color,sort_order,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'); payload.taskLists.forEach((x) => lists.run(x.id, x.name, x.color, x.sortOrder, x.isPinned ? 1 : 0, x.createdAt, x.updatedAt))
      const tags = db.prepare('INSERT INTO tags(id,name,color,created_at,updated_at) VALUES (?,?,?,?,?)'); (payload.tags ?? []).forEach((x) => tags.run(x.id, x.name, x.color, x.createdAt, x.updatedAt))
      const tasks = db.prepare('INSERT INTO tasks(id,title,list_id,due_date,due_time,reminder_minutes_before,priority,notes,status,sort_order,is_pinned,parent_task_id,recurrence_rule_id,created_at,updated_at,completed_at,generated_from_task_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL)'); payload.tasks.forEach((x) => tasks.run(x.id, x.title, x.listId, x.dueDate, x.dueTime ?? null, x.reminderMinutesBefore ?? null, x.priority, x.notes, x.status, x.sortOrder, x.isPinned ? 1 : 0, x.recurrenceRuleId, x.createdAt, x.updatedAt, x.completedAt))
      const taskLinks = db.prepare('UPDATE tasks SET parent_task_id=?,generated_from_task_id=? WHERE id=?'); payload.tasks.forEach((x) => taskLinks.run(x.parentTaskId, x.generatedFromTaskId ?? null, x.id))
      const rules = db.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)'); payload.recurrenceRules.forEach((x) => rules.run(x.id, x.taskId, x.frequency, x.interval, JSON.stringify(x.weekdays), x.endDate, x.nextDueDate, x.monthDay ?? null))
      const links = db.prepare('INSERT INTO task_tags(task_id,tag_id) VALUES (?,?)'); (payload.taskTags ?? []).forEach((x) => links.run(x.taskId, x.tagId))
      const filters = db.prepare('INSERT INTO saved_filters(id,name,criteria_json,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)'); (payload.savedFilters ?? []).forEach((x) => filters.run(x.id, x.name, JSON.stringify(x.criteria), x.sortOrder, x.createdAt, x.updatedAt))
      const videos = db.prepare('INSERT INTO flow_videos(id,entry_date,title,source_url,author,thought,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'); videoReflections.forEach((x) => videos.run(x.id, x.date, x.title, x.sourceUrl, x.author, x.thought, x.createdAt, x.updatedAt))
      const days = db.prepare('INSERT INTO flow_days(entry_date,video_limit,did_well,did_not_well,reflection,input_type,input_video_id,input_text,output_text,tomorrow_expectation,saved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'); flowDays.forEach((x) => days.run(x.date, x.videoLimit, x.didWell, x.didNotWell, x.reflection, x.inputType, x.inputVideoId, x.inputText, x.outputText, x.tomorrowExpectation, x.savedAt, x.createdAt, x.updatedAt))
      const settings = db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)'); Object.entries(payload.settings).forEach(([key, value]) => settings.run(key, JSON.stringify(value)))
    })()
    return { importedTasks: payload.tasks.length, importedLists: payload.taskLists.length, importedRules: payload.recurrenceRules.length, importedReviews: flowDays.filter((item) => item.savedAt).length, importedVideos: videoReflections.length }
  }
  private validateBackup(payload: BackupPayload): void {
    if (!payload || ![1, 2, 3].includes(payload.version) || !['rumo-flow-backup', 'rumo-daiban-backup'].includes(payload.format) || !Array.isArray(payload.tasks) || !Array.isArray(payload.taskLists) || !Array.isArray(payload.recurrenceRules)) throw new Error('备份文件格式不受支持')
    const lists = new Set(payload.taskLists.map((x) => x.id)); const tasks = new Set(payload.tasks.map((x) => x.id)); if (lists.size !== payload.taskLists.length || tasks.size !== payload.tasks.length) throw new Error('备份文件包含重复编号')
    payload.tasks.forEach((task) => { if (!task.id || !task.title || (task.listId && !lists.has(task.listId)) || (task.parentTaskId && !tasks.has(task.parentTaskId))) throw new Error('备份任务数据无效'); this.validateTask(task) })
    const rules = new Set(payload.recurrenceRules.map((x) => x.id)); if (rules.size !== payload.recurrenceRules.length || payload.recurrenceRules.some((x) => !tasks.has(x.taskId))) throw new Error('备份重复规则无效')
    if (payload.tasks.some((x) => (x.recurrenceRuleId && !rules.has(x.recurrenceRuleId)) || (x.generatedFromTaskId && !tasks.has(x.generatedFromTaskId)))) throw new Error('备份任务关联无效')
    if (payload.version >= 2) { const tags = new Set((payload.tags ?? []).map((x) => x.id)); if ((payload.taskTags ?? []).some((x) => !tasks.has(x.taskId) || !tags.has(x.tagId))) throw new Error('备份标签关联无效'); (payload.savedFilters ?? []).forEach((x) => this.validateCriteria(x.criteria)) }
    if (payload.version === 3) {
      if (!Array.isArray(payload.flowDays) || !Array.isArray(payload.videoReflections)) throw new Error('心流备份数据缺失')
      const dayDates = new Set(payload.flowDays.map((x) => x.date)); const videoDates = new Map(payload.videoReflections.map((x) => [x.id, x.date])); if (dayDates.size !== payload.flowDays.length || videoDates.size !== payload.videoReflections.length) throw new Error('心流备份包含重复记录')
      payload.flowDays.forEach((x) => { if (!validCalendarDate(x.date) || !Number.isInteger(x.videoLimit) || x.videoLimit < 0 || x.videoLimit > 10 || !['none', 'video', 'other'].includes(x.inputType) || (x.inputType === 'video') !== Boolean(x.inputVideoId) || (x.inputVideoId && videoDates.get(x.inputVideoId) !== x.date)) throw new Error('心流复盘数据无效') })
      payload.videoReflections.forEach((x) => { if (!x.id || !dayDates.has(x.date) || typeof x.title !== 'string') throw new Error('视频复盘数据无效'); normalizeHttpUrl(x.sourceUrl) })
    }
  }
}
