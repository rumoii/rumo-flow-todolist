// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createEditorLeave } from '../src/composables/editor-leave'

it('cancels a leave request while its automatic save is settling', async () => {
  const guard = createEditorLeave()
  let complete!: () => void
  const pending = vi.fn(() => [])
  guard.register({ scope: 'detail', active: () => true, settle: () => new Promise<void>(resolve => { complete = resolve }), pending })
  const request = guard.request()
  guard.cancel()
  complete()
  expect(await request).toBe(false)
  expect(guard.opened.value).toBe(false)
  expect(pending).not.toHaveBeenCalled()
})

it('guards only affected scopes and retries remaining saves after partial failure', async () => {
  const guard = createEditorLeave()
  const first = { id: 'first', label: '第一条', save: vi.fn(async () => undefined), retain: vi.fn(async () => undefined) }
  const second = { id: 'second', label: '第二条', save: vi.fn().mockRejectedValueOnce(new Error('磁盘失败')).mockResolvedValue(undefined), retain: vi.fn(async () => undefined) }
  const unrelated = vi.fn(() => [])
  guard.register({ scope: 'flow', active: () => true, pending: () => [first, second] })
  guard.register({ scope: 'detail', active: () => true, pending: unrelated })
  const pending = guard.request(['flow'])
  await vi.waitFor(() => expect(guard.opened.value).toBe(true))
  expect(await guard.request()).toBe(false)
  await guard.choose('save')
  expect(guard.error.value).toContain('第二条：磁盘失败')
  expect(guard.items.value.map(item => item.id)).toEqual(['second'])
  await guard.choose('save')
  expect(await pending).toBe(true)
  expect(first.save).toHaveBeenCalledOnce()
  expect(second.save).toHaveBeenCalledTimes(2)
  expect(unrelated).not.toHaveBeenCalled()
})

it('does not navigate until retaining succeeds, and cancel never commits input', async () => {
  const guard = createEditorLeave()
  const retain = vi.fn().mockRejectedValueOnce(new Error('写入失败')).mockResolvedValue(undefined)
  const save = vi.fn()
  guard.register({ scope: 'detail', active: () => true, pending: () => [{ id: 'task', label: '任务', save, retain }] })
  const request = guard.request()
  await vi.waitFor(() => expect(guard.opened.value).toBe(true))
  await guard.choose('retain')
  expect(guard.opened.value).toBe(true)
  await guard.choose('cancel')
  expect(await request).toBe(false)
  expect(save).not.toHaveBeenCalled()
  const next = guard.request()
  await vi.waitFor(() => expect(guard.opened.value).toBe(true))
  await guard.choose('retain')
  expect(await next).toBe(true)
})
