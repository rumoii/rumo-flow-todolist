// @vitest-environment jsdom
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { Task, TodoApi } from '../src/shared/contracts'
import { useBatchSelection } from '../src/features/workspace/useBatchSelection'
const task = (id: string) => ({ id, updatedAt: 'first', parentTaskId: null, deletedAt: null } as Task)
const scopes: ReturnType<typeof effectScope>[] = []
function fixture() {
  const batch = vi.fn().mockResolvedValue(undefined)
  window.todoApi = { tasks: { batch }, drafts: { get: async () => ({ generation: 'generation' }) } } as unknown as TodoApi
  const candidates = ref([task('first'), task('second')])
  const page = ref('today')
  const refresh = vi.fn().mockResolvedValue(undefined)
  const scope = effectScope()
  scopes.push(scope)
  const selection = scope.run(() => useBatchSelection(candidates, page, refresh))!
  return { selection, candidates, page, refresh, batch }
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); delete window.todoApi })
it('deduplicates visible candidates and clears only disappearing selections or changed scopes', async () => {
  const { selection, candidates, page } = fixture()
  candidates.value.push(task('first'))
  await selection.enter(); selection.selectAll()
  expect(selection.selected.value).toHaveLength(2)
  candidates.value.reverse(); await nextTick()
  expect(selection.selected.value).toHaveLength(2)
  candidates.value = [task('second')]; await nextTick()
  expect(selection.selected.value.map(task => task.id)).toEqual(['second'])
  page.value = 'week'
  expect(selection.selected.value).toEqual([])
  expect(selection.active.value).toBe(false)
})
it('limits selection to 500 and does not silently truncate select-all', async () => {
  const { selection, candidates } = fixture()
  candidates.value = Array.from({ length: 501 }, (_, index) => task(`${index}`))
  await selection.enter(); selection.selectAll()
  expect(selection.selected.value).toHaveLength(0)
  for (const task of candidates.value) selection.toggle(task)
  expect(selection.selected.value).toHaveLength(500)
  expect(selection.error.value).toContain('500')
})
it('retains versions and selection on server failure; refresh retry never repeats a committed batch', async () => {
  const { selection, candidates, batch, refresh } = fixture()
  await selection.enter(); selection.selectAll()
  candidates.value = candidates.value.map(task => ({ ...task, updatedAt: 'second' })); await nextTick()
  batch.mockRejectedValueOnce(new Error('任务已变化'))
  await selection.apply({ kind: 'complete' })
  expect(batch).toHaveBeenCalledWith(expect.objectContaining({ generation: 'generation', targets: [{ id: 'first', updatedAt: 'first' }, { id: 'second', updatedAt: 'first' }] }))
  expect(selection.selected.value).toHaveLength(2)
  refresh.mockRejectedValueOnce(new Error('offline'))
  await selection.apply({ kind: 'complete' })
  expect(selection.saved.value).toBe(true)
  expect(selection.error.value).toContain('操作已保存')
  await selection.apply({ kind: 'complete' })
  await selection.reload()
  expect(batch).toHaveBeenCalledTimes(2)
  expect(selection.saved.value).toBe(false)
})
