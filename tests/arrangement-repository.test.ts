import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { taskToDraft } from '../src/shared/drafts'
import type { ArrangeTaskAction, Task } from '../src/shared/contracts'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-arrangement-'))
vi.mock('electron', () => ({ app: { getPath: () => directory } }))
const { Repository } = await import('../electron/database/repository')
const { useDatabaseForTests, closeDatabase, getDatabase } = await import('../electron/database/db')
let repository: InstanceType<typeof Repository>
beforeEach(() => {
  useDatabaseForTests(path.join(directory, `${crypto.randomUUID()}.sqlite`))
  repository = new Repository()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-12-31T23:59:59'))
})
afterEach(() => vi.useRealTimers())
afterAll(() => { closeDatabase(); fs.rmSync(directory, { recursive: true, force: true }) })
function arrange(task: Task, action: ArrangeTaskAction) {
  return repository.taskCommands.arrange({ taskId: task.id, updatedAt: task.updatedAt, generation: repository.drafts.get('task', task.id).generation, action })
}

it('provides a dedicated arrangement command', () => {
  expect(repository.taskCommands).toHaveProperty('arrange', expect.any(Function))
})
it('writes only plan, focus and monotonic time, preserves reminders and returns no-op unchanged', () => {
  const task = repository.tasks.createTask({ title: '任务', dueDate: '2027-01-03', dueTime: '12:00', reminderMinutesBefore: 5, isPinned: true, recurrence: { frequency: 'daily' } })
  getDatabase().prepare("UPDATE tasks SET reminder_notified_at='already-notified' WHERE id=?").run(task.id)
  const before = getDatabase().prepare('SELECT * FROM tasks WHERE id=?').get(task.id) as Record<string, unknown>
  const updated = arrange(task, { kind: 'focus', enabled: true })
  expect(updated).toMatchObject({ plan: { kind: 'day', start: '2026-12-31' }, focusDate: '2026-12-31', isPinned: true })
  expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(task.updatedAt))
  const after = getDatabase().prepare('SELECT * FROM tasks WHERE id=?').get(task.id) as Record<string, unknown>
  for (const key of Object.keys(before).filter(key => !['plan_json', 'focus_date', 'updated_at'].includes(key))) expect(after[key], key).toEqual(before[key])
  expect(arrange(updated, { kind: 'plan', target: 'today' })).toEqual(updated)
  const unfocused = arrange(updated, { kind: 'focus', enabled: false })
  expect(unfocused).toMatchObject({ plan: updated.plan, focusDate: null })
})
it('resolves relative dates at submission, normalizes weeks and months and clears focus', () => {
  let task = arrange(repository.tasks.createTask({ title: '相对日期' }), { kind: 'focus', enabled: true })
  vi.setSystemTime(new Date('2027-01-01T00:00:01'))
  task = arrange(task, { kind: 'plan', target: 'tomorrow' })
  expect(task).toMatchObject({ plan: { kind: 'day', start: '2027-01-02' }, focusDate: null })
  task = arrange(task, { kind: 'plan', target: 'week' })
  expect(task.plan).toEqual({ kind: 'week', start: '2026-12-28' })
  task = arrange(task, { kind: 'plan', target: 'month' })
  expect(task.plan).toEqual({ kind: 'month', start: '2027-01-01' })
  task = arrange(task, { kind: 'plan', target: { kind: 'week', start: '2027-01-06' } })
  expect(task.plan).toEqual({ kind: 'week', start: '2027-01-04' })
  expect(arrange(task, { kind: 'plan', target: null }).plan).toBeNull()
})
it('rejects drafts without changing them, allows formal save, and does not block on other tasks drafts', () => {
  const task = repository.tasks.createTask({ title: '正式标题' })
  const snapshot = repository.drafts.get('task', task.id)
  const draft = repository.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { ...taskToDraft(task), title: '草稿标题' } })
  expect(() => arrange(task, { kind: 'plan', target: 'today' })).toThrow('未保存修改')
  expect(repository.tasks.getTask(task.id)).toEqual(task)
  expect(repository.drafts.get('task', task.id)).toEqual(draft)
  const other = repository.tasks.createTask({ title: '其他任务' })
  expect(arrange(other, { kind: 'plan', target: 'today' }).plan?.kind).toBe('day')
  const committed = repository.drafts.commit({ ...draft, kind: 'task', key: task.id }) as Task
  expect(arrange(committed, { kind: 'plan', target: 'today' }).title).toBe('草稿标题')
})
it('rejects stale versions, generations, invalid actions and ineligible tasks', () => {
  const task = repository.tasks.createTask({ title: '验证边界' })
  const request = { taskId: task.id, updatedAt: task.updatedAt, generation: repository.drafts.get('task', task.id).generation, action: { kind: 'plan', target: 'today' } as ArrangeTaskAction }
  expect(() => repository.taskCommands.arrange({ ...request, generation: 'stale' })).toThrow('数据已恢复')
  for (const action of [{ kind: 'focus', enabled: 'yes' }, { kind: 'plan', target: 'yesterday' }, { kind: 'plan', target: { kind: 'day', start: '2026-02-30' } }, { kind: 'plan' }, null]) {
    expect(() => repository.taskCommands.arrange({ ...request, action } as never)).toThrow()
  }
  const updated = arrange(task, { kind: 'plan', target: 'today' })
  expect(() => repository.taskCommands.arrange(request)).toThrow('任务已变化')
  repository.tasks.completeTask(task.id)
  expect(() => arrange(repository.tasks.getTask(task.id), { kind: 'plan', target: 'today' })).toThrow('未完成的顶层任务')
  const child = repository.tasks.createTask({ title: '子任务', parentTaskId: task.id })
  expect(() => arrange(child, { kind: 'plan', target: 'today' })).toThrow('未完成的顶层任务')
  repository.tasks.removeTask(child.id)
  expect(() => repository.taskCommands.arrange({ ...request, taskId: child.id, updatedAt: repository.tasks.getTask(child.id).updatedAt })).toThrow('未完成的顶层任务')
  expect(updated.dueDate).toBeNull()
})
