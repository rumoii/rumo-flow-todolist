import type { AppSettings } from '../src/shared/contracts'

interface RuntimeSettingsServices {
  notifySettingsChanged: (settings: AppSettings) => void
  rescheduleReminders: () => void
  setAutomaticUpdates: (enabled: boolean) => void
}

function synchronize(label: string, action: () => void): void {
  try { action() }
  catch (error) { console.error(label, error) }
}

export function synchronizeRuntimeSettings(current: AppSettings, next: AppSettings, services: RuntimeSettingsServices): void {
  synchronize('设置已保存，但窗口设置通知失败', () => services.notifySettingsChanged(next))
  if (next.reviewReminderEnabled !== current.reviewReminderEnabled || next.reviewReminderTime !== current.reviewReminderTime)
    synchronize('设置已保存，但复盘提醒同步失败', services.rescheduleReminders)
  if (next.automaticUpdateChecks !== current.automaticUpdateChecks)
    synchronize('设置已保存，但自动更新同步失败', () => services.setAutomaticUpdates(next.automaticUpdateChecks))
}
