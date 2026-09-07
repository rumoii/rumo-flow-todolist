import { ipcMain } from 'electron'
import type { Repository } from './database/repository'
import type { DataDomain } from '../src/shared/contracts'
import type { IpcOptions } from './ipc/context'
import { registerTasks } from './ipc/tasks'
import { registerOrganization } from './ipc/organization'
import { registerFlow } from './ipc/flow'
import { registerDrafts } from './ipc/drafts'
import { registerSettings } from './ipc/settings'
import { registerBackup } from './ipc/backup'
import { registerDesktop } from './ipc/desktop'
export function registerIpcHandlers(repository: Repository, options: IpcOptions = {}): void {
  const handle: typeof ipcMain.handle = (channel, listener) => ipcMain.handle(channel, (event, ...args) => {
    if (options.barrier?.locked)
      throw new Error('数据恢复中，请稍后重试')
    const notify = (result: unknown) => {
      const domain = channel.split(':')[0]
      const operation = channel.split(':')[1]
      if (!['get', 'list', 'status', 'get-day', 'month', 'summary', 'export', 'import', 'search', 'action-links', 'task-facts'].includes(operation)) {
        const domains: DataDomain[] = domain === 'tasks' ? ['tasks'] : ['lists', 'tags', 'filters'].includes(domain) ? ['organization', 'tasks'] : domain === 'flow' ? (operation === 'create-action' ? ['tasks', 'flow'] : ['flow']) : domain === 'settings' ? ['settings'] : domain === 'drafts' && operation === 'commit' ? ['tasks', 'flow', 'organization'] : []
        if (domains.length) {
          try { options.onDataChanged?.(domains) }
          catch (error) { console.error('数据已保存，但变更通知失败', error) }
        }
      }
      return result
    }
    const result = listener(event, ...args)
    return result instanceof Promise ? result.then(notify) : notify(result)
  })
  const changed = <T>(value: T): T => { options.onTasksChanged?.(); return value; }
  const context = { repository, options, handle, changed }
  registerTasks(context)
  registerOrganization(context)
  registerFlow(context)
  registerDrafts(context)
  registerSettings(context)
  registerBackup(context)
  registerDesktop(context)
}
