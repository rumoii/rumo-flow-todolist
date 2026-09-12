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
import { titleBarAppearance } from './window-appearance'
import updaterPackage from 'electron-updater'
import { UpdateService } from './updates'
import { synchronizeRuntimeSettings } from './runtime-settings'
import { broadcastDataChanged } from './window-events'
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
let updates: UpdateService | undefined
function disposeServices() {
  updates?.dispose()
  reminderScheduler?.dispose()
  desktop?.dispose()
  closeDatabase()
}
function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const theme = new Repository().settings.getSettings().theme
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: theme === 'dark' ? '#17161c' : '#F8F8F8',
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const, titleBarOverlay: titleBarAppearance(theme) } : {}),
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
  const query = { theme, titlebar: process.platform === 'win32' ? '1' : '0' }
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value))
    void window.loadURL(url.toString())
  }
  else
    void window.loadFile(path.join(currentDirectory, '../renderer/index.html'), { query })
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
    desktop.setCloseGuard(async (window, reason) => {
      if (barrier.running)
        return false
      try {
        await barrier.run(reason, () => undefined, { windowIds: [window.webContents.id] })
        return true
      }
      catch (error) {
        if (!(error instanceof Error) || !error.message.includes('已取消离开')) await dialog.showMessageBox({ type: 'warning', message: '未能关闭窗口', detail: '输入尚未确认保留，请回到编辑器重试。', buttons: ['返回编辑器'] })
        return false
      }
    })
    desktop.start(repository.settings.getSettings().globalShortcut)
    reminderScheduler = new ReminderScheduler(repository, (taskId) => desktop?.showMain(taskId), () => desktop?.showFlow())
    let appliedSettings = repository.settings.getSettings()
    let installingUpdate = false
    const cancelInstallation = () => {
      if (!installingUpdate) return
      installingUpdate = false
      allowQuit = false
      quitPending = false
      barrier.release()
    }
    const version = app.isPackaged ? app.getVersion() : JSON.parse(fs.readFileSync(path.join(currentDirectory, '../../package.json'), 'utf8')).version as string
    updates = new UpdateService(updaterPackage.autoUpdater, { version, platform: process.platform, arch: process.arch }, {
      supported: app.isPackaged && process.platform === 'win32' && process.arch === 'x64',
      changed: state => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            try { window.webContents.send('updates:changed', state) }
            catch (error) { console.error('更新状态通知失败', error) }
          }
        }
      },
      install: async trigger => {
        if (quitPending || barrier.running) throw new Error('正在保存或恢复数据，请稍后安装')
        installingUpdate = true
        quitPending = true
        await barrier.run('update', () => { allowQuit = true; trigger() }, { hold: true })
      },
      installFailed: cancelInstallation,
    })
    updates.setAutomatic(appliedSettings.automaticUpdateChecks)
    registerIpcHandlers(repository, { barrier, updates, confirmImport: async () => (await dialog.showMessageBox({ type: 'warning', message: '恢复备份会替换全部正式数据和草稿', detail: '恢复前会自动保留当前快照。仅支持 v6 备份，计划、行动来源、回收站和草稿将一起恢复。', buttons: ['取消', '恢复备份'], defaultId: 0, cancelId: 0 })).response === 1, onDataChanged: domains => broadcastDataChanged(BrowserWindow.getAllWindows(), domains), onTasksChanged: () => reminderScheduler?.reschedule(), onScheduleChanged: () => reminderScheduler?.reschedule(), openQuickCapture: () => desktop?.showCapture(), desktopStatus: () => ({ globalShortcut: desktop?.shortcut ?? repository.settings.getSettings().globalShortcut, globalShortcutRegistered: desktop?.shortcutRegistered ?? false }), onSettingsChanging: (next, current) => { if (next.globalShortcut === current.globalShortcut)
        return; if (!desktop?.registerShortcut(next.globalShortcut))
        throw new Error('全局快捷键注册失败'); return () => { desktop?.registerShortcut(current.globalShortcut); }; }, onSettingsChanged: (settings) => { synchronizeRuntimeSettings(appliedSettings, settings, { notifySettingsChanged: value => desktop?.notifySettingsChanged(value), rescheduleReminders: () => reminderScheduler?.reschedule(), setAutomaticUpdates: enabled => updates?.setAutomatic(enabled) }); appliedSettings = settings; } })
    reminderScheduler.start()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0)
      createWindow(); })
  })
app.on('window-all-closed', () => { })
app.on('second-instance', () => { desktop?.showMain(); })
app.on('before-quit', (event) => {
  if (allowQuit) { disposeServices(); return }
  if (!primaryInstance)
    return
  event.preventDefault()
  if (quitPending || barrier.running)
    return
  quitPending = true
  void barrier.run('close', () => undefined).then(() => true, async (error) => {
    if (!(error instanceof Error) || !error.message.includes('已取消离开')) await dialog.showMessageBox({ type: 'warning', message: '未能退出', detail: '输入尚未确认保留，请回到编辑器重试。', buttons: ['返回编辑器'] })
    return false
  }).then(quit => {
    quitPending = false
    if (!quit)
      return
    allowQuit = true
    app.quit()
  })
})
