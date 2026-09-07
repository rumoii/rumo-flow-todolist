import type { IpcContext } from './context'
import { object } from './validation'
export function registerSettings({ repository, options, handle, changed }: IpcContext): void {
  handle('settings:get', () => repository.settings.getSettings())
  handle('settings:update', (_event, input) => {
    const current = repository.settings.getSettings()
    const next = repository.settings.validateSettings(object(input, '设置'))
    const rollback = options.onSettingsChanging?.(next, current)
    let result
    try {
      result = repository.settings.updateSettings(next)
    }
    catch (error) {
      rollback?.()
      throw error
    }
    try { options.onSettingsChanged?.(result) }
    catch (error) { console.error('设置已保存，但桌面同步失败', error) }
    return result
  })
}
