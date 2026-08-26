import { dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import type { BackupPayload, CreateTaskInput, CreateTaskListInput, TaskQuery, UpdateTaskInput, UpdateTaskListInput } from '../src/shared/contracts'
import { Repository } from './database/repository'

const repository = new Repository()

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} 必须是字符串`)
  return value
}

function object<T>(value: unknown, field: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 格式错误`)
  return value as T
}

function parseBackup(input: BackupPayload | string): BackupPayload {
  if (typeof input === 'string') return JSON.parse(input) as BackupPayload
  return object<BackupPayload>(input, '备份数据')
}

export function registerIpcHandlers(): void {
  ipcMain.handle('tasks:list', (_event, query) => repository.listTasks((query ?? {}) as TaskQuery))
  ipcMain.handle('tasks:create', (_event, input) => repository.createTask(object<CreateTaskInput>(input, '任务')))
  ipcMain.handle('tasks:update', (_event, taskId, input) => repository.updateTask(text(taskId, '任务编号'), object<UpdateTaskInput>(input, '任务')))
  ipcMain.handle('tasks:complete', (_event, taskId) => repository.completeTask(text(taskId, '任务编号')))
  ipcMain.handle('tasks:restore', (_event, taskId) => repository.restoreTask(text(taskId, '任务编号')))
  ipcMain.handle('tasks:remove', (_event, taskId) => repository.removeTask(text(taskId, '任务编号')))
  ipcMain.handle('lists:list', () => repository.listLists())
  ipcMain.handle('lists:create', (_event, input) => repository.createList(object<CreateTaskListInput>(input, '清单')))
  ipcMain.handle('lists:update', (_event, listId, input) => repository.updateList(text(listId, '清单编号'), object<UpdateTaskListInput>(input, '清单')))
  ipcMain.handle('lists:remove', (_event, listId) => repository.removeList(text(listId, '清单编号')))
  ipcMain.handle('backup:export', async () => {
    const payload = repository.exportBackup()
    const result = await dialog.showSaveDialog({ title: '导出 Rumo-Flow 备份', defaultPath: `rumo-flow-${payload.exportedAt.slice(0, 10)}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return null
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return result.filePath
  })
  ipcMain.handle('backup:import', async (_event, input) => {
    let payload: BackupPayload
    if (input === undefined || (typeof input === 'string' && input.trim() === '')) {
      const result = await dialog.showOpenDialog({ title: '选择 Rumo-Flow 备份', properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }] })
      if (result.canceled || !result.filePaths[0]) return null
      payload = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')) as BackupPayload
    } else payload = parseBackup(input)
    return repository.importBackup(payload)
  })
}
