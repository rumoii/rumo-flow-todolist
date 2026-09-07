import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../src/shared/contracts'

const electronState = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: { handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => electronState.handlers.set(channel, handler)) },
  shell: { openExternal: vi.fn() },
}))

import { registerIpcHandlers } from '../electron/ipc'
import type { Repository } from '../electron/database/repository'

const current: AppSettings = { theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }
const next: AppSettings = { ...current, globalShortcut: 'Ctrl+Shift+Space' }

describe('settings IPC ordering', () => {
  beforeEach(() => { electronState.handlers.clear() })

  it('does not persist settings when applying the shortcut fails', () => {
    const repository = {
      getSettings: vi.fn(() => current),
      validateSettings: vi.fn(() => next),
      updateSettings: vi.fn(),
    } as unknown as Repository
    registerIpcHandlers(repository, { onSettingsChanging: () => { throw new Error('shortcut conflict') } })

    const update = electronState.handlers.get('settings:update')!
    expect(() => update({}, next)).toThrow('shortcut conflict')
    expect(repository.updateSettings).not.toHaveBeenCalled()
  })

  it('restores the previous desktop state when persistence fails', () => {
    const rollback = vi.fn()
    const repository = {
      getSettings: vi.fn(() => current),
      validateSettings: vi.fn(() => next),
      updateSettings: vi.fn(() => { throw new Error('database write failed') }),
    } as unknown as Repository
    registerIpcHandlers(repository, { onSettingsChanging: () => rollback })

    const update = electronState.handlers.get('settings:update')!
    expect(() => update({}, next)).toThrow('database write failed')
    expect(rollback).toHaveBeenCalledOnce()
  })

  it('applies imported shortcut settings before replacing persisted data', async () => {
    const events: string[] = []
    const payload = { format: 'rumo-flow-backup', version: 3, exportedAt: '', taskLists: [], tasks: [], recurrenceRules: [], flowDays: [], videoReflections: [], settings: next } as const
    const repository = {
      getSettings: vi.fn(() => current),
      validateSettings: vi.fn(() => next),
      importBackup: vi.fn(() => { events.push('import'); return { importedTasks: 0 } }),
    } as unknown as Repository
    registerIpcHandlers(repository, { onSettingsChanging: () => { events.push('shortcut') } })

    const importBackup = electronState.handlers.get('backup:import')!
    await importBackup({}, payload)

    expect(events).toEqual(['shortcut', 'import'])
    expect(repository.importBackup).toHaveBeenCalledWith(expect.objectContaining({ settings: next }))
  })
})
