import type { IpcContext } from './context'
import { object } from './validation'
export function registerSettings({ repository, options, handle, changed }: IpcContext): void {
  handle('settings:get', () => repository.settings.getSettings())
  handle('settings:update', (_event, input) => {
    const current = repository.settings.getSettings()
    const next = repository.settings.validateSettings(object(input, '设置'))
    const rollback = options.onSettingsChanging?.(next, current)
    try {
      const result = repository.settings.updateSettings(next)
      options.onSettingsChanged?.(result)
      return result
    }
    catch (error) {
      rollback?.()
      throw error
    }
  })
}
