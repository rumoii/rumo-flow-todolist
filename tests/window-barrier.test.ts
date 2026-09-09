import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ listeners: new Map<string, (...args: any[]) => void>(), windows: [] as any[] }))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => state.windows },
  ipcMain: { on: (name: string, callback: (...args: any[]) => void) => state.listeners.set(name, callback) },
}))
import { WindowBarrier } from '../electron/window-barrier'
beforeEach(() => { state.windows = []; state.listeners.clear() })
afterEach(() => vi.useRealTimers())

it('closing one window only asks that window, while quitting still covers every window', async () => {
  const prepared: number[] = []
  state.windows = [1, 2].map(id => ({ isDestroyed: () => false, webContents: { id, send: vi.fn((channel, payload) => {
    if (channel === 'lifecycle:prepare') { prepared.push(id); state.listeners.get('lifecycle:ack')!({ sender: { id } }, payload) }
  }) } }))
  const barrier = new WindowBarrier()
  await barrier.run('close', () => undefined, { windowIds: [2] })
  expect(prepared).toEqual([2])
  prepared.length = 0
  await barrier.run('close', () => undefined)
  expect(prepared).toEqual([1, 2])
})

it('resumes all windows after a rejected flush without running the arrangement', async () => {
  const requests: Array<{ id: string }> = []
  state.windows = [1, 2].map(id => ({ isDestroyed: () => false, webContents: { id, send: vi.fn((channel, payload) => { if (channel === 'lifecycle:prepare') requests.push(payload) }) } }))
  const barrier = new WindowBarrier()
  const action = vi.fn()
  const pending = barrier.run('arrange', action, { taskIds: ['target'], read: () => [] })
  state.listeners.get('lifecycle:ack')!({ sender: { id: 1 } }, { ...requests[0], error: 'disk failed' })
  await expect(pending).rejects.toThrow('disk failed')
  expect(action).not.toHaveBeenCalled()
  expect(barrier.running).toBe(false)
  for (const window of state.windows) expect(window.webContents.send).toHaveBeenLastCalledWith('lifecycle:resume', { replaced: false })
})

it('preserves a successful result and resumes remaining windows when one notification fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const barrier = new WindowBarrier()
  state.windows = [1, 2].map(id => ({ isDestroyed: () => false, webContents: { id, send: vi.fn((channel, payload) => {
    if (channel === 'lifecycle:prepare') state.listeners.get('lifecycle:ack')!({ sender: { id } }, payload)
    else if (id === 1) throw new Error('destroyed')
  }) } }))
  const sync = { task: { id: 'target' }, snapshot: { record: null } } as never
  await expect(barrier.run('arrange', () => 'committed', { taskIds: ['target'], read: () => [sync] })).resolves.toBe('committed')
  expect(state.windows[1].webContents.send).toHaveBeenLastCalledWith('lifecycle:resume', { replaced: false, synchronizedTasks: [sync] })
  expect(barrier.locked).toBe(false)
  log.mockRestore()
})

it('requires acknowledgements from every window and locks only after flush', async () => {
  const requests: Array<{ sender: number; request: { id: string } }> = []
  state.windows = [1, 2].map(id => ({ isDestroyed: () => false, webContents: { id, send: vi.fn((channel, request) => { if (channel === 'lifecycle:prepare') requests.push({ sender: id, request }) }) } }))
  const barrier = new WindowBarrier()
  const operation = vi.fn(() => { expect(barrier.locked).toBe(true); return 42 })
  const pending = barrier.run('import', operation)
  expect(barrier.locked).toBe(false)
  const acknowledge = state.listeners.get('lifecycle:ack')!
  acknowledge({ sender: { id: 99 } }, requests[0].request)
  expect(operation).not.toHaveBeenCalled()
  for (const request of requests) acknowledge({ sender: { id: request.sender } }, request.request)
  expect(await pending).toBe(42)
  expect(barrier.locked).toBe(false)
  for (const window of state.windows) expect(window.webContents.send).toHaveBeenLastCalledWith('lifecycle:resume', { replaced: true })
})

it('aborts on timeout, resumes editing and rejects overlapping operations', async () => {
  vi.useFakeTimers()
  const send = vi.fn()
  state.windows = [{ isDestroyed: () => false, webContents: { id: 1, send } }]
  const barrier = new WindowBarrier()
  const action = vi.fn()
  const pending = barrier.run('backup', action)
  const rejection = expect(pending).rejects.toThrow('窗口未能确认')
  await expect(barrier.run('import', action)).rejects.toThrow('正在保留')
  await vi.advanceTimersByTimeAsync(10000)
  await rejection
  expect(action).not.toHaveBeenCalled()
  expect(send).toHaveBeenLastCalledWith('lifecycle:resume', { replaced: false })
  expect(barrier.running).toBe(false)
})

it('holds all windows and the write lock until an installation is cancelled', async () => {
  const barrier = new WindowBarrier()
  state.windows = [1, 2].map(id => ({ isDestroyed: () => false, webContents: { id, send: vi.fn((channel, payload) => {
    if (channel === 'lifecycle:prepare') state.listeners.get('lifecycle:ack')!({ sender: { id } }, payload)
  }) } }))
  const install = vi.fn(() => { expect(barrier.locked).toBe(true) })
  await barrier.run('update', install, { hold: true })
  expect(install).toHaveBeenCalledOnce()
  expect(barrier.locked).toBe(true)
  expect(barrier.running).toBe(true)
  for (const window of state.windows) expect(window.webContents.send).toHaveBeenCalledTimes(1)
  await expect(barrier.run('backup', () => undefined)).rejects.toThrow('正在保留')
  barrier.release()
  expect(barrier.locked).toBe(false)
  for (const window of state.windows) expect(window.webContents.send).toHaveBeenLastCalledWith('lifecycle:resume', { replaced: false })
})

it('does not retain an installation lock after preparation or launch failure', async () => {
  const barrier = new WindowBarrier()
  state.windows = []
  await expect(barrier.run('update', () => { throw new Error('cannot launch') }, { hold: true })).rejects.toThrow('cannot launch')
  expect(barrier.locked).toBe(false)
  expect(barrier.running).toBe(false)
})
