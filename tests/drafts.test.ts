import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { taskToDraft } from '../src/shared/drafts'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-drafts-'))
vi.mock('electron', () => ({ app: { getPath: () => directory } }))
const { Repository } = await import('../electron/database/repository')
const { useDatabaseForTests, closeDatabase, getDatabase } = await import('../electron/database/db')
let repository: InstanceType<typeof Repository>
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

it('round trips v5 drafts, rejects old generations and validates import atomically', () => {
  const snapshot = repository.drafts.get('capture', 'global')
  repository.drafts.put({ ...snapshot, kind: 'capture', key: 'global', payload: { title: '未完成捕获' } })
  const backup = repository.backup.exportBackup()
  expect(backup.version).toBe(5)
  repository.backup.importBackup(backup)
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '未完成捕获' })
  expect(() => repository.drafts.put({ ...snapshot, kind: 'capture', key: 'global', payload: { title: '旧窗口' } })).toThrow()
  const broken = structuredClone(backup)
  broken.drafts![0].version = 99 as never
  expect(() => repository.backup.importBackup(broken)).toThrow()
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '未完成捕获' })
  expect(() => repository.backup.importBackup({ ...backup, version: 3, drafts: undefined } as never)).toThrow('仅支持 v5')
  expect(repository.drafts.get('capture', 'global').record?.payload).toEqual({ title: '未完成捕获' })
})

it('rejects changed formal data and rolls back a failure during draft cleanup', () => {
  const task = repository.tasks.createTask({ title: '原始内容' })
  const snapshot = repository.drafts.get('task', task.id)
  const saved = repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '新内容' } })
  getDatabase().prepare("UPDATE tasks SET updated_at='2026-01-01T00:00:00.000Z' WHERE id=?").run(task.id)
  expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id })).toThrow('已变化')
  getDatabase().exec("CREATE TRIGGER fail_draft_cleanup BEFORE UPDATE ON editor_drafts BEGIN SELECT RAISE(ABORT, 'disk failure'); END")
  expect(() => repository.drafts.commit({ ...saved, kind: 'task', key: task.id, acceptChanges: true })).toThrow('disk failure')
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
  database.exec('DROP TRIGGER action_video_removed; DROP TRIGGER action_review_removed; DROP TABLE action_links; DROP INDEX idx_tasks_deletion_batch; ALTER TABLE tasks DROP COLUMN plan_json; ALTER TABLE tasks DROP COLUMN focus_date; ALTER TABLE tasks DROP COLUMN deletion_batch; DELETE FROM schema_migrations WHERE version=9;')
  closeDatabase()
  expect(repository.tasks.getTask(task.id).title).toBe('旧版任务')
  expect(getDatabase().prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 9 })
  const generation = repository.drafts.get('capture', 'global').generation
  closeDatabase()
  expect(repository.drafts.get('capture', 'global').generation).toBe(generation)
})
