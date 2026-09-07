import { app, BrowserWindow, Menu, shell, dialog } from 'electron'
import fs from 'node:fs'
import { WindowBarrier } from './window-barrier'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDatabase, getDatabase } from './database/db'
import { registerIpcHandlers } from './ipc'
import { Repository } from './database/repository'
import { DesktopController } from './desktop'
import { ReminderScheduler } from './reminders'
import { loadWindowState, trackWindowState } from './window-state'
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const userDataOverride = app.commandLine.getSwitchValue('user-data-dir')
if (userDataOverride) {
  fs.mkdirSync(path.resolve(userDataOverride), { recursive: true })
  app.setPath('userData', path.resolve(userDataOverride))
}
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance)
  app.quit()
const barrier = new WindowBarrier()
let allowQuit = false
let quitPending = false
const windowIconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(currentDirectory, '../../build/icon.ico')
let mainWindow: BrowserWindow | undefined
let desktop: DesktopController | undefined
let reminderScheduler: ReminderScheduler | undefined
function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F8F8F8',
    title: 'Rumo-Flow',
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url))
    void shell.openExternal(url); return { action: 'deny' }; })
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:') && url !== process.env.ELECTRON_RENDERER_URL)
    event.preventDefault(); })
  window.once('ready-to-show', () => { if (state.maximized)
    window.maximize(); window.show(); })
  trackWindowState(window)
  desktop?.attachCloseBehavior(window)
  if (process.env.ELECTRON_RENDERER_URL)
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else
    void window.loadFile(path.join(currentDirectory, '../renderer/index.html'))
  window.on('closed', () => { if (mainWindow === window)
    mainWindow = undefined; })
  mainWindow = window
  return window
}
if (primaryInstance)
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    getDatabase()
    const repository = new Repository()
    const rendererFile = path.join(currentDirectory, '../renderer/index.html')
    desktop = new DesktopController(() => mainWindow, createWindow, windowIconPath, process.env.ELECTRON_RENDERER_URL, rendererFile)
    desktop.setWindowGuard(() => !barrier.running && !quitPending)
    desktop.setCloseGuard(async () => {
      if (barrier.running)
        return false
      try {
        await barrier.run('close', () => undefined)
        return true
      }
      catch {
        const result = await dialog.showMessageBox({ type: 'warning', message: '草稿尚未成功保留', detail: '取消后可以重试保留。仍然关闭可能丢失最后输入。', buttons: ['取消', '仍然关闭'], defaultId: 0, cancelId: 0 })
        return result.response === 1
      }
    })
    desktop.start(repository.settings.getSettings().globalShortcut)
    reminderScheduler = new ReminderScheduler(repository, (taskId) => desktop?.showMain(taskId), () => desktop?.showFlow())
    registerIpcHandlers(repository, { barrier, confirmImport: async () => (await dialog.showMessageBox({ type: 'warning', message: '恢复备份会替换全部正式数据和草稿', detail: '恢复前会自动保留当前快照。旧版备份没有草稿，恢复后草稿为空。', buttons: ['取消', '恢复备份'], defaultId: 0, cancelId: 0 })).response === 1, onDataChanged: domains => { for (const window of BrowserWindow.getAllWindows())
        if (!window.isDestroyed())
          window.webContents.send('desktop:data-changed', domains); }, onTasksChanged: () => reminderScheduler?.reschedule(), onScheduleChanged: () => reminderScheduler?.reschedule(), openQuickCapture: () => desktop?.showCapture(), desktopStatus: () => ({ globalShortcut: desktop?.shortcut ?? repository.settings.getSettings().globalShortcut, globalShortcutRegistered: desktop?.shortcutRegistered ?? false }), onSettingsChanging: (next, current) => { if (next.globalShortcut === current.globalShortcut)
        return; if (!desktop?.registerShortcut(next.globalShortcut))
        throw new Error('全局快捷键注册失败'); return () => { desktop?.registerShortcut(current.globalShortcut); }; }, onSettingsChanged: (settings) => { desktop?.notifySettingsChanged(settings); reminderScheduler?.reschedule(); } })
    reminderScheduler.start()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0)
      createWindow(); })
  })
app.on('window-all-closed', () => { })
app.on('second-instance', () => { desktop?.showMain(); })
app.on('before-quit', (event) => {
  if (!primaryInstance || allowQuit)
    return
  event.preventDefault()
  if (quitPending || barrier.running)
    return
  quitPending = true
  void barrier.run('close', () => undefined).then(() => true, async () => {
    const result = await dialog.showMessageBox({ type: 'warning', message: '草稿尚未成功保留', detail: '取消退出后可以重试。仍然退出会放弃尚未落盘的输入。', buttons: ['取消退出', '仍然退出'], defaultId: 0, cancelId: 0 })
    return result.response === 1
  }).then(quit => {
    quitPending = false
    if (!quit)
      return
    allowQuit = true
    reminderScheduler?.dispose()
    desktop?.dispose()
    closeDatabase()
    app.quit()
  })
})
