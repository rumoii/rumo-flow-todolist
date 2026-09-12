import type { IpcContext } from './context'
import { parseBackup } from './validation'
import type { AppSettings, BackupPayload } from '../../src/shared/contracts'
import { dialog } from 'electron'
import fs from 'node:fs/promises'
import { defaults } from '../database/common'
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
    const currentSettings = repository.settings.getSettings()
    const nextSettings = repository.settings.validateSettings({ automaticUpdateChecks: defaults.automaticUpdateChecks, ...payload.settings } as Partial<AppSettings>)
    const rollback = options.onSettingsChanging?.(nextSettings, currentSettings)
    const restore = () => repository.backup.importBackup({ ...payload, settings: { ...nextSettings } })
    let result
    try {
      result = options.barrier ? await options.barrier.run('import', restore) : restore()
    }
    catch (error) {
      try { rollback?.() }
      catch (rollbackError) { console.error('备份导入失败，快捷键回滚失败', rollbackError) }
      throw error
    }
    const synchronize = (label: string, action: () => void) => {
      try { action() }
      catch (error) { console.error(label, error) }
    }
    synchronize('备份已恢复，但提醒同步失败', () => options.onTasksChanged?.())
    synchronize('备份已恢复，但设置同步失败', () => options.onSettingsChanged?.(repository.settings.getSettings()))
    synchronize('备份已恢复，但数据通知失败', () => options.onDataChanged?.(['all']))
    return result
  })
}
