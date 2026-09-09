import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrateComposers } from '../electron/database/composer-migration'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { taskToDraft } from '../src/shared/drafts'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-drafts-'))
vi.mock('electron', () => ({ app: { getPath: () => directory } }))
const { Repository } = await import('../electron/database/repository')
const { useDatabaseForTests, closeDatabase, getDatabase } = await import('../electron/database/db')
let repository: InstanceType<typeof Repository>

it('snapshots schema 9 once and preserves its data and draft cleanup triggers', () => {
  const task = repository.tasks.createTask({ title: '升级前任务' })
  repository.drafts.put({ ...repository.drafts.get('task', task.id), kind: 'task', key: task.id, payload: { ...taskToDraft(task), notes: '未提交内容' } })
  const database = getDatabase()
  database.exec('DELETE FROM schema_migrations WHERE version=10')
  const backupDirectory = path.join(directory, 'backups')
  const before = fs.existsSync(backupDirectory) ? fs.readdirSync(backupDirectory) : []
  closeDatabase()
  expect(repository.tasks.getTask(task.id).title).toBe('升级前任务')
  expect(repository.drafts.get('task', task.id).record?.payload).toMatchObject({ notes: '未提交内容' })
  const added = fs.readdirSync(backupDirectory).filter(file => !before.includes(file))
  expect(added).toHaveLength(1)
  const snapshot = new Database(path.join(backupDirectory, added[0]), { readonly: true })
  try {
    expect(snapshot.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    expect(snapshot.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 })
    expect(snapshot.prepare('SELECT title FROM tasks WHERE id=?').get(task.id)).toEqual({ title: '升级前任务' })
    expect(snapshot.prepare('SELECT payload FROM editor_drafts WHERE entity_key=?').get(task.id)).toMatchObject({ payload: expect.stringContaining('未提交内容') })
  } finally { snapshot.close() }
  repository.tasks.removeTask(task.id)
  expect(repository.drafts.get('task', task.id).record).toBeNull()
  closeDatabase()
  repository.tasks.listTasks()
  expect(fs.readdirSync(backupDirectory)).toHaveLength(before.length + 1)
})

it('rolls composer schema, triggers and draft contents back if version registration fails', () => {
  const database = new Database(':memory:')
  try {
    database.exec("CREATE TABLE schema_migrations(version INTEGER,applied_at TEXT); CREATE TABLE editor_drafts(kind TEXT,entity_key TEXT,version INTEGER,revision INTEGER,base_updated_at TEXT,payload TEXT,updated_at TEXT); INSERT INTO editor_drafts VALUES('capture','global',2,4,NULL,'original','now'); CREATE TRIGGER preserve_trigger AFTER INSERT ON editor_drafts BEGIN SELECT 1; END; CREATE TRIGGER reject_version BEFORE INSERT ON schema_migrations BEGIN SELECT RAISE(ABORT,'migration failure'); END")
    expect(() => migrateComposers(database, 8)).toThrow('migration failure')
    expect(database.prepare('SELECT payload,revision FROM editor_drafts').get()).toEqual({ payload: 'original', revision: 4 })
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name='editor_drafts_new'").get()).toBeUndefined()
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name='preserve_trigger'").get()).toEqual({ name: 'preserve_trigger' })
    expect(database.prepare('SELECT * FROM schema_migrations').all()).toEqual([])
  } finally { database.close() }
})

it('persists composer context and consumes each draft atomically without duplicate creation', () => {
  const parent = repository.tasks.createTask({ title: '父任务' })
  for (const [kind, key, payload] of [
    ['quickTask', 'global', { title: '原计划任务', contextDate: '2026-09-08', listId: null, plan: { kind: 'day', start: '2026-09-08' } }],
    ['subtask', parent.id, { title: '子任务' }],
    ['videoLink', '2026-09-08', { sourceUrl: 'https://example.com/watch' }],
  ] as const) {
    const snapshot = repository.drafts.get(kind, key)
    const saved = repository.drafts.put({ ...snapshot, kind, key, payload })
    closeDatabase()
    expect(repository.drafts.get(kind, key).record?.payload).toEqual(payload)
    const created = repository.drafts.commit({ ...saved, kind, key })
    expect(created).toBeTruthy()
    expect(repository.drafts.get(kind, key).record).toBeNull()
    expect(() => repository.drafts.commit({ ...saved, kind, key })).toThrow()
  }
  expect(repository.tasks.listTasks().find(task => task.title === '原计划任务')?.plan).toEqual({ kind: 'day', start: '2026-09-08' })
  expect(repository.tasks.listTasks().find(task => task.title === '子任务')?.parentTaskId).toBe(parent.id)
})

it('exports only v6 and rejects v5 before replacing any data', () => {
  repository.tasks.createTask({ title: '保留' })
  const backup = repository.backup.exportBackup()
  expect(backup.version).toBe(6)
  expect(() => repository.backup.importBackup({ ...backup, version: 5 } as never)).toThrow('仅支持 v6')
  expect(repository.tasks.listTasks()).toHaveLength(1)
})

