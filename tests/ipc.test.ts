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
    registerIpcHandlers({ settings: repository, backup: repository } as never, { onSettingsChanging: () => { throw new Error('shortcut conflict') } })

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
    registerIpcHandlers({ settings: repository, backup: repository } as never, { onSettingsChanging: () => rollback })

    const update = electronState.handlers.get('settings:update')!
    expect(() => update({}, next)).toThrow('database write failed')
    expect(rollback).toHaveBeenCalledOnce()
  })

  it('applies imported shortcut settings before replacing persisted data', async () => {
    const events: string[] = []
    const payload = { format: 'rumo-flow-backup', version: 5, exportedAt: '', taskLists: [], tasks: [], recurrenceRules: [], tags: [], taskTags: [], savedFilters: [], actionLinks: [], drafts: [], flowDays: [], videoReflections: [], settings: next } as const
    const repository = {
      getSettings: vi.fn(() => current),
      validateSettings: vi.fn(() => next),
      importBackup: vi.fn(() => { events.push('import'); return { importedTasks: 0 } }),
    } as unknown as Repository
    registerIpcHandlers({ settings: repository, backup: repository } as never, { onSettingsChanging: () => { events.push('shortcut') } })

    const importBackup = electronState.handlers.get('backup:import')!
    await importBackup({}, payload)

    expect(events).toEqual(['shortcut', 'import'])
    expect(repository.importBackup).toHaveBeenCalledWith(expect.objectContaining({ settings: next }))
  })

  it('returns committed settings when downstream notifications fail', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const rollback = vi.fn()
    const repository = { getSettings: () => current, validateSettings: () => next, updateSettings: vi.fn(() => next) }
    registerIpcHandlers({ settings: repository } as never, {
      onSettingsChanging: () => rollback,
      onSettingsChanged: () => { throw new Error('window destroyed') },
      onDataChanged: () => { throw new Error('notification failed') },
    })
    expect(electronState.handlers.get('settings:update')!({}, next)).toEqual(next)
    expect(rollback).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalledTimes(2)
    errorLog.mockRestore()
  })
})
it('broadcasts action creation to both domains but never broadcasts search or link reads', () => {
  electronState.handlers.clear()
  const onDataChanged = vi.fn()
  const repository = { actions: { create: vi.fn(() => ({ id: 'task' })), search: vi.fn(() => []), related: vi.fn(() => []), facts: vi.fn(() => ({ completed: [], pending: [] })) } }
  registerIpcHandlers(repository as never, { onDataChanged })
  electronState.handlers.get('tasks:search')!({}, '关键词')
  electronState.handlers.get('flow:action-links')!({}, { kind: 'review', key: '2026-09-07' })
  electronState.handlers.get('flow:task-facts')!({}, '2026-09-07')
  expect(onDataChanged).not.toHaveBeenCalled()
  electronState.handlers.get('flow:create-action')!({}, { requestId: 'request' })
  expect(onDataChanged).toHaveBeenCalledExactlyOnceWith(['tasks', 'flow'])
})
