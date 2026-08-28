import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-flow-test-'))
process.env.RUMO_TEST_DATA_DIR = dataDir

vi.mock('electron', () => ({
  app: { getPath: () => process.env.RUMO_TEST_DATA_DIR },
}))

const { Repository } = await import('../electron/database/repository')
const { closeDatabase, getDatabase } = await import('../electron/database/db')

function resetDatabase() {
  closeDatabase()
  for (const suffix of ['', '-wal', '-shm']) {
    const file = path.join(dataDir, `rumo-daiban.sqlite${suffix}`)
    if (fs.existsSync(file)) fs.rmSync(file)
  }
}

describe('Repository with an isolated SQLite database', () => {
  beforeEach(resetDatabase)
  afterAll(() => {
    closeDatabase()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  it('creates, filters, updates, completes, restores and removes tasks', () => {
    const repository = new Repository()
    const list = repository.createList({ name: '工作', color: '#856AF9' })
    const task = repository.createTask({
      title: '  编写测试  ',
      listId: list.id,
      dueDate: '2026-08-27',
      priority: 'high',
      notes: 'SQLite',
    })

    expect(task.title).toBe('编写测试')
    expect(repository.listTasks({ listId: list.id, search: 'SQLite' })).toHaveLength(1)
    expect(repository.listTasks({ status: 'active' })).toHaveLength(1)

    const updated = repository.updateTask(task.id, { priority: 'medium', notes: 'updated' })
    expect(updated.priority).toBe('medium')
    expect(updated.notes).toBe('updated')

    repository.completeTask(task.id)
    expect(repository.getTask(task.id).status).toBe('completed')
    repository.restoreTask(task.id)
    expect(repository.getTask(task.id).status).toBe('active')
    repository.removeTask(task.id)
    expect(repository.listTasks()).toHaveLength(0)
  })

  it('persists data after closing and reopening the database', () => {
    const repository = new Repository()
    const task = repository.createTask({ title: '持久化', dueDate: '2026-08-26' })
    closeDatabase()
    expect(new Repository().getTask(task.id).title).toBe('持久化')
    expect(getDatabase().pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('creates the next instance for a recurring task', () => {
    const repository = new Repository()
    const task = repository.createTask({
      title: '每日站会',
      dueDate: '2026-08-26',
      recurrence: { frequency: 'daily', interval: 1 },
    })

    repository.completeTask(task.id)
    const tasks = repository.listTasks({ search: '每日站会' })
    expect(tasks).toHaveLength(2)
    expect(tasks.some((item) => item.status === 'completed' && item.id === task.id)).toBe(true)
    expect(tasks.some((item) => item.status === 'active' && item.dueDate === '2026-08-27')).toBe(true)
  })

  it('keeps monthly recurrence on the last valid day of a shorter month', () => {
    const repository = new Repository()
    const task = repository.createTask({
      title: '月末任务',
      dueDate: '2027-01-31',
      recurrence: { frequency: 'monthly', interval: 1 },
    })

    repository.completeTask(task.id)
    expect(repository.listTasks({ search: '月末任务' }).find((item) => item.status === 'active')?.dueDate).toBe('2027-02-28')
  })

  it('does not create a recurrence beyond its end date', () => {
    const repository = new Repository()
    const task = repository.createTask({
      title: '有结束日期',
      dueDate: '2026-08-26',
      recurrence: { frequency: 'weekly', interval: 1, endDate: '2026-08-30' },
    })

    repository.completeTask(task.id)
    expect(repository.listTasks({ search: '有结束日期' })).toHaveLength(1)
  })

  it('does not create duplicate next instances when completion is retried', () => {
    const repository = new Repository()
    const task = repository.createTask({
      title: '幂等重复任务',
      dueDate: '2026-08-26',
      recurrence: { frequency: 'daily', interval: 1 },
    })

    repository.completeTask(task.id)
    repository.completeTask(task.id)
    const nextTasks = repository.listTasks({ search: '幂等重复任务' }).filter((item) => item.dueDate === '2026-08-27')
    expect(nextTasks).toHaveLength(1)
  })

  it('round-trips a backup and rolls back invalid imports atomically', () => {
    const repository = new Repository()
    const list = repository.createList({ name: '原清单' })
    repository.createTask({ title: '原任务', listId: list.id })
    const backup = repository.exportBackup()

    const invalid = {
      ...backup,
      taskLists: [],
      tasks: [{ ...backup.tasks[0], listId: 'missing-list' }],
    }
    expect(() => repository.importBackup(invalid)).toThrow()
    expect(repository.listLists().map((item) => item.name)).toEqual(['原清单'])
    expect(repository.listTasks().map((item) => item.title)).toEqual(['原任务'])

    const replacement = {
      ...backup,
      taskLists: [{ ...list, name: '恢复清单' }],
      tasks: backup.tasks.map((item) => ({ ...item, title: '恢复任务', listId: list.id })),
    }
    expect(repository.importBackup(replacement).importedTasks).toBe(1)
    expect(repository.listTasks()[0].title).toBe('恢复任务')
    expect(repository.listLists()[0].name).toBe('恢复清单')
  })

  it('rejects empty task titles before writing', () => {
    const repository = new Repository()
    expect(() => repository.createTask({ title: '   ' })).toThrow('任务标题不能为空')
    expect(repository.listTasks()).toHaveLength(0)
  })

  it('persists pin state and transactional task and list ordering', () => {
    const repository = new Repository()
    const firstList = repository.createList({ name: '一号', isPinned: true })
    const secondList = repository.createList({ name: '二号', isPinned: true })
    repository.reorderLists([secondList.id, firstList.id])
    expect(repository.listLists().map((item) => [item.name, item.isPinned])).toEqual([['二号', true], ['一号', true]])

    const firstTask = repository.createTask({ title: '任务一', priority: 'high', isPinned: true })
    const secondTask = repository.createTask({ title: '任务二', priority: 'high', isPinned: true })
    repository.reorderTasks([secondTask.id, firstTask.id])
    expect(repository.listTasks().map((item) => [item.title, item.isPinned])).toEqual([['任务二', true], ['任务一', true]])
  })

  it('deletes a list while either keeping or deleting its tasks', () => {
    const repository = new Repository()
    const keepList = repository.createList({ name: '保留任务' })
    const keptTask = repository.createTask({ title: '保留项', listId: keepList.id })
    repository.removeList(keepList.id, 'keep')
    expect(repository.getTask(keptTask.id).listId).toBeNull()

    const deleteList = repository.createList({ name: '删除任务' })
    const parent = repository.createTask({ title: '父任务', listId: deleteList.id })
    repository.createTask({ title: '子任务', listId: deleteList.id, parentTaskId: parent.id })
    const unrelated = repository.createTask({ title: '其他任务' })
    repository.removeList(deleteList.id, 'delete')
    expect(repository.listTasks().map((item) => item.id)).toEqual(expect.arrayContaining([keptTask.id, unrelated.id]))
    expect(repository.listTasks().some((item) => item.id === parent.id || item.parentTaskId === parent.id)).toBe(false)
  })

  it('imports version 1 backups that do not contain pin fields', () => {
    const repository = new Repository()
    const list = repository.createList({ name: '旧清单', isPinned: true })
    repository.createTask({ title: '旧任务', listId: list.id, isPinned: true })
    const oldBackup = JSON.parse(JSON.stringify(repository.exportBackup()))
    oldBackup.taskLists.forEach((item: Record<string, unknown>) => delete item.isPinned)
    oldBackup.tasks.forEach((item: Record<string, unknown>) => delete item.isPinned)

    repository.importBackup(oldBackup)
    expect(repository.listLists()[0].isPinned).toBe(false)
    expect(repository.listTasks()[0].isPinned).toBe(false)
    expect(getDatabase().prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 6 })
  })

  it('rejects invalid persisted pin values before writing', () => {
    const repository = new Repository()
    expect(() => repository.createTask({ title: '错误任务', isPinned: 'yes' as unknown as boolean })).toThrow('任务置顶状态无效')
    expect(() => repository.createList({ name: '错误清单', isPinned: 1 as unknown as boolean })).toThrow('清单置顶状态无效')
    expect(repository.listTasks()).toHaveLength(0)
    expect(repository.listLists()).toHaveLength(0)
  })

  it('stores tags, saved filters, reminder fields and exports backup version 2', () => {
    const repository = new Repository()
    const tag = repository.createTag({ name: '紧急', color: '#ff5d5d' })
    const task = repository.createTask({ title: '带提醒任务', dueDate: '2026-08-28', dueTime: '10:30', reminderMinutesBefore: 15, tagIds: [tag.id] })
    const filter = repository.createSavedFilter({ name: '紧急任务', criteria: { status: 'active', tagIds: [tag.id] } })
    expect(repository.getTask(task.id).tags.map((item) => item.name)).toEqual(['紧急'])
    expect(repository.listTasks({ search: '紧急' }).map((item) => item.id)).toEqual([task.id])
    expect(repository.listSavedFilters()[0]).toEqual(filter)
    const backup = repository.exportBackup()
    expect(backup.version).toBe(2)
    expect(backup.taskTags).toEqual([{ taskId: task.id, tagId: tag.id }])
  })

  it('soft deletes and restores a task subtree', () => {
    const repository = new Repository()
    const parent = repository.createTask({ title: '父任务' })
    const child = repository.createTask({ title: '子任务', parentTaskId: parent.id })
    repository.removeTask(parent.id)
    expect(repository.listTasks()).toHaveLength(0)
    repository.restoreRemoved(parent.id)
    expect(repository.listTasks().map((item) => item.id)).toEqual(expect.arrayContaining([parent.id, child.id]))
  })

  it('deduplicates reminders and ignores reminders missed by more than 24 hours', () => {
    const repository = new Repository()
    const recent = repository.createTask({ title: '近期提醒', dueDate: '2026-08-28', dueTime: '10:00', reminderMinutesBefore: 15 })
    repository.createTask({ title: '过期提醒', dueDate: '2026-08-27', dueTime: '08:00', reminderMinutesBefore: 5 })
    const due = repository.dueReminders(new Date('2026-08-28T10:00:00'))
    expect(due.map((item) => item.task.id)).toEqual([recent.id])
    repository.markReminderNotified(recent.id)
    expect(repository.dueReminders(new Date('2026-08-28T10:00:00'))).toHaveLength(0)
  })

  it('undoes recurring completion without leaving its generated next task active', () => {
    const repository = new Repository()
    const task = repository.createTask({ title: '重复撤销', dueDate: '2026-08-28', recurrence: { frequency: 'daily' } })
    repository.completeTask(task.id)
    expect(repository.listTasks({ search: '重复撤销' })).toHaveLength(2)
    repository.restoreTask(task.id)
    expect(repository.listTasks({ search: '重复撤销' })).toEqual([expect.objectContaining({ id: task.id, status: 'active' })])
    repository.completeTask(task.id)
    expect(repository.listTasks({ search: '重复撤销' })).toHaveLength(2)
  })

  it('round-trips version 2 backups with parent and generated task links', () => {
    const repository = new Repository()
    const recurring = repository.createTask({ title: '备份重复任务', dueDate: '2026-08-28', recurrence: { frequency: 'daily' } })
    repository.createTask({ title: '备份子任务', parentTaskId: recurring.id })
    repository.completeTask(recurring.id)
    const backup = repository.exportBackup()
    expect(() => repository.importBackup(backup)).not.toThrow()
    expect(repository.listTasks({ search: '备份重复任务' })).toHaveLength(2)
    expect(repository.listTasks({ search: '备份子任务' })[0].parentTaskId).toBe(recurring.id)
  })
})
