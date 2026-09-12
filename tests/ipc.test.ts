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

const current: AppSettings = { automaticUpdateChecks: true, theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }
const next: AppSettings = { ...current, globalShortcut: 'Ctrl+Shift+Space' }
it('does not broadcast data changes from read-only flow history', () => {
  const history = vi.fn(() => ({ entries: [], nextCursor: null }))
  const broadcast = vi.fn()
  registerIpcHandlers({ flow: { history } } as never, { onDataChanged: broadcast })
  const query = { from: '2020-01-01', to: '2020-02-01', keyword: '', pendingOnly: false, reviewedOnly: false }
  expect(electronState.handlers.get('flow:history')!({}, query)).toEqual({ entries: [], nextCursor: null })
  expect(history).toHaveBeenCalledExactlyOnceWith(query)
  expect(broadcast).not.toHaveBeenCalled()
})

it('coordinates batch arrangement and sends all authoritative snapshots after a single transaction', async () => {
  const snapshots = { generation: 'current', record: null, revision: 0 }
  const targets = [{ id: 'first', updatedAt: 'before' }, { id: 'second', updatedAt: 'before' }]
  const batch = vi.fn()
  const broadcast = vi.fn()
  const barrier = { locked: false, run: vi.fn(async (reason, action, synchronization) => {
    expect(reason).toBe('arrange')
    expect(synchronization.taskIds).toEqual(['first', 'second'])
    await action()
    expect(synchronization.read().map((value: any) => value.task.id)).toEqual(['first', 'second'])
  }) }
  registerIpcHandlers({ taskCommands: { batch }, tasks: { getTask: (id: string) => ({ id, updatedAt: 'after' }) }, drafts: { get: () => snapshots } } as never, { barrier: barrier as never, onDataChanged: broadcast })
  const input = { targets, generation: 'current', action: { kind: 'plan', plan: null } }
  await electronState.handlers.get('tasks:batch')!({}, input)
  expect(batch).toHaveBeenCalledExactlyOnceWith(input)
  expect(broadcast).toHaveBeenCalledExactlyOnceWith(['tasks'])
})

it('coordinates arrangement, sends the authoritative snapshot, and broadcasts only actual writes', async () => {
  const input = { taskId: 'task', updatedAt: 'before', generation: 'generation', action: { kind: 'plan', target: 'today' } }
  const task = { id: 'task', updatedAt: 'after' }
  const snapshot = { generation: 'generation', revision: 0, baseUpdatedAt: 'after', record: null }
  const arrange = vi.fn(() => task)
  const onDataChanged = vi.fn()
  const barrier = { locked: false, run: vi.fn(async (reason, action, synchronization) => {
    expect(reason).toBe('arrange')
    expect(synchronization.taskIds).toEqual(['task'])
    const result = action()
    expect(synchronization.read()).toEqual([{ task, snapshot }])
    return result
  }) }
  registerIpcHandlers({ taskCommands: { arrange }, drafts: { get: () => snapshot } } as never, { barrier: barrier as never, onDataChanged })
  const handler = electronState.handlers.get('tasks:arrange')!
  expect(await handler({}, input)).toEqual(task)
  expect(arrange).toHaveBeenCalledWith(input)
  expect(onDataChanged).toHaveBeenCalledExactlyOnceWith(['tasks'])
  onDataChanged.mockClear()
  await handler({}, { ...input, updatedAt: 'after' })
  expect(onDataChanged).not.toHaveBeenCalled()
  arrange.mockImplementationOnce(() => { throw new Error('pending draft') })
  await expect(handler({}, input)).rejects.toThrow('pending draft')
  expect(onDataChanged).not.toHaveBeenCalled()
})

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
    const payload = { format: 'rumo-flow-backup', version: 6, exportedAt: '', taskLists: [], tasks: [], recurrenceRules: [], tags: [], taskTags: [], savedFilters: [], actionLinks: [], drafts: [], flowDays: [], videoReflections: [], settings: next } as const
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

  it('rolls back the shortcut and skips notifications when the import transaction fails', async () => {
    const rollback = vi.fn()
    const onTasksChanged = vi.fn()
    const onSettingsChanged = vi.fn()
    const onDataChanged = vi.fn()
    const payload = { format: 'rumo-flow-backup', version: 6, exportedAt: '', taskLists: [], tasks: [], recurrenceRules: [], tags: [], taskTags: [], savedFilters: [], actionLinks: [], drafts: [], flowDays: [], videoReflections: [], settings: next } as const
    const repository = {
      getSettings: vi.fn(() => current),
      validateSettings: vi.fn(() => next),
      importBackup: vi.fn(() => { throw new Error('database write failed') }),
    } as unknown as Repository
    const barrier = { locked: false, run: vi.fn(async (_reason, action) => action()) }
    registerIpcHandlers({ settings: repository, backup: repository } as never, { barrier: barrier as never, onSettingsChanging: () => rollback, onTasksChanged, onSettingsChanged, onDataChanged })

    await expect(electronState.handlers.get('backup:import')!({}, payload)).rejects.toThrow('database write failed')

    expect(rollback).toHaveBeenCalledOnce()
    expect(onTasksChanged).not.toHaveBeenCalled()
    expect(onSettingsChanged).not.toHaveBeenCalled()
    expect(onDataChanged).not.toHaveBeenCalled()
  })

  it('returns a committed import after the barrier resumes and runs every post-import callback independently', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const events: string[] = []
    const payload = { format: 'rumo-flow-backup', version: 6, exportedAt: '', taskLists: [], tasks: [], recurrenceRules: [], tags: [], taskTags: [], savedFilters: [], actionLinks: [], drafts: [], flowDays: [], videoReflections: [], settings: next } as const
    const imported = { importedTasks: 0 }
    const repository = {
      getSettings: vi.fn().mockReturnValueOnce(current).mockReturnValue(next),
      validateSettings: vi.fn(() => next),
      importBackup: vi.fn(() => { events.push('import'); return imported }),
    } as unknown as Repository
    const barrier = { locked: false, run: vi.fn(async (_reason, action) => {
      events.push('barrier')
      const result = action()
      events.push('resumed')
      return result
    }) }
    registerIpcHandlers({ settings: repository, backup: repository } as never, {
      barrier: barrier as never,
      onSettingsChanging: () => { events.push('shortcut') },
      onTasksChanged: () => { events.push('reminders'); throw new Error('scheduler failed') },
      onSettingsChanged: () => { events.push('settings'); throw new Error('settings failed') },
      onDataChanged: () => { events.push('data'); throw new Error('window failed') },
    })

    await expect(electronState.handlers.get('backup:import')!({}, payload)).resolves.toBe(imported)

    expect(events).toEqual(['shortcut', 'barrier', 'import', 'resumed', 'reminders', 'settings', 'data'])
    expect(log).toHaveBeenCalledTimes(3)
    log.mockRestore()
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
