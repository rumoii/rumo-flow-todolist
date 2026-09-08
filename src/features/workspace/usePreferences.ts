import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppSettings, DesktopStatus } from '../../shared/contracts'
interface Dependencies {
  loadData: () => Promise<void>
  notify: (message: string) => void
}
export function usePreferences({ loadData, notify }: Dependencies) {
  const hasApi = () => Boolean(window.todoApi)
  const initialTheme = new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light'
  const settings = ref<AppSettings>({ automaticUpdateChecks: true, theme: initialTheme, density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' })
  let savedSettings: AppSettings = { ...settings.value }
  const desktopStatus = ref<DesktopStatus>({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: false })
  const settingsOpen = ref(false)
  const settingsSaving = ref(false)
  let removeSettingsListener: (() => void) | undefined
  onMounted(() => { removeSettingsListener = window.todoApi?.settings?.onChanged?.(adoptSettings) })
  onBeforeUnmount(() => { removeSettingsListener?.() })
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
  async function saveSettings(input: Partial<AppSettings>, label = '设置') {
    if (settingsSaving.value)
      return false
    const patch = { ...input }
    settingsSaving.value = true
    settings.value = { ...savedSettings, ...patch }
    applySettings()
    try {
      if (hasApi())
        settings.value = await window.todoApi.settings.update(patch)
      savedSettings = { ...settings.value }
      applySettings()
    }
    catch (error) {
      console.error(`${label}保存失败`, error)
      settings.value = { ...savedSettings }
      applySettings()
      const message = error instanceof Error ? error.message : ''
      const validation = message.match(/设置无效：[^\n]+/)?.[0]
      notify(validation ? `${label}保存失败，${validation}` : `${label}保存失败，已恢复原设置，请重试`)
      return false
    }
    finally {
      settingsSaving.value = false
    }
    if (hasApi())
      try {
        desktopStatus.value = await window.todoApi.desktop.status()
      }
      catch { }
    notify(`${label}已保存`)
    return true
  }
  function adoptSettings(value: AppSettings) { if (!settingsSaving.value) {
    settings.value = { ...settings.value, ...value }
    savedSettings = { ...settings.value }
    applySettings()
  } }
  return { settings, desktopStatus, settingsOpen, settingsSaving, exportBackup, importBackup, applySettings, saveSettings, adoptSettings }
}
