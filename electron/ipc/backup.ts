import type { IpcContext } from './context'
import { parseBackup } from './validation'
import type { AppSettings, BackupPayload } from '../../src/shared/contracts'
import { dialog } from 'electron'
import fs from 'node:fs/promises'
export function registerBackup({ repository, options, handle, changed }: IpcContext): void {
  handle('backup:export', async () => {
    const payload = repository.backup.exportBackup()
    const result = await dialog.showSaveDialog({ title: '导出 Rumo-Flow 备份', defaultPath: `rumo-flow-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] })
    if (result.canceled || !result.filePath)
      return null
    const write = async () => { const payload = repository.backup.exportBackup(); await fs.writeFile(result.filePath!, JSON.stringify(payload, null, 2), 'utf8'); }
    if (options.barrier)
      await options.barrier.run('backup', write)
    else
      await write()
    return result.filePath
  })
  handle('backup:import', async (_event, input) => {
    let payload: BackupPayload
    if (input === undefined || (typeof input === 'string' && input.trim() === '')) {
      const result = await dialog.showOpenDialog({ title: '选择 Rumo-Flow 备份', properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }] })
      if (result.canceled || !result.filePaths[0])
        return null
      payload = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')) as BackupPayload
    }
    else
      payload = parseBackup(input)
    if (options.confirmImport && !await options.confirmImport())
      return null
    const restore = () => {
      const currentSettings = repository.settings.getSettings()
      const nextSettings = repository.settings.validateSettings(payload.settings as Partial<AppSettings>)
      const rollback = options.onSettingsChanging?.(nextSettings, currentSettings)
      try {
        const result = repository.backup.importBackup({ ...payload, settings: { ...nextSettings } })
        options.onTasksChanged?.()
        options.onSettingsChanged?.(repository.settings.getSettings())
        return result
      }
      catch (error) {
        rollback?.()
        throw error
      }
    }
    const result = options.barrier ? await options.barrier.run('import', restore) : restore()
    options.onDataChanged?.(['all'])
    return result
  })
}
