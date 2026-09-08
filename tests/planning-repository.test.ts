import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { planFor } from '../src/shared/planning'
import { taskToDraft } from '../src/shared/drafts'
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-planning-'))
vi.mock('electron', () => ({ app: { getPath: () => directory } }))
const { Repository } = await import('../electron/database/repository')
const { useDatabaseForTests, closeDatabase, getDatabase } = await import('../electron/database/db')
let repository: InstanceType<typeof Repository>
function batch(ids: string[], action: import('../src/shared/contracts').TaskBatchAction) {
  return repository.taskCommands.batch({ targets: ids.map(id => ({ id, updatedAt: repository.tasks.getTask(id).updatedAt })), generation: repository.drafts.get('capture', 'global').generation, action })
}
beforeEach(() => { useDatabaseForTests(path.join(directory, `${crypto.randomUUID()}.sqlite`)); repository = new Repository() })
afterAll(() => { closeDatabase(); fs.rmSync(directory, { recursive: true, force: true }) })

it('persists update-check opt-out in v5 backups and validates boolean input', () => {
  expect(repository.settings.getSettings().automaticUpdateChecks).toBe(true)
  expect(() => repository.settings.updateSettings({ automaticUpdateChecks: 'yes' } as never)).toThrow('自动检查更新')
  repository.settings.updateSettings({ automaticUpdateChecks: false })
  const backup = repository.backup.exportBackup()
  expect(backup.version).toBe(5)
  expect(backup.settings.automaticUpdateChecks).toBe(false)
  repository.settings.updateSettings({ automaticUpdateChecks: true })
  repository.backup.importBackup(backup)
  expect(repository.settings.getSettings().automaticUpdateChecks).toBe(false)
})

