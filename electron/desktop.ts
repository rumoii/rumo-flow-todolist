import { app, BrowserWindow, globalShortcut, Menu, Tray } from 'electron'
import path from 'node:path'
import type { AppSettings } from '../src/shared/contracts'

export class DesktopController {
  private tray?: Tray
  private capture?: BrowserWindow
  private quitting = false
  shortcutRegistered = false
  shortcut = 'Ctrl+Alt+Space'
  constructor(private readonly mainWindow: () => BrowserWindow | undefined, private readonly createMain: () => BrowserWindow, private readonly iconPath: string, private readonly rendererUrl: string | undefined, private readonly rendererFile: string) {}
  start(shortcut: string): void { this.shortcut = shortcut; this.createTray(); this.registerShortcut(shortcut) }
  private createTray(): void { this.tray = new Tray(this.iconPath); this.tray.setToolTip('Rumo-Flow'); this.tray.setContextMenu(Menu.buildFromTemplate([{ label: '显示 Rumo-Flow', click: () => this.showMain() }, { label: '新建任务', click: () => this.showCapture() }, { type: 'separator' }, { label: '退出', click: () => { this.quitting = true; app.quit() } }])); this.tray.on('double-click', () => this.showMain()) }
  attachCloseBehavior(window: BrowserWindow): void { window.on('close', (event) => { if (!this.quitting) { event.preventDefault(); window.hide() } }) }
  showMain(taskId?: string): void { const window = this.mainWindow() ?? this.createMain(); window.show(); window.focus(); window.webContents.send('desktop:focus-quick-add', taskId) }
  showFlow(): void { const window = this.mainWindow() ?? this.createMain(); window.show(); window.focus(); const open = () => window.webContents.send('desktop:open-flow'); if (window.webContents.isLoading()) window.webContents.once('did-finish-load', open); else open() }
  showCapture(): void { if (!this.capture || this.capture.isDestroyed()) { this.capture = new BrowserWindow({ width: 560, height: 200, resizable: false, frame: false, show: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#17171c', icon: this.iconPath, webPreferences: { preload: path.join(path.dirname(this.rendererFile), '../preload/preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } }); this.capture.on('blur', () => this.capture?.hide()); if (this.rendererUrl) void this.capture.loadURL(`${this.rendererUrl}?capture=1`); else void this.capture.loadFile(this.rendererFile, { query: { capture: '1' } }) } this.capture.show(); this.capture.focus() }
  notifySettingsChanged(settings: AppSettings): void { if (this.capture && !this.capture.isDestroyed()) this.capture.webContents.send('settings:changed', settings) }
  registerShortcut(shortcut: string): void { globalShortcut.unregisterAll(); this.shortcut = shortcut; this.shortcutRegistered = globalShortcut.register(shortcut, () => this.showCapture()) }
  dispose(): void { this.quitting = true; globalShortcut.unregisterAll(); this.tray?.destroy(); this.capture?.destroy() }
}
