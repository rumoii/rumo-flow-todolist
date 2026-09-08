import type { ipcMain } from 'electron'
import type { Repository } from '../database/repository'
import type { WindowBarrier } from '../window-barrier'
import type { AppSettings, DataDomain } from '../../src/shared/contracts'
import type { UpdateService } from '../updates'
export type IpcOptions = {
  updates?: UpdateService
  barrier?: WindowBarrier
  onDataChanged?: (domains: DataDomain[]) => void
  confirmImport?: () => Promise<boolean>
  onTasksChanged?: () => void
  onScheduleChanged?: () => void
  openQuickCapture?: () => void
  desktopStatus?: () => {
    globalShortcut: string
    globalShortcutRegistered: boolean
  }
  onSettingsChanging?: (next: AppSettings, current: AppSettings) => (() => void) | void
  onSettingsChanged?: (settings: AppSettings) => void
}
export interface IpcContext {
  repository: Repository
  options: IpcOptions
  handle: typeof ipcMain.handle
  changed: <Value>(value: Value) => Value
}
