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
    const list = repository.organization.createList({ name: '工作', color: '#856AF9' })
    const task = repository.tasks.createTask({
      title: '  编写测试  ',
      listId: list.id,
      dueDate: '2026-08-27',
      priority: 'high',
      notes: 'SQLite',
    })

    expect(task.title).toBe('编写测试')
    expect(repository.tasks.listTasks({ listId: list.id, search: 'SQLite' })).toHaveLength(1)
    expect(repository.tasks.listTasks({ status: 'active' })).toHaveLength(1)

    const updated = repository.tasks.updateTask(task.id, { priority: 'medium', notes: 'updated' })
    expect(updated.priority).toBe('medium')
    expect(updated.notes).toBe('updated')

    repository.tasks.completeTask(task.id)
    expect(repository.tasks.getTask(task.id).status).toBe('completed')
    repository.tasks.restoreTask(task.id)
    expect(repository.tasks.getTask(task.id).status).toBe('active')
    repository.tasks.removeTask(task.id)
    expect(repository.tasks.listTasks()).toHaveLength(0)
  })

  it('persists data after closing and reopening the database', () => {
    const repository = new Repository()
    const task = repository.tasks.createTask({ title: '持久化', dueDate: '2026-08-26' })
    closeDatabase()
    expect(new Repository().tasks.getTask(task.id).title).toBe('持久化')
    expect(getDatabase().pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('creates the next instance for a recurring task', () => {
    const repository = new Repository()
    const task = repository.tasks.createTask({
      title: '每日站会',
      dueDate: '2026-08-26',
      recurrence: { frequency: 'daily', interval: 1 },
    })

    repository.tasks.completeTask(task.id)
    const tasks = repository.tasks.listTasks({ search: '每日站会' })
    expect(tasks).toHaveLength(2)
    expect(tasks.some((item) => item.status === 'completed' && item.id === task.id)).toBe(true)
    expect(tasks.some((item) => item.status === 'active' && item.dueDate === '2026-08-27')).toBe(true)
  })

  it('keeps monthly recurrence on the last valid day of a shorter month', () => {
    const repository = new Repository()
    const task = repository.tasks.createTask({
      title: '月末任务',
      dueDate: '2027-01-31',
      recurrence: { frequency: 'monthly', interval: 1 },
    })

    repository.tasks.completeTask(task.id)
    expect(repository.tasks.listTasks({ search: '月末任务' }).find((item) => item.status === 'active')?.dueDate).toBe('2027-02-28')
  })

  it('does not create a recurrence beyond its end date', () => {
    const repository = new Repository()
    const task = repository.tasks.createTask({
      title: '有结束日期',
      dueDate: '2026-08-26',
      recurrence: { frequency: 'weekly', interval: 1, endDate: '2026-08-30' },
    })

    repository.tasks.completeTask(task.id)
    expect(repository.tasks.listTasks({ search: '有结束日期' })).toHaveLength(1)
  })

  it('does not create duplicate next instances when completion is retried', () => {
    const repository = new Repository()
    const task = repository.tasks.createTask({
      title: '幂等重复任务',
      dueDate: '2026-08-26',
      recurrence: { frequency: 'daily', interval: 1 },
    })

    repository.tasks.completeTask(task.id)
    repository.tasks.completeTask(task.id)
    const nextTasks = repository.tasks.listTasks({ search: '幂等重复任务' }).filter((item) => item.dueDate === '2026-08-27')
    expect(nextTasks).toHaveLength(1)
  })

  it('round-trips a backup and rolls back invalid imports atomically', () => {
    const repository = new Repository()
    const list = repository.organization.createList({ name: '原清单' })
    repository.tasks.createTask({ title: '原任务', listId: list.id })
    const backup = repository.backup.exportBackup()

    const invalid = {
      ...backup,
      taskLists: [],
      tasks: [{ ...backup.tasks[0], listId: 'missing-list' }],
    }
    expect(() => repository.backup.importBackup(invalid)).toThrow()
    expect(repository.organization.listLists().map((item) => item.name)).toEqual(['原清单'])
    expect(repository.tasks.listTasks().map((item) => item.title)).toEqual(['原任务'])

    const replacement = {
      ...backup,
      taskLists: [{ ...list, name: '恢复清单' }],
      tasks: backup.tasks.map((item) => ({ ...item, title: '恢复任务', listId: list.id })),
    }
    expect(repository.backup.importBackup(replacement).importedTasks).toBe(1)
    expect(repository.tasks.listTasks()[0].title).toBe('恢复任务')
    expect(repository.organization.listLists()[0].name).toBe('恢复清单')
  })

  it('rejects empty task titles before writing', () => {
    const repository = new Repository()
    expect(() => repository.tasks.createTask({ title: '   ' })).toThrow('任务标题不能为空')
    expect(repository.tasks.listTasks()).toHaveLength(0)
  })

  it('rejects dates that do not exist on the calendar', () => {
    const repository = new Repository()
    expect(() => repository.tasks.createTask({ title: '无效日期', dueDate: '2026-02-31' })).toThrow('日期格式无效')
    expect(() => repository.tasks.createTask({ title: '无效结束日期', dueDate: '2026-02-28', recurrence: { frequency: 'daily', endDate: '2026-02-31' } })).toThrow('日期格式无效')
    expect(repository.tasks.listTasks()).toHaveLength(0)
  })

  it('persists pin state and transactional task and list ordering', () => {
    const repository = new Repository()
    const firstList = repository.organization.createList({ name: '一号', isPinned: true })
    const secondList = repository.organization.createList({ name: '二号', isPinned: true })
    repository.organization.reorderLists([secondList.id, firstList.id])
    expect(repository.organization.listLists().map((item) => [item.name, item.isPinned])).toEqual([['二号', true], ['一号', true]])

    const firstTask = repository.tasks.createTask({ title: '任务一', priority: 'high', isPinned: true })
    const secondTask = repository.tasks.createTask({ title: '任务二', priority: 'high', isPinned: true })
    repository.tasks.reorderTasks([secondTask.id, firstTask.id])
    expect(repository.tasks.listTasks().map((item) => [item.title, item.isPinned])).toEqual([['任务二', true], ['任务一', true]])
  })

  it('moves tasks and lists between pin groups atomically', () => {
    const repository = new Repository()
    const pinnedList = repository.organization.createList({ name: '已置顶', isPinned: true })
    const regularList = repository.organization.createList({ name: '待置顶' })
    expect(() => repository.organization.organizeList(regularList.id, { isPinned: true, orderedIds: [regularList.id] })).toThrow('清单顺序不完整')
    expect(repository.organization.listLists().find((item) => item.id === regularList.id)?.isPinned).toBe(false)
    repository.organization.organizeList(regularList.id, { isPinned: true, orderedIds: [regularList.id, pinnedList.id] })
    expect(repository.organization.listLists().filter((item) => item.isPinned).map((item) => item.id)).toEqual([regularList.id, pinnedList.id])

    const pinnedTask = repository.tasks.createTask({ title: '已置顶任务', isPinned: true, priority: 'high' })
    const regularTask = repository.tasks.createTask({ title: '待置顶任务', priority: 'high' })
    expect(() => repository.tasks.organizeTask(regularTask.id, { isPinned: true, priority: 'high', orderedIds: [regularTask.id] })).toThrow('任务顺序不完整')
    expect(repository.tasks.getTask(regularTask.id).isPinned).toBe(false)
    repository.tasks.organizeTask(regularTask.id, { isPinned: true, priority: 'high', orderedIds: [regularTask.id, pinnedTask.id] })
    expect(repository.tasks.listTasks().filter((item) => item.isPinned && item.priority === 'high').map((item) => item.id)).toEqual([regularTask.id, pinnedTask.id])
  })

  it('deletes a list while either keeping or deleting its tasks', () => {
    const repository = new Repository()
    const keepList = repository.organization.createList({ name: '保留任务' })
    const keptTask = repository.tasks.createTask({ title: '保留项', listId: keepList.id })
    repository.organization.removeList(keepList.id, 'keep')
    expect(repository.tasks.getTask(keptTask.id).listId).toBeNull()

    const deleteList = repository.organization.createList({ name: '删除任务' })
    const parent = repository.tasks.createTask({ title: '父任务', listId: deleteList.id })
    repository.tasks.createTask({ title: '子任务', listId: deleteList.id, parentTaskId: parent.id })
    const unrelated = repository.tasks.createTask({ title: '其他任务' })
    repository.organization.removeList(deleteList.id, 'delete')
    expect(repository.tasks.listTasks().map((item) => item.id)).toEqual(expect.arrayContaining([keptTask.id, unrelated.id]))
    expect(repository.tasks.listTasks().some((item) => item.id === parent.id || item.parentTaskId === parent.id)).toBe(false)
  })

  it('imports version 1 backups that do not contain pin fields', () => {
    const repository = new Repository()
    const list = repository.organization.createList({ name: '旧清单', isPinned: true })
    repository.tasks.createTask({ title: '旧任务', listId: list.id, isPinned: true })
    const oldBackup = JSON.parse(JSON.stringify(repository.backup.exportBackup()))
    oldBackup.version = 1
    oldBackup.taskLists.forEach((item: Record<string, unknown>) => delete item.isPinned)
    oldBackup.tasks.forEach((item: Record<string, unknown>) => delete item.isPinned)

    repository.backup.importBackup(oldBackup)
    expect(repository.organization.listLists()[0].isPinned).toBe(false)
    expect(repository.tasks.listTasks()[0].isPinned).toBe(false)
    expect(getDatabase().prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 8 })
  })

  it('rejects invalid persisted pin values before writing', () => {
    const repository = new Repository()
    expect(() => repository.tasks.createTask({ title: '错误任务', isPinned: 'yes' as unknown as boolean })).toThrow('任务置顶状态无效')
    expect(() => repository.organization.createList({ name: '错误清单', isPinned: 1 as unknown as boolean })).toThrow('清单置顶状态无效')
    expect(repository.tasks.listTasks()).toHaveLength(0)
    expect(repository.organization.listLists()).toHaveLength(0)
  })

  it('stores tags, saved filters, reminder fields and exports backup version 4', () => {
    const repository = new Repository()
    const tag = repository.organization.createTag({ name: '紧急', color: '#ff5d5d' })
    const task = repository.tasks.createTask({ title: '带提醒任务', dueDate: '2026-08-28', dueTime: '10:30', reminderMinutesBefore: 15, tagIds: [tag.id] })
    const filter = repository.organization.createSavedFilter({ name: '紧急任务', criteria: { status: 'active', tagIds: [tag.id] } })
    expect(repository.tasks.getTask(task.id).tags.map((item) => item.name)).toEqual(['紧急'])
    expect(repository.tasks.listTasks({ search: '紧急' }).map((item) => item.id)).toEqual([task.id])
    expect(repository.organization.listSavedFilters()[0]).toEqual(filter)
    const backup = repository.backup.exportBackup()
    expect(backup.version).toBe(4)
    expect(backup.taskTags).toEqual([{ taskId: task.id, tagId: tag.id }])
  })

  it('soft deletes and restores a task subtree', () => {
    const repository = new Repository()
    const parent = repository.tasks.createTask({ title: '父任务' })
    const child = repository.tasks.createTask({ title: '子任务', parentTaskId: parent.id })
    repository.tasks.removeTask(parent.id)
    expect(repository.tasks.listTasks()).toHaveLength(0)
    repository.tasks.restoreRemoved(parent.id)
    expect(repository.tasks.listTasks().map((item) => item.id)).toEqual(expect.arrayContaining([parent.id, child.id]))
  })

  it('deduplicates reminders and ignores reminders missed by more than 24 hours', () => {
    const repository = new Repository()
    const recent = repository.tasks.createTask({ title: '近期提醒', dueDate: '2026-08-28', dueTime: '10:00', reminderMinutesBefore: 15 })
    repository.tasks.createTask({ title: '过期提醒', dueDate: '2026-08-27', dueTime: '08:00', reminderMinutesBefore: 5 })
    const due = repository.tasks.dueReminders(new Date('2026-08-28T10:00:00'))
    expect(due.map((item) => item.task.id)).toEqual([recent.id])
    repository.tasks.markReminderNotified(recent.id)
    expect(repository.tasks.dueReminders(new Date('2026-08-28T10:00:00'))).toHaveLength(0)
  })

  it('undoes recurring completion without leaving its generated next task active', () => {
    const repository = new Repository()
    const task = repository.tasks.createTask({ title: '重复撤销', dueDate: '2026-08-28', recurrence: { frequency: 'daily' } })
    repository.tasks.completeTask(task.id)
    expect(repository.tasks.listTasks({ search: '重复撤销' })).toHaveLength(2)
    repository.tasks.restoreTask(task.id)
    expect(repository.tasks.listTasks({ search: '重复撤销' })).toEqual([expect.objectContaining({ id: task.id, status: 'active' })])
    repository.tasks.completeTask(task.id)
    expect(repository.tasks.listTasks({ search: '重复撤销' })).toHaveLength(2)
  })

  it('round-trips version 3 backups with parent and generated task links', () => {
    const repository = new Repository()
    const recurring = repository.tasks.createTask({ title: '备份重复任务', dueDate: '2026-08-28', recurrence: { frequency: 'daily' } })
    repository.tasks.createTask({ title: '备份子任务', parentTaskId: recurring.id })
    repository.tasks.completeTask(recurring.id)
    const backup = repository.backup.exportBackup()
    expect(() => repository.backup.importBackup(backup)).not.toThrow()
    expect(repository.tasks.listTasks({ search: '备份重复任务' })).toHaveLength(2)
    expect(repository.tasks.listTasks({ search: '备份子任务' })[0].parentTaskId).toBe(recurring.id)
  })

  it('stores flow videos, review links, quota snapshots and summaries', () => {
    const repository = new Repository()
    const today = new Date()
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const past = new Date(today); past.setDate(today.getDate() - 1)
    const pastDate = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    const pastVideo = repository.flow.createFlowVideo({ date: pastDate, title: '过去的视频', sourceUrl: 'https://www.bilibili.com/video/1' })
    const first = repository.flow.createFlowVideo({ date: todayDate, title: '值得思考的视频', sourceUrl: 'https://www.douyin.com/video/1', author: '创作者' })
    repository.flow.updateFlowVideo(first.id, { thought: '我认同其中一部分，并准备减少无目的输入。' })
    repository.flow.createFlowVideo({ date: todayDate, title: '待补思考的视频', sourceUrl: 'https://youtu.be/example' })
    const review = repository.flow.saveFlowReview({ date: todayDate, didWell: '完成了重要任务', inputType: 'video', inputVideoId: first.id, outputText: '写下了自己的观点' })

    expect(review.savedAt).not.toBeNull()
    expect(repository.flow.getFlowDay(todayDate).videos.map((video) => video.sourcePlatform)).toEqual(['抖音', 'YouTube'])
    expect(repository.flow.listFlowMonth(todayDate.slice(0, 7)).find((item) => item.date === todayDate)).toMatchObject({ videoCount: 2, pendingThoughtCount: 1, reviewSaved: true, overLimit: false })
    expect(repository.flow.getFlowSummary(7, today)).toMatchObject({ reviewedDays: 1, videoCount: 3, pendingThoughts: 2 })

    repository.settings.updateSettings({ dailyVideoLimit: 1 })
    expect(repository.flow.getFlowDay(todayDate).review.videoLimit).toBe(1)
    expect(repository.flow.getFlowDay(pastDate).review.videoLimit).toBe(3)
    expect(repository.flow.listFlowMonth(todayDate.slice(0, 7)).find((item) => item.date === todayDate)?.overLimit).toBe(true)
    expect(() => repository.flow.createFlowVideo({ date: todayDate, title: '坏链接', sourceUrl: 'file:///tmp/video' })).toThrow('HTTP')
    expect(pastVideo.date).toBe(pastDate)
  })

  it('round-trips flow data in version 3 backups and accepts old version 2 payloads', () => {
    const repository = new Repository()
    const date = '2026-08-30'
    const video = repository.flow.createFlowVideo({ date, title: '备份视频', sourceUrl: 'https://example.com/video' })
    repository.flow.saveFlowReview({ date, inputType: 'video', inputVideoId: video.id, reflection: '保留这条反思' })
    const backup = repository.backup.exportBackup()

    expect(repository.backup.importBackup(backup)).toMatchObject({ importedReviews: 1, importedVideos: 1 })
    expect(repository.flow.getFlowDay(date).review.reflection).toBe('保留这条反思')

    const oldBackup = { ...backup, version: 2 as const }
    delete oldBackup.flowDays
    delete oldBackup.videoReflections
    expect(repository.backup.importBackup(oldBackup)).toMatchObject({ importedReviews: 0, importedVideos: 0 })
    expect(repository.flow.listFlowMonth('2026-08')).toEqual([])
  })

  it('persists a video link before its optional details are filled in', () => {
    const repository = new Repository()
    const date = '2026-08-31'
    const video = repository.flow.createFlowVideo({ date, sourceUrl: 'https://example.com/watch/1' })

    expect(video).toMatchObject({ title: '', author: '', thought: '', sourcePlatform: 'example.com' })
    expect(repository.backup.exportBackup().videoReflections?.[0]?.title).toBe('')
    expect(() => repository.backup.importBackup(repository.backup.exportBackup())).not.toThrow()
    expect(repository.flow.updateFlowVideo(video.id, { title: '看完后补上的标题' }).title).toBe('看完后补上的标题')
  })
})
