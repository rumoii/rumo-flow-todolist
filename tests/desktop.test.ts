import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  register: vi.fn<(shortcut: string, callback: () => void) => boolean>(),
  unregister: vi.fn<(shortcut: string) => void>(),
}))

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  Tray: class {
    setToolTip() {}
    setContextMenu() {}
    on() {}
  },
  globalShortcut: {
    register: electronState.register,
    unregister: electronState.unregister,
    unregisterAll: vi.fn(),
  },
}))

import { DesktopController } from '../electron/desktop'

describe('DesktopController shortcut lifecycle', () => {
  beforeEach(() => {
    electronState.register.mockReset()
    electronState.unregister.mockReset()
  })

  it('keeps the previous shortcut when a replacement cannot be registered', () => {
    electronState.register.mockReturnValueOnce(true).mockReturnValueOnce(false)
    const controller = new DesktopController(() => undefined, vi.fn() as never, 'icon.ico', undefined, 'index.html')

    expect(controller.registerShortcut('Ctrl+Alt+Space')).toBe(true)
    expect(controller.registerShortcut('Ctrl+Shift+Space')).toBe(false)

    expect(controller.shortcut).toBe('Ctrl+Alt+Space')
    expect(controller.shortcutRegistered).toBe(true)
    expect(electronState.unregister).not.toHaveBeenCalled()
  })

  it('reports the configured shortcut when registration fails during startup', () => {
    electronState.register.mockReturnValue(false)
    const controller = new DesktopController(() => undefined, vi.fn() as never, 'icon.ico', undefined, 'index.html')

    controller.start('Ctrl+Shift+Space')

    expect(controller.shortcut).toBe('Ctrl+Shift+Space')
    expect(controller.shortcutRegistered).toBe(false)
  })

  it('unregisters the previous shortcut only after the new one succeeds', () => {
    electronState.register.mockReturnValue(true)
    const controller = new DesktopController(() => undefined, vi.fn() as never, 'icon.ico', undefined, 'index.html')
    controller.registerShortcut('Ctrl+Alt+Space')

    expect(controller.registerShortcut('Ctrl+Shift+Space')).toBe(true)
    expect(electronState.unregister).toHaveBeenCalledWith('Ctrl+Alt+Space')
    expect(controller.shortcut).toBe('Ctrl+Shift+Space')
  })
})
