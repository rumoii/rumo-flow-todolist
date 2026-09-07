import type { IpcContext } from './context'
import { text } from './validation'
import { shell } from 'electron'
export function registerDesktop({ repository, options, handle, changed }: IpcContext): void {
  handle('desktop:status', () => options.desktopStatus?.() ?? { globalShortcut: repository.settings.getSettings().globalShortcut, globalShortcutRegistered: false })
  handle('desktop:open-quick-capture', () => options.openQuickCapture?.())
  handle('desktop:open-external', async (_event, input) => { const value = text(input, '链接'); const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('仅支持 HTTP 或 HTTPS 链接'); await shell.openExternal(url.toString()); })
}
