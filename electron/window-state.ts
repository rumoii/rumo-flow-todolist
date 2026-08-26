import { app, type BrowserWindow, type Rectangle } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

interface SavedWindowState { bounds: Rectangle; maximized: boolean }
const fallback: SavedWindowState = { bounds: { width: 1240, height: 780, x: 120, y: 80 }, maximized: false }

function statePath(): string { return path.join(app.getPath('userData'), 'window-state.json') }

export function loadWindowState(): SavedWindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as SavedWindowState
    if (parsed.bounds.width >= 900 && parsed.bounds.height >= 600) return parsed
  } catch { /* First launch or invalid state uses a safe default. */ }
  return fallback
}

export function trackWindowState(window: BrowserWindow): void {
  window.on('close', () => {
    const state: SavedWindowState = { bounds: window.isMaximized() ? window.getNormalBounds() : window.getBounds(), maximized: window.isMaximized() }
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify(state), 'utf8')
  })
}
