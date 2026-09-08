import { clipboard, shell } from 'electron'
import type { IpcContext } from './context'
export function registerUpdates({ handle, options }: IpcContext) {
  const service = () => {
    if (!options.updates) throw new Error('更新服务尚未就绪')
    return options.updates
  }
  handle('updates:status', () => ({ ...service().state }))
  handle('updates:check', () => service().check())
  handle('updates:download', () => service().download())
  handle('updates:cancel', () => service().cancel())
  handle('updates:install', () => service().install())
  handle('updates:feedback', () => shell.openExternal('https://github.com/rumoii/rumo-flow-todolist/issues/new'))
  handle('updates:copy-info', () => {
    const { version, platform, arch } = service().state
    clipboard.writeText(`Rumo-Flow ${version}\n${platform} ${arch}`)
  })
}
