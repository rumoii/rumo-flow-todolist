import { getDatabase } from './db'
import { timestamp, validCalendarDate } from './common'
import { draftToTask } from '../../src/shared/drafts'
import { validPlan } from '../../src/shared/planning'
import type { DraftPayloads, DraftKind, DraftRecord, DraftRef, DraftSnapshot, DraftWrite } from '../../src/shared/drafts'
import { parseQuickAdd } from '../../src/shared/quick-add'
import type { BackupPayload } from '../../src/shared/contracts'
import type { TaskRepository } from './tasks'
import type { FlowRepository } from './flow'
import type { OrganizationRepository } from './organization'
interface DraftRow {
  kind: DraftKind
  entity_key: string
  version: 2
  revision: number
  base_updated_at: string | null
  payload: string | null
  updated_at: string
}
const kinds = ['task', 'review', 'video', 'capture']
export function validateDraftPayload(kind: DraftKind, key: string, value: unknown): void {
  if (!kinds.includes(kind) || typeof key !== 'string' || !key || key.length > 200)
    throw new Error('草稿编号无效')
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('草稿内容无效')
  const payload = value as Record<string, unknown>
  const stringFields = kind === 'task' ? ['title', 'dueDate', 'dueTime', 'priority', 'notes', 'recurrence', 'recurrenceEnd'] : kind === 'review' ? ['date'] : kind === 'video' ? ['title', 'sourceUrl', 'author', 'thought'] : ['title']
  if (stringFields.some(field => typeof payload[field] !== 'string'))
    throw new Error('草稿字段无效')
  if (JSON.stringify(payload).length > 1000000)
    throw new Error('草稿内容过长')
  if (kind === 'capture' && key !== 'global')
    throw new Error('捕获草稿编号无效')
  if (kind === 'review') {
    if (!validCalendarDate(key) || payload.date !== key)
      throw new Error('复盘草稿日期无效')
    for (const field of ['didWell', 'didNotWell', 'reflection', 'inputText', 'outputText', 'tomorrowExpectation']) {
      if (payload[field] !== undefined && typeof payload[field] !== 'string')
        throw new Error('复盘草稿字段无效')
    }
    if (payload.inputType !== undefined && !['none', 'video', 'other'].includes(String(payload.inputType)))
      throw new Error('复盘草稿输入无效')
    if (payload.inputVideoId != null && typeof payload.inputVideoId !== 'string')
      throw new Error('复盘草稿关联无效')
  }
  if (kind === 'task') {
    if (!validPlan(payload.plan) || (payload.focusDate !== null && (typeof payload.focusDate !== 'string' || !payload.plan || (payload.plan as { kind: string; start: string }).kind !== 'day' || (payload.plan as { start: string }).start !== payload.focusDate))) throw new Error('草稿安排无效')
    if (payload.listId !== null && typeof payload.listId !== 'string')
      throw new Error('清单草稿无效')
    if (!Array.isArray(payload.tagIds) || payload.tagIds.some(tag => typeof tag !== 'string'))
      throw new Error('标签草稿无效')
    if (!['none', 'low', 'medium', 'high'].includes(String(payload.priority)) || !['none', 'daily', 'weekly', 'monthly'].includes(String(payload.recurrence)))
      throw new Error('任务草稿选项无效')
    if (payload.reminderMinutesBefore !== null && ![5, 15, 60, 1440].includes(Number(payload.reminderMinutesBefore)))
      throw new Error('提醒草稿无效')
    if (payload.recurrenceInterval !== undefined && (!Number.isInteger(payload.recurrenceInterval) || Number(payload.recurrenceInterval) < 1))
      throw new Error('重复间隔无效')
    if (payload.recurrenceWeekdays !== undefined && (!Array.isArray(payload.recurrenceWeekdays) || payload.recurrenceWeekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)))
      throw new Error('重复日期无效')
  }
}
export class DraftRepository {
  constructor(private readonly tasks: TaskRepository, private readonly flow: FlowRepository, private readonly organization: OrganizationRepository) { }
  private generation(): string {
    return (getDatabase().prepare('SELECT generation FROM editor_draft_meta WHERE id=1').get() as {
      generation: string
    }).generation
  }
  private base(kind: DraftKind, key: string): string | null {
    if (!kinds.includes(kind) || typeof key !== 'string' || !key)
      throw new Error('草稿编号无效')
    if (kind === 'capture') {
      if (key !== 'global')
        throw new Error('捕获草稿编号无效')
      return null
    }
    if (kind === 'review') {
      if (!validCalendarDate(key))
        throw new Error('复盘草稿日期无效')
      return (getDatabase().prepare('SELECT saved_at FROM flow_days WHERE entry_date=?').get(key) as {
        saved_at: string | null
      } | undefined)?.saved_at ?? null
    }
    const row = kind === 'task'
      ? getDatabase().prepare('SELECT updated_at FROM tasks WHERE id=? AND deleted_at IS NULL').get(key)
      : getDatabase().prepare('SELECT updated_at FROM flow_videos WHERE id=?').get(key)
    if (!row)
      throw new Error('草稿对应的记录不存在')
    return (row as {
      updated_at: string
    }).updated_at
  }
  private map(row: DraftRow): DraftRecord {
    return { kind: row.kind, key: row.entity_key, version: row.version, revision: row.revision, baseUpdatedAt: row.base_updated_at, payload: JSON.parse(row.payload!), updatedAt: row.updated_at } as DraftRecord
  }
  get(kind: DraftKind, key: string): DraftSnapshot {
    const row = getDatabase().prepare('SELECT * FROM editor_drafts WHERE kind=? AND entity_key=?').get(kind, key) as DraftRow | undefined
    let baseUpdatedAt: string | null
    try {
      baseUpdatedAt = this.base(kind, key)
    }
    catch (error) {
      if (!row || row.payload !== null)
        throw error
      baseUpdatedAt = null
    }
    return { generation: this.generation(), revision: row?.revision ?? 0, baseUpdatedAt, record: row?.payload ? this.map(row) : null }
  }
  private check(input: DraftRef): DraftSnapshot {
    const snapshot = this.get(input.kind, input.key)
    if (input.generation !== snapshot.generation)
      throw new Error('数据已恢复，请重新打开编辑器')
    if (!Number.isSafeInteger(input.revision) || input.revision !== snapshot.revision)
      throw new Error('草稿已变化，请重新打开编辑器')
    return snapshot
  }
  put(input: DraftWrite): DraftSnapshot {
    validateDraftPayload(input.kind, input.key, input.payload)
    if (input.baseUpdatedAt !== null && typeof input.baseUpdatedAt !== 'string')
      throw new Error('草稿基准无效')
    return getDatabase().transaction(() => {
      this.check(input)
      this.base(input.kind, input.key)
      const payload = input.payload
      if (input.kind === 'task') {
        const task = payload as DraftPayloads['task']
        if (task.listId && !getDatabase().prepare('SELECT 1 FROM task_lists WHERE id=?').get(task.listId))
          throw new Error('草稿清单已删除，请重新打开编辑器')
        if (task.tagIds.some(id => !getDatabase().prepare('SELECT 1 FROM tags WHERE id=?').get(id)))
          throw new Error('草稿标签已删除，请重新打开编辑器')
      }
      if (input.kind === 'review') {
        const review = payload as DraftPayloads['review']
        if (review.inputVideoId && !getDatabase().prepare('SELECT 1 FROM flow_videos WHERE id=? AND entry_date=?').get(review.inputVideoId, input.key))
          throw new Error('草稿视频已删除，请重新打开编辑器')
      }
      getDatabase().prepare(`INSERT INTO editor_drafts(kind,entity_key,version,revision,base_updated_at,payload,updated_at) VALUES (?,?,2,?,?,?,?)
    ON CONFLICT(kind,entity_key) DO UPDATE SET revision=excluded.revision,base_updated_at=excluded.base_updated_at,payload=excluded.payload,updated_at=excluded.updated_at`)
        .run(input.kind, input.key, input.revision + 1, input.baseUpdatedAt, JSON.stringify(input.payload), timestamp())
      return this.get(input.kind, input.key)
    })()
  }
  discard(input: DraftRef): DraftSnapshot {
    return getDatabase().transaction(() => {
      this.check(input)
      getDatabase().prepare(`INSERT INTO editor_drafts(kind,entity_key,version,revision,payload,updated_at) VALUES (?,?,2,?,NULL,?)
    ON CONFLICT(kind,entity_key) DO UPDATE SET revision=excluded.revision,payload=NULL,updated_at=excluded.updated_at`)
        .run(input.kind, input.key, input.revision + 1, timestamp())
      return this.get(input.kind, input.key)
    })()
  }
  commit(input: DraftRef & {
    acceptChanges?: boolean
  }): unknown {
    return getDatabase().transaction(() => {
      const snapshot = this.check(input)
      const record = snapshot.record
      if (!record)
        throw new Error('没有可提交的草稿')
      if (this.base(input.kind, input.key) !== record.baseUpdatedAt && input.acceptChanges !== true)
        throw new Error('正式记录已变化，请确认后重新保存')
      let result: unknown
      if (record.kind === 'task')
        result = this.tasks.updateTask(record.key, draftToTask(record.payload))
      else if (record.kind === 'review')
        result = this.flow.saveFlowReview(record.payload)
      else if (record.kind === 'video')
        result = this.flow.updateFlowVideo(record.key, record.payload)
      else {
        const tags = this.organization.listTags()
        const parsed = parseQuickAdd(record.payload.title, this.organization.listLists(), tags)
        const tagIds = [...new Set(parsed.tagNames)].map(name => {
          const existing = tags.find(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())
          if (existing)
            return existing.id
          const created = this.organization.createTag({ name })
          tags.push(created)
          return created.id
        })
        result = this.tasks.createTask({ ...parsed.input, tagIds: [...new Set([...(parsed.input.tagIds ?? []), ...tagIds])] })
      }
      this.discard(input)
      return result
    })()
  }
  list(): DraftRecord[] {
    return (getDatabase().prepare('SELECT * FROM editor_drafts WHERE payload IS NOT NULL ORDER BY kind,entity_key').all() as DraftRow[]).map(row => this.map(row))
  }
  validateBackup(payload: BackupPayload): void {
    if (!Array.isArray(payload.drafts))
      throw new Error('备份草稿缺失')
    const identities = new Set<string>()
    for (const draft of payload.drafts) {
      if (!draft || draft.version !== 2 || !Number.isSafeInteger(draft.revision) || draft.revision < 1 || typeof draft.updatedAt !== 'string' || (draft.baseUpdatedAt !== null && typeof draft.baseUpdatedAt !== 'string'))
        throw new Error('备份草稿格式无效')
      validateDraftPayload(draft.kind, draft.key, draft.payload)
      const identity = `${draft.kind}:${draft.key}`
      if (identities.has(identity))
        throw new Error('备份草稿重复')
      identities.add(identity)
      if (draft.kind === 'task') {
        if (!payload.tasks.some(task => task.id === draft.key))
          throw new Error('备份任务草稿关联无效')
        if (draft.payload.listId && !payload.taskLists.some(list => list.id === draft.payload.listId))
          throw new Error('备份清单草稿关联无效')
        if (draft.payload.tagIds.some(id => !payload.tags?.some(tag => tag.id === id)))
          throw new Error('备份标签草稿关联无效')
      }
      if (draft.kind === 'video' && !payload.videoReflections?.some(video => video.id === draft.key))
        throw new Error('备份视频草稿关联无效')
      if (draft.kind === 'review' && draft.payload.inputVideoId && !payload.videoReflections?.some(video => video.id === draft.payload.inputVideoId && video.date === draft.key))
        throw new Error('备份复盘草稿关联无效')
    }
  }
  replace(records: DraftRecord[]): void {
    getDatabase().exec('DELETE FROM editor_drafts; UPDATE editor_draft_meta SET generation=lower(hex(randomblob(16))) WHERE id=1;')
    const insert = getDatabase().prepare('INSERT INTO editor_drafts(kind,entity_key,version,revision,base_updated_at,payload,updated_at) VALUES (?,?,?,?,?,?,?)')
    for (const record of records)
      insert.run(record.kind, record.key, record.version, record.revision, record.baseUpdatedAt, JSON.stringify(record.payload), record.updatedAt)
  }
}
