import { ref } from 'vue'
import type { AppSettings, DesktopStatus } from '../../shared/contracts'
interface Dependencies {
  loadData: () => Promise<void>
  notify: (message: string) => void
}
export function usePreferences({ loadData, notify }: Dependencies) {
  const hasApi = () => Boolean(window.todoApi)
  const settings = ref<AppSettings>({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' })
  let savedSettings: AppSettings = { ...settings.value }
  const desktopStatus = ref<DesktopStatus>({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: false })
  const settingsOpen = ref(false)
  async function exportBackup() { if (!hasApi()) {
    notify('请在桌面应用中导出备份')
    return
  } try {
    const filePath = await window.todoApi.backup.export()
    if (filePath)
      notify('备份已导出')
  }
  catch {
    notify('备份导出失败')
  } }
  async function importBackup() { if (!hasApi()) {
    notify('请在桌面应用中恢复备份')
    return
  } try {
    const result = await window.todoApi.backup.import()
    if (result) {
      settingsOpen.value = false
      await loadData()
      notify(`已恢复 ${result.importedTasks} 个任务`)
    }
  }
  catch {
    notify('备份恢复失败，现有数据未改变')
  } }
  function applySettings() {
    document.documentElement.dataset.theme = settings.value.theme
    document.documentElement.dataset.density = settings.value.density
  }
  async function saveSettings() {
    settings.value.dailyVideoLimit = Math.min(10, Math.max(0, Math.round(Number(settings.value.dailyVideoLimit) || 0)))
    applySettings()
    try {
      if (hasApi())
        settings.value = await window.todoApi.settings.update(settings.value)
      savedSettings = { ...settings.value }
      applySettings()
    }
    catch {
      settings.value = { ...savedSettings }
      applySettings()
      notify('偏好保存失败，请检查设置值')
      return
    }
    if (hasApi())
      try {
        desktopStatus.value = await window.todoApi.desktop.status()
      }
      catch { }
    notify('偏好已保存')
  }
  function adoptSettings(value: AppSettings) { if (!settingsOpen.value) {
    settings.value = { ...settings.value, ...value }
    savedSettings = { ...settings.value }
    applySettings()
  } }
  return { settings, desktopStatus, settingsOpen, exportBackup, importBackup, applySettings, saveSettings, adoptSettings }
}
