import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { UpdateService } from '../electron/updates'
function fixture() {
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(), downloadUpdate: vi.fn().mockResolvedValue(['installer.exe']), quitAndInstall: vi.fn(),
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, channel: '', allowDowngrade: true,
  })
  const token = { cancel: vi.fn() }
  updater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '0.9.0', releaseNotes: '更新说明' }, cancellationToken: token })
  const options = { supported: true, changed: vi.fn(), install: vi.fn(async (trigger: () => void) => trigger()), installFailed: vi.fn() }
  const service = new UpdateService(updater as never, { version: '0.9.0-rc.1', platform: 'win32', arch: 'x64' }, options)
  return { service, updater, token, options }
}
afterEach(() => vi.useRealTimers())
it('uses the updater semantic version comparison, including RC to stable and no downgrade', async () => {
  const { NsisUpdater } = await import('electron-updater')
  const updater = new NsisUpdater(null, { version: '0.9.0-rc.1', name: 'test', isPackaged: true, userDataPath: '', baseCachePath: '', appUpdateConfigPath: '', whenReady: async () => undefined, quit: vi.fn(), relaunch: vi.fn(), onQuit: vi.fn() })
  updater.allowPrerelease = false
  updater.channel = 'latest'
  updater.allowDowngrade = false
  const accepts = (version: string) => (updater as unknown as { isUpdateAvailable(info: { version: string }): Promise<boolean> }).isUpdateAvailable({ version })
  expect(await accepts('0.8.0')).toBe(false)
  expect(await accepts('0.9.0-rc.1')).toBe(false)
  expect(await accepts('0.9.0')).toBe(true)
  expect(await accepts('0.10.0')).toBe(true)
})
it('forces stable manual download/install and allows an RC to receive the stable version', async () => {
  const { service, updater } = fixture()
  expect(updater).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false, channel: 'latest' })
  await service.check()
  expect(service.state).toMatchObject({ phase: 'available', nextVersion: '0.9.0' })
  expect(updater.downloadUpdate).not.toHaveBeenCalled()
  await service.download()
  expect(service.state.phase).toBe('downloaded')
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  await service.install()
  expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true)
  service.dispose()
})
it('checks once on startup, supports disabling before the timer and does not poll', async () => {
  vi.useFakeTimers()
  const { service, updater } = fixture()
  service.setAutomatic(true)
  service.setAutomatic(false)
  await vi.advanceTimersByTimeAsync(11000)
  expect(updater.checkForUpdates).not.toHaveBeenCalled()
  service.setAutomatic(true)
  await vi.advanceTimersByTimeAsync(11000)
  service.setAutomatic(true)
  await vi.advanceTimersByTimeAsync(11000)
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  service.dispose()
})
it('keeps manual checks available when automatic checks are off and cancels a pending startup check', async () => {
  vi.useFakeTimers()
  const { service, updater } = fixture()
  service.setAutomatic(true)
  service.setAutomatic(false)
  await service.check()
  service.setAutomatic(true)
  await vi.advanceTimersByTimeAsync(11000)
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  service.dispose()
})
it('handles unavailable versions, prerelease metadata, failures and check concurrency', async () => {
  const { service, updater } = fixture()
  updater.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: false })
  await service.check()
  expect(service.state.phase).toBe('current')
  updater.checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: true, updateInfo: { version: '1.0.0-rc.1' } })
  await service.check()
  expect(service.state.phase).toBe('error')
  let reject!: (error: Error) => void
  updater.checkForUpdates.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const pending = service.check()
  await service.check()
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
  reject(new Error('网络超时'))
  await pending
  expect(service.state).toMatchObject({ phase: 'error', errorDetails: '网络超时' })
  service.dispose()
})
it('cancels downloads without accepting late success and can check again', async () => {
  const { service, updater, token } = fixture()
  await service.check()
  let resolve!: () => void
  updater.downloadUpdate.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
  const pending = service.download()
  await service.download()
  service.cancel()
  updater.emit('download-progress', { percent: 99 })
  resolve()
  await pending
  expect(service.state.phase).toBe('idle')
  expect(updater.downloadUpdate).toHaveBeenCalledOnce()
  expect(token.cancel).toHaveBeenCalledOnce()
  await service.install()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  await service.check()
  expect(service.state.phase).toBe('available')
  service.dispose()
})
it('keeps downloaded state when drafts cannot be retained and permits retry', async () => {
  const { service, updater, options } = fixture()
  await service.check(); await service.download()
  options.install.mockRejectedValueOnce(new Error('草稿保存失败'))
  await service.install()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  expect(service.state).toMatchObject({ phase: 'downloaded', errorDetails: '草稿保存失败' })
  await service.install()
  expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  service.dispose()
})
it('never installs a download that failed integrity checks and releases failed installation', async () => {
  const { service, updater, options } = fixture()
  await service.check()
  updater.downloadUpdate.mockRejectedValueOnce(new Error('sha512 mismatch'))
  await service.download(); await service.install()
  expect(service.state.phase).toBe('error')
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  await service.download()
  updater.quitAndInstall.mockImplementationOnce(() => updater.emit('error', new Error('安装器启动失败')))
  await service.install()
  expect(options.installFailed).toHaveBeenCalled()
  expect(service.state.phase).toBe('downloaded')
  service.dispose()
  expect(updater.listenerCount('error')).toBe(0)
})

it('does not turn successful download into failure when a window notification fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const { service, options } = fixture()
  options.changed.mockImplementation(() => { throw new Error('closed window') })
  try {
    await service.check(); await service.download()
    expect(service.state.phase).toBe('downloaded')
  } finally { service.dispose(); log.mockRestore() }
})
