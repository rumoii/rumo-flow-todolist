import { dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import type { AppSettings, BackupPayload, CreateSavedFilterInput, CreateTagInput, CreateTaskInput, CreateTaskListInput, CreateVideoReflectionInput, SaveDailyReviewInput, TaskQuery, UpdateSavedFilterInput, UpdateTagInput, UpdateTaskInput, UpdateTaskListInput, UpdateVideoReflectionInput } from '../src/shared/contracts'
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

function ids(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${field} 格式错误`)
  return value
}

function taskPolicy(value: unknown): 'keep' | 'delete' {
  if (value === undefined) return 'keep'
  if (value !== 'keep' && value !== 'delete') throw new Error('任务处理策略无效')
  return value
}

function parseBackup(input: BackupPayload | string): BackupPayload {
  if (typeof input === 'string') return JSON.parse(input) as BackupPayload
  return object<BackupPayload>(input, '备份数据')
}

export function registerIpcHandlers(options: { onTasksChanged?: () => void; onScheduleChanged?: () => void; openQuickCapture?: () => void; desktopStatus?: () => { globalShortcut: string; globalShortcutRegistered: boolean }; onSettingsChanged?: (settings: AppSettings) => void } = {}): void {
  const changed = <T>(value: T): T => { options.onTasksChanged?.(); return value }
  ipcMain.handle('tasks:list', (_event, query) => repository.listTasks((query ?? {}) as TaskQuery))
  ipcMain.handle('tasks:create', (_event, input) => changed(repository.createTask(object<CreateTaskInput>(input, '任务'))))
  ipcMain.handle('tasks:update', (_event, taskId, input) => changed(repository.updateTask(text(taskId, '任务编号'), object<UpdateTaskInput>(input, '任务'))))
  ipcMain.handle('tasks:complete', (_event, taskId) => changed(repository.completeTask(text(taskId, '任务编号'))))
  ipcMain.handle('tasks:restore', (_event, taskId) => changed(repository.restoreTask(text(taskId, '任务编号'))))
  ipcMain.handle('tasks:remove', (_event, taskId) => changed(repository.removeTask(text(taskId, '任务编号'))))
  ipcMain.handle('tasks:restore-removed', (_event, taskId) => changed(repository.restoreRemoved(text(taskId, '任务编号'))))
  ipcMain.handle('tasks:reorder', (_event, taskIds) => repository.reorderTasks(ids(taskIds, '任务顺序')))
  ipcMain.handle('lists:list', () => repository.listLists())
  ipcMain.handle('lists:create', (_event, input) => repository.createList(object<CreateTaskListInput>(input, '清单')))
  ipcMain.handle('lists:update', (_event, listId, input) => repository.updateList(text(listId, '清单编号'), object<UpdateTaskListInput>(input, '清单')))
  ipcMain.handle('lists:remove', (_event, listId, options) => repository.removeList(text(listId, '清单编号'), taskPolicy(object<{ taskPolicy?: unknown }>(options ?? {}, '删除选项').taskPolicy)))
  ipcMain.handle('lists:reorder', (_event, listIds) => repository.reorderLists(ids(listIds, '清单顺序')))
  ipcMain.handle('tags:list', () => repository.listTags())
  ipcMain.handle('tags:create', (_event, input) => repository.createTag(object<CreateTagInput>(input, '标签')))
  ipcMain.handle('tags:update', (_event, tagId, input) => repository.updateTag(text(tagId, '标签编号'), object<UpdateTagInput>(input, '标签')))
  ipcMain.handle('tags:remove', (_event, tagId) => repository.removeTag(text(tagId, '标签编号')))
  ipcMain.handle('filters:list', () => repository.listSavedFilters())
  ipcMain.handle('filters:create', (_event, input) => repository.createSavedFilter(object<CreateSavedFilterInput>(input, '筛选')))
  ipcMain.handle('filters:update', (_event, filterId, input) => repository.updateSavedFilter(text(filterId, '筛选编号'), object<UpdateSavedFilterInput>(input, '筛选')))
  ipcMain.handle('filters:remove', (_event, filterId) => repository.removeSavedFilter(text(filterId, '筛选编号')))
  ipcMain.handle('flow:get-day', (_event, date) => repository.getFlowDay(text(date, '日期')))
  ipcMain.handle('flow:save-review', (_event, input) => { const result = repository.saveFlowReview(object<SaveDailyReviewInput>(input, '每日复盘')); options.onScheduleChanged?.(); return result })
  ipcMain.handle('flow:create-video', (_event, input) => repository.createFlowVideo(object<CreateVideoReflectionInput>(input, '视频记录')))
  ipcMain.handle('flow:update-video', (_event, videoId, input) => repository.updateFlowVideo(text(videoId, '视频记录编号'), object<UpdateVideoReflectionInput>(input, '视频记录')))
  ipcMain.handle('flow:remove-video', (_event, videoId) => repository.removeFlowVideo(text(videoId, '视频记录编号')))
  ipcMain.handle('flow:month', (_event, month) => repository.listFlowMonth(text(month, '月份')))
  ipcMain.handle('flow:summary', (_event, days) => repository.getFlowSummary(days === undefined ? 7 : Number(days)))
  ipcMain.handle('settings:get', () => repository.getSettings())
  ipcMain.handle('settings:update', (_event, input) => { const result = repository.updateSettings(object(input, '设置')); options.onSettingsChanged?.(result); return result })
  ipcMain.handle('desktop:status', () => options.desktopStatus?.() ?? { globalShortcut: repository.getSettings().globalShortcut, globalShortcutRegistered: false })
  ipcMain.handle('desktop:open-quick-capture', () => options.openQuickCapture?.())
  ipcMain.handle('desktop:open-external', async (_event, input) => { const value = text(input, '链接'); const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 链接'); await shell.openExternal(url.toString()) })
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
    const result = repository.importBackup(payload)
    options.onTasksChanged?.()
    options.onSettingsChanged?.(repository.getSettings())
    return result
  })
}
