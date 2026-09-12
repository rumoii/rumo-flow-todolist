import type { BrowserWindow } from 'electron'
import type { DataDomain } from '../src/shared/contracts'

type WindowForBroadcast = Pick<BrowserWindow, 'isDestroyed' | 'webContents'>

export function broadcastDataChanged(windows: WindowForBroadcast[], domains: DataDomain[]): void {
  for (const window of windows) {
    if (window.isDestroyed())
      continue
    try { window.webContents.send('desktop:data-changed', domains) }
    catch (error) { console.error('数据变更通知失败', error) }
  }
}
