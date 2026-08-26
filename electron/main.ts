import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDatabase, getDatabase } from './database/db'
import { registerIpcHandlers } from './ipc'
import { loadWindowState, trackWindowState } from './window-state'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F8F8F8',
    title: 'Rumo-Flow',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:') && url !== process.env.ELECTRON_RENDERER_URL) event.preventDefault() })
  window.once('ready-to-show', () => { if (state.maximized) window.maximize(); window.show() })
  trackWindowState(window)
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(currentDirectory, '../renderer/index.html'))
  return window
}

app.whenReady().then(() => {
  getDatabase()
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', closeDatabase)
