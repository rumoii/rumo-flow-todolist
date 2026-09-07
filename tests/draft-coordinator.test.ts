// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createDraftCoordinator } from '../src/composables/draft-coordinator'
import type { DraftRecord, DraftSnapshot, DraftWrite, TodoApi } from '../src/shared/contracts'

afterEach(() => vi.useRealTimers())

function fixture() {
  let snapshot: DraftSnapshot = { generation: 'first', revision: 0, baseUpdatedAt: null, record: null }
  let prepare: (() => Promise<void>) | undefined
  let resume: ((replaced: boolean) => void) | undefined
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
    onResume: (callback: (replaced: boolean) => void) => { resume = callback; return () => { resume = undefined } },
  } } as unknown as TodoApi
  return { api, put, prepare: () => prepare!(), resume: (replaced: boolean) => resume!(replaced) }
}

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
  fixtureState.resume(false)
  await coordinator.flush()
  expect(await coordinator.open('capture', 'global', { title: '' })).toEqual({ title: 'retained' })
  await fixtureState.prepare()
  coordinator.update('capture', 'global', { title: 'must not write' })
  fixtureState.resume(true)
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
