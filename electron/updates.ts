import type { AppUpdater } from 'electron-updater'
import type { UpdateState } from '../src/shared/updates'
import { updateError } from './update-error'

type Updater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'channel' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall' | 'on' | 'removeListener'>
type CheckResult = NonNullable<Awaited<ReturnType<Updater['checkForUpdates']>>>
export class UpdateService {
  state: UpdateState
  private result?: CheckResult
  private checking = false
  private downloading = false
  private cancelled = false
  private disposed = false
  private startupChecked = false
  private startupTimer?: ReturnType<typeof setTimeout>
  private listeners: Array<[string, (...args: any[]) => void]> = []
  constructor(private readonly updater: Updater, info: Pick<UpdateState, 'version' | 'platform' | 'arch'>, private readonly options: {
    supported: boolean
    changed: (state: UpdateState) => void
    install: (trigger: () => void) => Promise<void>
    installFailed: () => void
  }) {
    this.state = { ...info, phase: options.supported ? 'idle' : 'unsupported' }
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.channel = 'latest'
    updater.allowDowngrade = false
    this.listen('download-progress', (progress: { percent: number }) => {
      if (this.downloading && !this.cancelled) this.publish({ phase: 'downloading', progress: Math.max(0, Math.min(100, progress.percent)) })
    })
    this.listen('error', (error: Error) => {
      if (this.state.phase === 'installing') {
        options.installFailed()
        this.fail(error)
      }
    })
  }
  private listen(event: string, listener: (...args: any[]) => void) {
    this.updater.on(event as 'error', listener)
    this.listeners.push([event, listener])
  }
  private publish(patch: Partial<UpdateState>) {
    if (this.disposed) return
    if ('error' in patch && patch.error === undefined) patch.errorDetails = undefined
    this.state = { ...this.state, ...patch }
    try { this.options.changed({ ...this.state }) }
    catch (error) { console.error('更新状态通知失败', error) }
  }
  private fail(error: unknown) {
    this.publish({ phase: 'error', ...updateError(error) })
  }
  setAutomatic(enabled: boolean) {
    clearTimeout(this.startupTimer)
    this.startupTimer = undefined
    if (!enabled || this.startupChecked || !this.options.supported || this.disposed) return
    this.startupTimer = setTimeout(() => {
      void this.check()
    }, 10000)
  }
  async check() {
    if (!this.options.supported || this.disposed || this.checking || this.downloading || ['downloaded', 'installing'].includes(this.state.phase)) return
    this.startupChecked = true
    clearTimeout(this.startupTimer)
    this.startupTimer = undefined
    this.checking = true
    this.result = undefined
    this.publish({ phase: 'checking', error: undefined, nextVersion: undefined, notes: undefined, progress: undefined })
    try {
      const result = await this.updater.checkForUpdates()
      if (!result) throw new Error('无法读取更新信息，请重试')
      if (result.isUpdateAvailable) {
        if (!/^\d+\.\d+\.\d+(?:\+[\w.-]+)?$/.test(result.updateInfo.version)) throw new Error('发布信息不是正式版本，请稍后重试')
        this.result = result
        const notes = result.updateInfo.releaseNotes
        this.publish({ phase: 'available', nextVersion: result.updateInfo.version, notes: typeof notes === 'string' ? notes : notes?.map(item => item.note).join('\n') ?? '' })
      } else this.publish({ phase: 'current' })
    } catch (error) { this.fail(error) }
    finally { this.checking = false }
  }
  async download() {
    if (!this.result || this.disposed || this.downloading || this.checking || !['available', 'error'].includes(this.state.phase)) return
    this.downloading = true
    this.cancelled = false
    this.publish({ phase: 'downloading', progress: 0, error: undefined })
    try {
      await this.updater.downloadUpdate(this.result.cancellationToken)
      if (!this.cancelled) this.publish({ phase: 'downloaded', progress: 100 })
    } catch (error) {
      if (!this.cancelled) this.fail(error)
    } finally {
      this.downloading = false
      if (this.cancelled) {
        this.result = undefined
        this.publish({ phase: 'idle', progress: undefined, nextVersion: undefined, notes: undefined, error: undefined })
      }
    }
  }
  cancel() {
    if (!this.downloading) return
    this.cancelled = true
    this.result?.cancellationToken?.cancel()
  }
  async install() {
    if (this.state.phase !== 'downloaded' || this.disposed) return
    this.publish({ phase: 'installing', error: undefined })
    try {
      await this.options.install(() => {
        this.updater.quitAndInstall(false, true)
        if (this.state.phase === 'error') throw new Error(this.state.error)
      })
    } catch (error) {
      this.options.installFailed()
      this.publish({ phase: 'downloaded', ...updateError(error), error: '安装未完成，已保留当前窗口。请重试或查看技术详情。' })
    }
  }
  dispose() {
    this.cancel()
    this.disposed = true
    clearTimeout(this.startupTimer)
    for (const [event, listener] of this.listeners) this.updater.removeListener(event as 'error', listener)
  }
}
