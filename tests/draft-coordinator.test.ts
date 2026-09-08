// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createDraftCoordinator } from '../src/composables/draft-coordinator'
import type { DraftRecord, DraftSnapshot, DraftWrite, LifecycleResume, Task, TodoApi } from '../src/shared/contracts'
import { taskToDraft } from '../src/shared/drafts'

afterEach(() => vi.useRealTimers())

function fixture() {
  let snapshot: DraftSnapshot = { generation: 'first', revision: 0, baseUpdatedAt: null, record: null }
  let prepare: (() => Promise<void>) | undefined
  let resume: ((result: LifecycleResume) => void) | undefined
  const put = vi.fn(async (input: DraftWrite): Promise<DraftSnapshot> => {
    if (input.revision !== snapshot.revision) throw new Error('revision conflict')
    snapshot = { ...snapshot, revision: snapshot.revision + 1, record: { kind: input.kind, key: input.key, revision: snapshot.revision + 1,
      version: 2, updatedAt: '', baseUpdatedAt: input.baseUpdatedAt, payload: input.payload } as DraftRecord }
    return structuredClone(snapshot)
  })
  const api = { drafts: {
    get: vi.fn(async () => structuredClone(snapshot)), put,
    commit: vi.fn(async () => { snapshot = { ...snapshot, revision: snapshot.revision + 1, record: null }; return { id: 'created' } }),
    discard: vi.fn(async () => { snapshot = { ...snapshot, revision: snapshot.revision + 1, record: null }; return structuredClone(snapshot) }),
  }, lifecycle: {
    onPrepare: (callback: () => Promise<void>) => { prepare = callback; return () => { prepare = undefined } },
    onResume: (callback: (result: LifecycleResume) => void) => { resume = callback; return () => { resume = undefined } },
  } } as unknown as TodoApi
  return { api, put, prepare: () => prepare!(), resume: (result: LifecycleResume) => resume!(result) }
}

const task = { id: 'task', title: '任务', tags: [], notes: '', plan: null, focusDate: null, listId: null, dueDate: null, dueTime: null,
  reminderMinutesBefore: null, priority: 'none', updatedAt: 'before' } as Task
const arranged = { ...task, plan: { kind: 'day', start: '2026-09-08' } } as Task
const sync = { task: arranged, snapshot: { generation: 'first', revision: 0, baseUpdatedAt: 'after', record: null } }

it('synchronizes clean editor payload and base version before unpausing without creating a draft', async () => {
  const state = fixture()
  const coordinator = createDraftCoordinator(state.api)
  coordinator.connect()
  await coordinator.open('task', task.id, taskToDraft(task))
  await state.prepare()
  state.resume({ replaced: false, synchronizedTasks: [sync] })
  expect(coordinator.paused.value).toBe(false)
  expect(await coordinator.open('task', task.id, taskToDraft(task))).toEqual(taskToDraft(arranged))
  expect(state.put).not.toHaveBeenCalled()
  coordinator.update('task', task.id, { ...taskToDraft(arranged), notes: 'later edit' })
  await coordinator.flush()
  expect(state.put).toHaveBeenCalledWith(expect.objectContaining({ baseUpdatedAt: 'after', payload: expect.objectContaining({ plan: arranged.plan }) }))
  coordinator.dispose()
})

it('never overwrites dirty or persisted pending input with a synchronization event', async () => {
  for (const persisted of [false, true]) {
    const state = fixture()
    const coordinator = createDraftCoordinator(state.api)
    coordinator.connect()
    await coordinator.open('task', task.id, taskToDraft(task))
    coordinator.update('task', task.id, { ...taskToDraft(task), notes: 'keep this' })
    if (persisted) await coordinator.flush()
    state.resume({ replaced: false, synchronizedTasks: [sync] })
    expect(coordinator.synchronizedTasks.value).toEqual([])
    expect((await coordinator.open('task', task.id, taskToDraft(task))).notes).toBe('keep this')
    expect(coordinator.paused.value).toBe(false)
    coordinator.dispose()
  }
})

