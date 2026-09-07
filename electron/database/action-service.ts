import { getDatabase } from './db'
import { timestamp, validCalendarDate } from './common'
import { inPlan, localDay } from '../../src/shared/planning'
import type { ActionLink, ActionLinkView, ActionSource, CreateActionInput, SearchHit, Task } from '../../src/shared/contracts'
import type { TaskRepository } from './tasks'

export class ActionService {
  constructor(private readonly tasks: TaskRepository) {}
  links(source?: ActionSource, taskId?: string): ActionLink[] {
    if (source && (!['review', 'video'].includes(source.kind) || typeof source.key !== 'string' || !source.key)) throw new Error('行动来源无效')
    if (taskId !== undefined && (typeof taskId !== 'string' || !taskId)) throw new Error('任务编号无效')
    const clauses: string[] = []
    const parameters: string[] = []
    if (source) { clauses.push('source_kind=? AND source_key=?'); parameters.push(source.kind, source.key) }
    if (taskId) { clauses.push('task_id=?'); parameters.push(taskId) }
    return (getDatabase().prepare(`SELECT request_id AS requestId,task_id AS taskId,source_kind AS sourceKind,source_key AS sourceKey,source_label AS sourceLabel,source_date AS sourceDate,created_at AS createdAt,source_deleted AS sourceDeleted FROM action_links ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at`).all(...parameters) as ActionLink[]).map(link => ({ ...link, sourceDeleted: Boolean(link.sourceDeleted) }))
  }
  create(input: CreateActionInput): Task {
    if (!input || typeof input.requestId !== 'string' || !/^[\w-]{8,100}$/.test(input.requestId) || !input.source || !['review','video'].includes(input.source.kind) || typeof input.source.key !== 'string' || typeof input.sourceUpdatedAt !== 'string') throw new Error('行动来源无效')
    const db = getDatabase()
    return db.transaction(() => {
      const existing = db.prepare('SELECT task_id AS taskId,source_kind AS sourceKind,source_key AS sourceKey FROM action_links WHERE request_id=?').get(input.requestId) as Pick<ActionLink, 'taskId' | 'sourceKind' | 'sourceKey'> | undefined
      if (existing) {
        if (existing.sourceKind !== input.source.kind || existing.sourceKey !== input.source.key) throw new Error('请求编号已使用')
        if (!existing.taskId) throw new Error('此次创建的任务已永久删除，请重新发起')
        return this.tasks.getTask(existing.taskId)
      }
      const review = input.source.kind === 'review'
      const source = db.prepare(review ? 'SELECT saved_at,updated_at,entry_date AS date,tomorrow_expectation AS label FROM flow_days WHERE entry_date=?' : 'SELECT updated_at,entry_date AS date,COALESCE(NULLIF(title,\'\'),thought) AS label FROM flow_videos WHERE id=?').get(input.source.key) as { updated_at: string; date: string; label: string; saved_at?: string } | undefined
      if (!source || (review && !source.saved_at)) throw new Error('请先保存来源正文')
      if (source.updated_at !== input.sourceUpdatedAt) throw new Error('来源已变化，请重新打开后创建')
      if (db.prepare('SELECT 1 FROM editor_drafts WHERE kind=? AND entity_key=? AND payload IS NOT NULL').get(input.source.kind, input.source.key)) throw new Error('来源还有未保存修改，请先保存正文')
      const task = this.tasks.createTask(input.task)
      db.prepare('INSERT INTO action_links(request_id,task_id,source_kind,source_key,source_label,source_date,created_at) VALUES (?,?,?,?,?,?,?)').run(input.requestId, task.id, input.source.kind, input.source.key, (source.label || `${source.date} 复盘`).slice(0, 200), source.date, timestamp())
      return task
    })()
  }
  related(source?: ActionSource, taskId?: string): ActionLinkView[] {
    const query = getDatabase().prepare('SELECT id,title,status,deleted_at AS deletedAt FROM tasks WHERE id=?')
    return this.links(source, taskId).map(link => ({ ...link, task: link.taskId ? query.get(link.taskId) as ActionLinkView['task'] : null }))
  }
  facts(date: string): { completed: Task[]; pending: Task[] } {
    if (!validCalendarDate(date)) throw new Error('复盘日期无效')
    const tasks = this.tasks.listTasks()
    return { completed: tasks.filter(task => task.status === 'completed' && task.completedAt && localDay(new Date(task.completedAt)) === date), pending: tasks.filter(task => task.status === 'active' && inPlan(task, 'day', date)) }
  }
  search(text: string): SearchHit[] {
    if (typeof text !== 'string' || text.length > 500) throw new Error('搜索内容无效')
    if (!text.trim()) return []
    const pattern = `%${text.trim().replace(/[\\%_]/g, value => `\\${value}`)}%`
    const db = getDatabase()
    const tasks = db.prepare("SELECT 'task' AS kind,id AS key,due_date AS date,title,substr(notes,1,160) AS excerpt FROM tasks WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT 60").all(pattern, pattern)
    const videos = db.prepare("SELECT 'video' AS kind,id AS key,entry_date AS date,COALESCE(NULLIF(title,''),'视频思考') AS title,substr(thought,1,160) AS excerpt FROM flow_videos WHERE (title || ' ' || author || ' ' || thought) LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 60").all(pattern)
    const reviews = db.prepare("SELECT 'review' AS kind,entry_date AS key,entry_date AS date,entry_date || ' 每日复盘' AS title,substr(reflection || ' ' || tomorrow_expectation,1,160) AS excerpt FROM flow_days WHERE saved_at IS NOT NULL AND (did_well || ' ' || did_not_well || ' ' || reflection || ' ' || input_text || ' ' || output_text || ' ' || tomorrow_expectation) LIKE ? ESCAPE '\\' ORDER BY entry_date DESC LIMIT 60").all(pattern)
    return [...tasks, ...videos, ...reviews] as SearchHit[]
  }
}
