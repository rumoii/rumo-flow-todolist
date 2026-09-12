import { afterEach, expect, it, vi } from 'vitest'
import { synchronizeRuntimeSettings } from '../electron/runtime-settings'
import type { AppSettings } from '../src/shared/contracts'

const current: AppSettings = { automaticUpdateChecks: true, theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }

afterEach(() => vi.restoreAllMocks())

it('synchronizes only changed runtime services while always notifying windows', () => {
  const services = { notifySettingsChanged: vi.fn(), rescheduleReminders: vi.fn(), setAutomaticUpdates: vi.fn() }
  const next = { ...current, automaticUpdateChecks: false, reviewReminderTime: '21:30' }

  synchronizeRuntimeSettings(current, next, services)

  expect(services.notifySettingsChanged).toHaveBeenCalledExactlyOnceWith(next)
  expect(services.rescheduleReminders).toHaveBeenCalledOnce()
  expect(services.setAutomaticUpdates).toHaveBeenCalledExactlyOnceWith(false)
  services.notifySettingsChanged.mockClear()
  services.rescheduleReminders.mockClear()
  services.setAutomaticUpdates.mockClear()
  synchronizeRuntimeSettings(next, { ...next }, services)
  expect(services.notifySettingsChanged).toHaveBeenCalledOnce()
  expect(services.rescheduleReminders).not.toHaveBeenCalled()
  expect(services.setAutomaticUpdates).not.toHaveBeenCalled()
})

it('continues synchronizing independent services after one fails', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const services = {
    notifySettingsChanged: vi.fn(() => { throw new Error('closed window') }),
    rescheduleReminders: vi.fn(() => { throw new Error('scheduler failure') }),
    setAutomaticUpdates: vi.fn(),
  }

  synchronizeRuntimeSettings(current, { ...current, automaticUpdateChecks: false, reviewReminderEnabled: false }, services)

  expect(services.rescheduleReminders).toHaveBeenCalledOnce()
  expect(services.setAutomaticUpdates).toHaveBeenCalledExactlyOnceWith(false)
  expect(console.error).toHaveBeenCalledTimes(2)
})
