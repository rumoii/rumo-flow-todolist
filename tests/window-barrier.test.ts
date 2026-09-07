import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ listeners: new Map<string, (...args: any[]) => void>(), windows: [] as any[] }))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => state.windows },
  ipcMain: { on: (name: string, callback: (...args: any[]) => void) => state.listeners.set(name, callback) },
}))
import { WindowBarrier } from '../electron/window-barrier'
beforeEach(() => { state.windows = []; state.listeners.clear() })
afterEach(() => vi.useRealTimers())

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
  for (const window of state.windows) expect(window.webContents.send).toHaveBeenLastCalledWith('lifecycle:resume', true)
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
  expect(send).toHaveBeenLastCalledWith('lifecycle:resume', false)
  expect(barrier.running).toBe(false)
})
