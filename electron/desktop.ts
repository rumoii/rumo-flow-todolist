import { app, BrowserWindow, globalShortcut, Menu, Tray } from 'electron'
import path from 'node:path'
import type { AppSettings } from '../src/shared/contracts'
import { titleBarAppearance } from './window-appearance'
export class DesktopController {
  private tray?: Tray
  private capture?: BrowserWindow
  private quitting = false
  private closing = new Set<number>()
  private closeGuard: (window: BrowserWindow, reason: 'close' | 'blur') => Promise<boolean> = async () => true
  private windowGuard: () => boolean = () => true
  shortcut = 'Ctrl+Alt+Space'
  shortcutRegistered = false
  constructor(private readonly mainWindow: () => BrowserWindow | undefined, private readonly createMain: () => BrowserWindow, private readonly iconPath: string, private readonly rendererUrl: string | undefined, private readonly rendererFile: string) { }
  setCloseGuard(guard: (window: BrowserWindow, reason: 'close' | 'blur') => Promise<boolean>): void { this.closeGuard = guard; }
  setWindowGuard(guard: () => boolean): void { this.windowGuard = guard; }
  start(shortcut: string): void { this.shortcut = shortcut; this.createTray(); this.registerShortcut(shortcut); }
  private createTray(): void {
    this.tray = new Tray(this.iconPath)
    this.tray.setToolTip('Rumo-Flow')
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示 Rumo-Flow', click: () => this.showMain() },
      { label: '新建任务', click: () => this.showCapture() },
      { type: 'separator' }, { label: '退出', click: () => app.quit() },
    ]))
    this.tray.on('double-click', () => this.showMain())
  }
  private async hide(window: BrowserWindow, reason: 'close' | 'blur' = 'close'): Promise<void> {
    if (this.quitting || this.closing.has(window.id))
      return
    this.closing.add(window.id)
    try {
      if (await this.closeGuard(window, reason) && !window.isDestroyed())
        window.hide()
    }
    finally {
      this.closing.delete(window.id)
    }
  }
  attachCloseBehavior(window: BrowserWindow): void {
    window.on('close', event => { if (!this.quitting) {
      event.preventDefault()
      void this.hide(window)
    } })
  }
  showMain(taskId?: string): void {
    if (this.quitting || !this.windowGuard()) return
    const window = this.mainWindow() ?? this.createMain()
    window.show()
    window.focus()
    if (taskId)
      this.sendWhenReady(window, 'desktop:focus-quick-add', taskId)
  }
  private sendWhenReady(window: BrowserWindow, channel: string, payload?: unknown): void {
    const send = () => { if (!window.isDestroyed())
      window.webContents.send(channel, payload); }
    if (window.webContents.isLoading())
      window.webContents.once('did-finish-load', send)
    else
      send()
  }
  showFlow(): void {
    if (this.quitting || !this.windowGuard()) return
    const window = this.mainWindow() ?? this.createMain()
    window.show()
    window.focus()
    this.sendWhenReady(window, 'desktop:open-flow')
  }
  showCapture(): void {
    if (this.quitting || !this.windowGuard()) return
    if (!this.capture || this.capture.isDestroyed()) {
      const window = new BrowserWindow({ width: 560, height: 250, resizable: false, frame: false, show: false, alwaysOnTop: true,
        skipTaskbar: true, backgroundColor: '#17171c', icon: this.iconPath,
        webPreferences: { preload: path.join(path.dirname(this.rendererFile), '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } })
      this.capture = window
      this.attachCloseBehavior(window)
      window.on('blur', () => { if (!this.closing.has(window.id))
        void this.hide(window, 'blur'); })
      if (this.rendererUrl)
        void window.loadURL(`${this.rendererUrl}?capture=1`)
      else
        void window.loadFile(this.rendererFile, { query: { capture: '1' } })
    }
    this.capture.show()
    this.capture.focus()
    this.sendWhenReady(this.capture, 'desktop:capture-shown')
  }
  notifySettingsChanged(settings: AppSettings): void {
    const main = this.mainWindow()
    if (process.platform === 'win32' && main && !main.isDestroyed()) {
      try { main.setTitleBarOverlay(titleBarAppearance(settings.theme)) }
      catch (error) { console.error('标题栏主题同步失败', error) }
    }
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed()) {
        try { window.webContents.send('settings:changed', settings) }
        catch (error) { console.error('窗口设置同步失败', error) }
      }
  }
  registerShortcut(shortcut: string): boolean {
    if (shortcut === this.shortcut && this.shortcutRegistered)
      return true
    const previous = this.shortcut
    if (!globalShortcut.register(shortcut, () => this.showCapture()))
      return false
    if (this.shortcutRegistered && previous !== shortcut)
      globalShortcut.unregister(previous)
    this.shortcut = shortcut
    this.shortcutRegistered = true
    return true
  }
  dispose(): void {
    this.quitting = true
    globalShortcut.unregisterAll()
    this.tray?.destroy()
    this.capture?.destroy()
  }
}
