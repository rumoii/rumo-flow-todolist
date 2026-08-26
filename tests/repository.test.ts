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
})