it('does not restore an old fallback when editor loading finishes after arrangement', async () => {
  const state = fixture()
  let resolve!: (snapshot: DraftSnapshot) => void
  vi.mocked(state.api.drafts.get).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const coordinator = createDraftCoordinator(state.api)
  coordinator.connect()
  const pending = coordinator.open('task', task.id, taskToDraft(task))
  await state.prepare()
  state.resume({ replaced: false, synchronizedTasks: [sync] })
  resolve({ ...sync.snapshot, baseUpdatedAt: 'before' })
  expect(await pending).toEqual(taskToDraft(arranged))
  coordinator.dispose()
})

it('synchronizes every clean task in a batch while preserving a dirty task', async () => {
  const state = fixture()
  const coordinator = createDraftCoordinator(state.api)
  coordinator.connect()
  await coordinator.open('task', task.id, taskToDraft(task))
  coordinator.update('task', task.id, { ...taskToDraft(task), notes: '保留未提交输入' })
  const second = { ...arranged, id: 'second' }
  const third = { ...arranged, id: 'third' }
  state.resume({ replaced: false, synchronizedTasks: [sync, { ...sync, task: second }, { ...sync, task: third }] })
  expect(coordinator.synchronizedTasks.value.map(value => value.task.id)).toEqual(['second', 'third'])
  expect((await coordinator.open('task', task.id, taskToDraft(task))).notes).toBe('保留未提交输入')
  expect(await coordinator.open('task', second.id, taskToDraft(task))).toEqual(taskToDraft(second))
  expect(await coordinator.open('task', third.id, taskToDraft(task))).toEqual(taskToDraft(third))
  coordinator.dispose()
})

it('debounces, serializes edits and does not resurrect a committed draft', async () => {
  vi.useFakeTimers()
  const { api, put } = fixture()
  const coordinator = createDraftCoordinator(api)
  await coordinator.open('capture', 'global', { title: '' })
  coordinator.update('capture', 'global', { title: 'first' })
  coordinator.update('capture', 'global', { title: 'latest' })
  await vi.advanceTimersByTimeAsync(500)
  expect(put).toHaveBeenCalledOnce()
  expect(put.mock.calls[0][0].payload).toEqual({ title: 'latest' })
  coordinator.update('capture', 'global', { title: 'submit' })
  await coordinator.commit('capture', 'global')
  await vi.advanceTimersByTimeAsync(1000)
  expect(put).toHaveBeenCalledTimes(2)
  expect(api.drafts.commit).toHaveBeenCalledOnce()
  expect(coordinator.status('capture', 'global')).toBe('')
  coordinator.dispose()
})

it('retains failed input, retries it, and pauses edits while a backup is prepared', async () => {
  const fixtureState = fixture()
  const coordinator = createDraftCoordinator(fixtureState.api)
  coordinator.connect()
  await coordinator.open('capture', 'global', { title: '' })
  coordinator.update('capture', 'global', { title: 'retained' })
  fixtureState.put.mockRejectedValueOnce(new Error('disk failure'))
  await expect(fixtureState.prepare()).rejects.toThrow('disk failure')
  expect(coordinator.paused.value).toBe(true)
  expect(coordinator.error('capture', 'global')).toContain('disk failure')
  fixtureState.resume({ replaced: false })
  await coordinator.flush()
  expect(await coordinator.open('capture', 'global', { title: '' })).toEqual({ title: 'retained' })
  await fixtureState.prepare()
  coordinator.update('capture', 'global', { title: 'must not write' })
  fixtureState.resume({ replaced: true })
  expect(coordinator.epoch.value).toBe(1)
  expect(coordinator.status('capture', 'global')).toBe('')
  coordinator.dispose()
})

it('does not turn an unchanged review into completed data when flushing', async () => {
  const { api, put } = fixture()
  const coordinator = createDraftCoordinator(api)
  await coordinator.open('review', '2026-09-07', { date: '2026-09-07', didWell: '' })
  await coordinator.flush()
  expect(put).not.toHaveBeenCalled()
  expect(api.drafts.commit).not.toHaveBeenCalled()
  coordinator.dispose()
})