it('keeps composer text after failed creation and round trips all new draft kinds in v6', () => {
  const parent = repository.tasks.createTask({ title: '父任务' })
  const entries = [
    { kind: 'subtask', key: parent.id, payload: { title: '待创建子任务' } },
    { kind: 'quickTask', key: 'global', payload: { title: '待创建', contextDate: '2026-09-08', listId: null, plan: null } },
    { kind: 'videoLink', key: '2026-09-08', payload: { sourceUrl: 'not a url' } },
  ] as const
  for (const entry of entries) repository.drafts.put({ ...repository.drafts.get(entry.kind, entry.key), ...entry })
  const backup = repository.backup.exportBackup()
  repository.backup.importBackup(backup)
  for (const entry of entries) expect(repository.drafts.get(entry.kind, entry.key).record?.payload).toEqual(entry.payload)
  const snapshot = repository.drafts.get('videoLink', '2026-09-08')
  expect(() => repository.drafts.commit({ ...snapshot, kind: 'videoLink', key: '2026-09-08' })).toThrow()
  expect(repository.drafts.get('videoLink', '2026-09-08').record).not.toBeNull()
  getDatabase().exec("CREATE TRIGGER fail_composer_cleanup BEFORE UPDATE ON editor_drafts BEGIN SELECT RAISE(ABORT, 'disk failure'); END")
  expect(() => repository.drafts.commit({ ...repository.drafts.get('quickTask', 'global'), kind: 'quickTask', key: 'global' })).toThrow('disk failure')
  expect(repository.tasks.listTasks()).toHaveLength(1)
  expect(repository.drafts.get('quickTask', 'global').record).not.toBeNull()
})

it('rejects reminders without a deadline time and retains an invalid intermediate draft', () => {
  expect(() => repository.tasks.createTask({ title: '提醒', dueDate: '2030-01-01', reminderMinutesBefore: 15 })).toThrow('日期和时间')
  const task = repository.tasks.createTask({ title: '有效' })
  const snapshot = repository.drafts.put({ ...repository.drafts.get('task', task.id), kind: 'task', key: task.id, payload: { ...taskToDraft(task), dueDate: '2030-01-01', reminderMinutesBefore: 15 } })
  expect(() => repository.drafts.commit({ ...snapshot, kind: 'task', key: task.id })).toThrow('日期和时间')
  expect(repository.drafts.get('task', task.id).record).not.toBeNull()
  expect(repository.tasks.getTask(task.id).reminderMinutesBefore).toBeNull()
})

it('rejects a conflict confirmation if the formal task changes again', () => {
  const task = repository.tasks.createTask({ title: '原始任务' })
  const saved = repository.drafts.put({ ...repository.drafts.get('task', task.id), kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '我的修改' } })
  const first = repository.tasks.updateTask(task.id, { title: '他处修改' })
  const second = repository.tasks.updateTask(task.id, { title: '再次修改' })
  expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id, acceptChanges: true, expectedBaseUpdatedAt: first.updatedAt })).toThrow('已变化')
  expect(repository.tasks.getTask(task.id).title).toBe('再次修改')
  repository.drafts.commit({ ...saved, kind: 'task', key: task.id, acceptChanges: true, expectedBaseUpdatedAt: second.updatedAt })
  expect(repository.tasks.getTask(task.id).title).toBe('我的修改')
})
beforeEach(() => { useDatabaseForTests(path.join(directory, `${crypto.randomUUID()}.sqlite`)); repository = new Repository() })
afterAll(() => { closeDatabase(); fs.rmSync(directory, { recursive: true, force: true }) })

it('persists drafts separately and commits with cleanup in one transaction', () => {
  const task = repository.tasks.createTask({ title: '正式标题' })
  expect(repository).toHaveProperty('drafts')
  const snapshot = repository.drafts.get('task', task.id)
  const saved = repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '草稿标题' } })
  expect(repository.tasks.getTask(task.id).title).toBe('正式标题')
  closeDatabase()
  expect(repository.drafts.get('task', task.id).record?.payload).toMatchObject({ title: '草稿标题' })
  repository.drafts.commit({ ...saved, kind: 'task', key: task.id })
  expect(repository.tasks.getTask(task.id).title).toBe('草稿标题')
  expect(repository.drafts.get('task', task.id).record).toBeNull()
  expect(() => repository.drafts.put({ ...saved, kind: 'task', key: task.id, payload: taskToDraft(task) })).toThrow()
})

it('keeps invalid drafts and rejects stale writes and deleted targets', () => {
  const task = repository.tasks.createTask({ title: '正式标题' })
  const snapshot = repository.drafts.get('task', task.id)
  const saved = repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '' } })
  expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id })).toThrow()
  expect(repository.drafts.get('task', task.id).record).not.toBeNull()
  expect(() => repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: taskToDraft(task) })).toThrow()
  repository.tasks.removeTask(task.id)
  expect(repository.drafts.get('task', task.id).record).toBeNull()
  expect(() => repository.drafts.put({ ...saved, kind: 'task', key: task.id, payload: taskToDraft(task) })).toThrow()
})