it('refines the same task without moving its deadline and generates unplanned recurrence', () => {
  const task = repository.tasks.createTask({ title: '月计划', dueDate: '2026-09-30', plan: planFor('month', '2026-09-07'), recurrence: { frequency: 'daily' } })
  repository.tasks.updateTask(task.id, { plan: planFor('day', '2026-09-07'), focusDate: '2026-09-07' })
  expect(repository.tasks.getTask(task.id)).toMatchObject({ dueDate: '2026-09-30', focusDate: '2026-09-07' })
  repository.tasks.updateTask(task.id, { plan: planFor('week', '2026-09-07') })
  expect(repository.tasks.getTask(task.id).focusDate).toBeNull()
  repository.tasks.completeTask(task.id)
  expect(repository.tasks.listTasks().find(item => item.generatedFromTaskId === task.id)).toMatchObject({ dueDate: '2026-10-01', plan: null, focusDate: null })
})
it('rolls back all batch writes and rejects malformed actions', () => {
  const first = repository.tasks.createTask({ title: '一' })
  const second = repository.tasks.createTask({ title: '二' })
  getDatabase().exec(`CREATE TRIGGER fail_second BEFORE UPDATE ON tasks WHEN OLD.id='${second.id}' BEGIN SELECT RAISE(ABORT, 'forced failure'); END`)
  expect(() => batch([first.id, second.id], { kind: 'plan', plan: planFor('day', '2026-09-07') })).toThrow('forced failure')
  expect(repository.tasks.getTask(first.id).plan).toBeNull()
  expect(() => batch([first.id], { kind: 'plan' } as never)).toThrow()
  expect(() => batch([first.id], { kind: 'move' } as never)).toThrow()
})
it('applies batch lists, tags and deadlines to unique tasks and completes once', () => {
  const task = repository.tasks.createTask({ title: '批量任务', dueDate: '2026-09-07', dueTime: '12:00', reminderMinutesBefore: 5, recurrence: { frequency: 'daily' } })
  const list = repository.organization.createList({ name: '工作' })
  const tag = repository.organization.createTag({ name: '重点' })
  batch([task.id], { kind: 'move', listId: list.id })
  batch([task.id, task.id], { kind: 'tags', tagIds: [tag.id] })
  batch([task.id], { kind: 'deadline', date: null })
  expect(repository.tasks.getTask(task.id)).toMatchObject({ listId: list.id, dueDate: null, dueTime: null, reminderMinutesBefore: null, tags: [{ id: tag.id }] })
  batch([task.id], { kind: 'deadline', date: '2026-09-08' })
  batch([task.id, task.id], { kind: 'complete' })
  expect(repository.tasks.listTasks()).toHaveLength(2)
})
it('rejects a video version changed in the same millisecond', () => {
  const video = repository.flow.createFlowVideo({ date: '2026-09-07', sourceUrl: 'https://example.com/video' })
  const changed = repository.flow.updateFlowVideo(video.id, { thought: '新正文' })
  expect(changed.updatedAt).not.toBe(video.updatedAt)
  expect(() => repository.actions.create({ requestId: crypto.randomUUID(), source: { kind: 'video', key: video.id }, sourceUpdatedAt: video.updatedAt, task: { title: '旧正文行动' } })).toThrow('已变化')
})
it('rejects batch plans with a pending draft and preserves both records under a fixed clock', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-07T12:00:00'))
  try {
    const task = repository.tasks.createTask({ title: '原任务' })
    const snapshot = repository.drafts.get('task', task.id)
    const saved = repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '未保存标题' } })
    expect(() => batch([task.id], { kind: 'plan', plan: planFor('week', '2026-09-07') })).toThrow('未保存修改')
    expect(repository.tasks.getTask(task.id).plan).toBeNull()
    expect(repository.drafts.get('task', task.id)).toEqual(saved)
    expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id })).not.toThrow()
  } finally { vi.useRealTimers() }
})
it('deduplicates overlapping deletion roots and recovers only same-operation children', () => {
  const parent = repository.tasks.createTask({ title: '父' })
  const old = repository.tasks.createTask({ title: '先删', parentTaskId: parent.id })
  const child = repository.tasks.createTask({ title: '同删', parentTaskId: parent.id })
  repository.tasks.removeTask(old.id)
  batch([child.id, parent.id, child.id], { kind: 'remove' })
  expect(repository.tasks.getTask(child.id).deletionBatch).toBe(repository.tasks.getTask(parent.id).deletionBatch)
  repository.tasks.recoverTask(parent.id)
  expect(repository.tasks.getTask(child.id).deletedAt).toBeNull()
  expect(repository.tasks.getTask(old.id).deletedAt).not.toBeNull()
})
it('never purges younger descendants during 30-day cleanup', () => {
  const parent = repository.tasks.createTask({ title: '父' })
  const child = repository.tasks.createTask({ title: '子', parentTaskId: parent.id })
  const grandchild = repository.tasks.createTask({ title: '孙', parentTaskId: child.id })
  repository.tasks.removeTask(parent.id)
  getDatabase().prepare("UPDATE tasks SET deleted_at='2026-07-01T00:00:00Z' WHERE id IN (?,?)").run(parent.id, child.id)
  repository.tasks.purgeDeleted(new Date('2026-08-01T00:00:00Z'))
  expect(repository.tasks.getTask(grandchild.id)).toMatchObject({ parentTaskId: null })
  repository.tasks.recoverTask(grandchild.id)
  expect(repository.tasks.listTasks()).toHaveLength(1)
})
it('recovers explicitly selected descendants after parents without detaching them', () => {
  const list = repository.organization.createList({ name: '将删除的清单' })
  const parent = repository.tasks.createTask({ title: '父', listId: list.id })
  const child = repository.tasks.createTask({ title: '子', parentTaskId: parent.id, listId: list.id })
  repository.tasks.removeTask(child.id)
  repository.tasks.removeTask(parent.id)
  repository.organization.removeList(list.id)
  batch([child.id, parent.id], { kind: 'recover' })
  expect(repository.tasks.getTask(child.id)).toMatchObject({ parentTaskId: parent.id, listId: null, deletedAt: null })
})
it('keeps source links out of recurring instances and retains a tombstone after task purge', () => {
  const review = repository.flow.saveFlowReview({ date: '2026-09-07' })
  const task = repository.actions.create({ requestId: crypto.randomUUID(), source: { kind: 'review', key: review.date }, sourceUpdatedAt: review.updatedAt, task: { title: '重复行动', dueDate: review.date, recurrence: { frequency: 'daily' } } })
  repository.tasks.completeTask(task.id)
  const next = repository.tasks.listTasks().find(item => item.generatedFromTaskId === task.id)!
  expect(repository.actions.related(undefined, next.id)).toEqual([])
  repository.tasks.removeTask(task.id)
  batch([task.id], { kind: 'purge' })
  expect(repository.actions.related()[0]).toMatchObject({ taskId: null, task: null, sourceDeleted: false })
})
it('rolls migration DDL back if the final schema-version write fails', async () => {
  const { migratePlanning } = await import('../electron/database/planning-migration')
  const database = new Database(':memory:')
  try {
    database.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY,deleted_at TEXT); CREATE TABLE flow_videos(id TEXT); CREATE TABLE flow_days(entry_date TEXT); CREATE TABLE editor_drafts(kind TEXT,payload TEXT,version INTEGER); CREATE TABLE schema_migrations(version INTEGER,applied_at TEXT); CREATE TRIGGER reject_migration BEFORE INSERT ON schema_migrations BEGIN SELECT RAISE(ABORT,'migration failure'); END")
    expect(() => migratePlanning(database, 8)).toThrow('migration failure')
    expect((database.pragma('table_info(tasks)') as { name: string }[]).map(column => column.name)).toEqual(['id', 'deleted_at'])
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name='action_links'").get()).toBeUndefined()
  } finally { database.close() }
})
it('rejects malformed v5 fields before replacing the current database', () => {
  const task = repository.tasks.createTask({ title: '保留数据' })
  const backup = repository.backup.exportBackup()
  delete (backup.tasks[0] as Partial<typeof task>).plan
  expect(() => repository.backup.importBackup(backup)).toThrow()
  expect(repository.tasks.getTask(task.id).title).toBe('保留数据')
})
it('creates multiple linked tasks idempotently and retains provenance after source deletion', () => {
  const source = repository.flow.createFlowVideo({ date: '2026-09-07', sourceUrl: 'https://example.com/video', title: '来源' })
  const input = { requestId: crypto.randomUUID(), source: { kind: 'video' as const, key: source.id }, sourceUpdatedAt: source.updatedAt, task: { title: '行动' } }
  const task = repository.actions.create(input)
  expect(repository.actions.create(input).id).toBe(task.id)
  repository.actions.create({ ...input, requestId: crypto.randomUUID() })
  expect(repository.actions.links(input.source)).toHaveLength(2)
  repository.flow.removeFlowVideo(source.id)
  expect(repository.actions.links(undefined, task.id)[0]).toMatchObject({ sourceDeleted: true, sourceLabel: '来源' })
  expect(repository.tasks.getTask(task.id).title).toBe('行动')
})
it('rejects unsaved, dirty and stale action sources without creating tasks', () => {
  const date = '2026-09-07'
  const review = repository.flow.getFlowDay(date).review
  const input = { requestId: crypto.randomUUID(), source: { kind: 'review' as const, key: date }, sourceUpdatedAt: review.updatedAt, task: { title: '行动' } }
  expect(() => repository.actions.create(input)).toThrow('先保存')
  const saved = repository.flow.saveFlowReview({ date, reflection: '正文' })
  expect(() => repository.actions.create(input)).toThrow('已变化')
  const snapshot = repository.drafts.get('review', date)
  repository.drafts.put({ ...snapshot, kind: 'review', key: date, payload: { ...saved, reflection: '草稿' } })
  expect(() => repository.actions.create({ ...input, sourceUpdatedAt: saved.updatedAt })).toThrow('未保存修改')
  expect(repository.tasks.listTasks()).toHaveLength(0)
})
it('rolls task creation back if inserting the source link fails', () => {
  const review = repository.flow.saveFlowReview({ date: '2026-09-07' })
  getDatabase().exec("CREATE TRIGGER fail_link BEFORE INSERT ON action_links BEGIN SELECT RAISE(ABORT, 'link failure'); END")
  expect(() => repository.actions.create({ requestId: crypto.randomUUID(), source: { kind: 'review', key: review.date }, sourceUpdatedAt: review.updatedAt, task: { title: '行动' } })).toThrow('link failure')
  expect(repository.tasks.listTasks()).toHaveLength(0)
})
it('searches formal content literally and derives selected-day task facts', () => {
  const task = repository.tasks.createTask({ title: '100%_计划', plan: planFor('day', '2026-09-07') })
  repository.tasks.createTask({ title: '100其他计划' })
  repository.flow.saveFlowReview({ date: '2026-09-07', reflection: '100%_计划复盘' })
  expect(repository.actions.search('100%_').map(hit => hit.kind)).toEqual(['task', 'review'])
  expect(repository.actions.facts('2026-09-07').pending.map(item => item.id)).toEqual([task.id])
  repository.tasks.removeTask(task.id)
  expect(repository.actions.search('100%_')).toHaveLength(1)
})
it('round trips v5 plans, trash, action tombstones and drafts and rejects v1-v4', () => {
  const review = repository.flow.saveFlowReview({ date: '2026-09-07' })
  const task = repository.actions.create({ requestId: crypto.randomUUID(), source: { kind: 'review', key: review.date }, sourceUpdatedAt: review.updatedAt, task: { title: '行动', plan: planFor('week', review.date) } })
  repository.tasks.removeTask(task.id)
  const snapshot = repository.drafts.get('capture', 'global')
  repository.drafts.put({ ...snapshot, kind: 'capture', key: 'global', payload: { title: '暂存' } })
  const backup = repository.backup.exportBackup()
  repository.backup.importBackup(backup)
  expect(repository.tasks.getTask(task.id)).toMatchObject({ plan: task.plan, deletedAt: expect.any(String) })
  expect(repository.actions.links()).toHaveLength(1)
  for (const version of [1, 2, 3, 4]) expect(() => repository.backup.importBackup({ ...backup, version } as never)).toThrow('仅支持 v5')
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '暂存' })
})
it('takes a consistent v8 snapshot once and upgrades task drafts without inferring plans', () => {
  const task = repository.tasks.createTask({ title: '旧任务', dueDate: '2026-09-07' })
  const snapshot = repository.drafts.get('task', task.id)
  repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: taskToDraft(task) })
  const database = getDatabase()
  database.exec("UPDATE editor_drafts SET version=1,payload=json_remove(payload,'$.plan','$.focusDate'); DROP TRIGGER action_video_removed; DROP TRIGGER action_review_removed; DROP TABLE action_links; DROP INDEX idx_tasks_deletion_batch; ALTER TABLE tasks DROP COLUMN plan_json; ALTER TABLE tasks DROP COLUMN focus_date; ALTER TABLE tasks DROP COLUMN deletion_batch; DELETE FROM schema_migrations WHERE version=9;")
  const before = fs.existsSync(path.join(directory, 'backups')) ? fs.readdirSync(path.join(directory, 'backups')) : []
  closeDatabase()
  expect(repository.tasks.getTask(task.id)).toMatchObject({ dueDate: '2026-09-07', plan: null, focusDate: null })
  const snapshots = fs.readdirSync(path.join(directory, 'backups')).filter(file => !before.includes(file))
  expect(snapshots).toHaveLength(1)
  const old = new Database(path.join(directory, 'backups', snapshots[0]), { readonly: true })
  expect(old.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 8 })
  expect(old.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]); old.close()
  expect(repository.drafts.get('task', task.id).record).toMatchObject({ version: 2, payload: { plan: null, focusDate: null } })
  closeDatabase(); repository.tasks.getTask(task.id)
  expect(fs.readdirSync(path.join(directory, 'backups')).length).toBe(before.length + 1)
})
