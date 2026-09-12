import { expect, it, vi } from 'vitest'
import { broadcastDataChanged } from '../electron/window-events'

it('isolates destroyed and failing windows while broadcasting data changes', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const first = { isDestroyed: () => false, webContents: { send: vi.fn(() => { throw new Error('destroyed while sending') }) } }
  const destroyed = { isDestroyed: () => true, webContents: { send: vi.fn() } }
  const last = { isDestroyed: () => false, webContents: { send: vi.fn() } }

  broadcastDataChanged([first, destroyed, last] as never, ['all'])

  expect(first.webContents.send).toHaveBeenCalledExactlyOnceWith('desktop:data-changed', ['all'])
  expect(destroyed.webContents.send).not.toHaveBeenCalled()
  expect(last.webContents.send).toHaveBeenCalledExactlyOnceWith('desktop:data-changed', ['all'])
  expect(log).toHaveBeenCalledOnce()
  log.mockRestore()
})