it('round trips v6 drafts, rejects old generations and validates import atomically', () => {
  const snapshot = repository.drafts.get('capture', 'global')
  repository.drafts.put({ ...snapshot, kind: 'capture', key: 'global', payload: { title: '未完成捕获' } })
  const backup = repository.backup.exportBackup()
  expect(backup.version).toBe(6)
  repository.backup.importBackup(backup)
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '未完成捕获' })
  expect(() => repository.drafts.put({ ...snapshot, kind: 'capture', key: 'global', payload: { title: '旧窗口' } })).toThrow()
  const broken = structuredClone(backup)
  broken.drafts![0].version = 99 as never
  expect(() => repository.backup.importBackup(broken)).toThrow()
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '未完成捕获' })
  expect(() => repository.backup.importBackup({ ...backup, version: 3, drafts: undefined } as never)).toThrow('仅支持 v6')
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '未完成捕获' })
})

it('rejects changed formal data and rolls back a failure during draft cleanup', () => {
  const task = repository.tasks.createTask({ title: '原始内容' })
  const snapshot = repository.drafts.get('task', task.id)
  const saved = repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '新内容' } })
  getDatabase().prepare("UPDATE tasks SET updated_at='2026-01-01T00:00:00.000Z' WHERE id=?").run(task.id)
  expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id })).toThrow('已变化')
  getDatabase().exec("CREATE TRIGGER fail_draft_cleanup BEFORE UPDATE ON editor_drafts BEGIN SELECT RAISE(ABORT, 'disk failure'); END")
  expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id, acceptChanges: true, expectedBaseUpdatedAt: '2026-01-01T00:00:00.000Z' })).toThrow('disk failure')
  expect(repository.tasks.getTask(task.id).title).toBe('原始内容')
  expect(repository.drafts.get('task', task.id).record).not.toBeNull()
})

it('cleans removed references without losing unfinished text and exports restorable drafts', () => {
  const list = repository.organization.createList({ name: '临时清单' })
  const tag = repository.organization.createTag({ name: '临时标签' })
  const task = repository.tasks.createTask({ title: '任务', listId: list.id, tagIds: [tag.id] })
  const snapshot = repository.drafts.get('task', task.id)
  repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), notes: '必须保留的笔记' } })
  repository.organization.removeTag(tag.id)
  repository.organization.removeList(list.id)
  const backup = repository.backup.exportBackup()
  expect(backup.drafts?.[0].payload).toMatchObject({ notes: '必须保留的笔记', listId: null, tagIds: [] })
  repository.backup.importBackup(backup)
  expect(repository.drafts.get('task', task.id).record?.payload).toMatchObject({ notes: '必须保留的笔记' })
})

it('rolls back formal data, drafts and generation after an in-transaction import failure', () => {
  const task = repository.tasks.createTask({ title: '保留原任务' })
  const snapshot = repository.drafts.get('capture', 'global')
  repository.drafts.put({ ...snapshot, kind: 'capture', key: 'global', payload: { title: '保留原输入' } })
  const backup = repository.backup.exportBackup()
  backup.taskLists = [{ id: 'duplicated', name: 'one' }, { id: 'duplicated', name: 'two' }] as never
  expect(() => repository.backup.importBackup(backup)).toThrow()
  expect(repository.tasks.getTask(task.id).title).toBe('保留原任务')
  expect(repository.drafts.get('capture', 'global')).toMatchObject({ generation: snapshot.generation, record: { payload: { title: '保留原输入' } } })
  const valid = repository.backup.exportBackup()
  getDatabase().exec("CREATE TRIGGER fail_import BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'import failure'); END")
  expect(() => repository.backup.importBackup(valid)).toThrow('import failure')
  expect(repository.tasks.getTask(task.id).title).toBe('保留原任务')
  expect(repository.drafts.get('capture', 'global')).toMatchObject({ generation: snapshot.generation, record: { payload: { title: '保留原输入' } } })
})

it('upgrades a version 7 fixture once and preserves its existing tasks', () => {
  const task = repository.tasks.createTask({ title: '旧版任务' })
  const database = getDatabase()
  for (const trigger of ['drafts_task_deleted', 'drafts_task_removed', 'drafts_video_removed', 'drafts_list_removed', 'drafts_tag_removed']) database.exec(`DROP TRIGGER ${trigger}`)
  database.exec('DROP TABLE editor_drafts; DROP TABLE editor_draft_meta; DELETE FROM schema_migrations WHERE version=8;')
  database.exec('DROP TRIGGER action_video_removed; DROP TRIGGER action_review_removed; DROP TABLE action_links; DROP INDEX idx_tasks_deletion_batch; ALTER TABLE tasks DROP COLUMN plan_json; ALTER TABLE tasks DROP COLUMN focus_date; ALTER TABLE tasks DROP COLUMN deletion_batch; DELETE FROM schema_migrations WHERE version>=9;')
  closeDatabase()
  expect(repository.tasks.getTask(task.id).title).toBe('旧版任务')
  expect(getDatabase().prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 10 })
  const generation = repository.drafts.get('capture', 'global').generation
  closeDatabase()
  expect(repository.drafts.get('capture', 'global').generation).toBe(generation)
})
