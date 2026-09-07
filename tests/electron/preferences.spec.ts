import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('saves preferences through the real bridge, syncs capture, preserves drafts and reloads settings', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-preferences-'))
  let application: ElectronApplication | undefined
  async function launch() {
    application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    return page
  }
  try {
    let page = await launch()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.locator('.app-titlebar')).toBeVisible()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.locator('.settings-dialog')).not.toContainText('标签管理')
    await expect(page.getByRole('button', { name: '标签管理', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page.getByText('主题已保存', { exact: false })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => window.todoApi.settings.get())).toMatchObject({ theme: 'dark', dailyVideoLimit: 3 })
    await page.getByRole('button', { name: '紧凑', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
    await page.evaluate(() => window.todoApi.desktop.openQuickCapture())
    await expect.poll(() => application!.windows().length).toBe(2)
    const capture = application!.windows().find(window => window !== page)!
    await expect(capture.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await expect(capture.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: '关闭设置' }).click()
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await page.getByRole('button', { name: '调整额度' }).click()
    await page.getByRole('spinbutton', { name: '每日视频额度' }).fill('5')
    await page.getByRole('button', { name: '保存额度' }).click()
    await expect(page.locator('.quota-pill')).toHaveText('0/5')
    await page.getByRole('tab', { name: '每日复盘 待完成', exact: true }).click()
    await page.getByPlaceholder('哪件事值得肯定？').fill('修改提醒也要保留这段草稿')
    await page.getByRole('button', { name: '调整提醒' }).click()
    await page.getByLabel('复盘提醒时间').fill('21:30')
    await page.getByRole('button', { name: '保存提醒' }).click()
    await expect(page.getByText('每天 21:30 · 应用或托盘运行时提醒')).toBeVisible()
    await expect(page.getByPlaceholder('哪件事值得肯定？')).toHaveValue('修改提醒也要保留这段草稿')
    await page.getByRole('button', { name: '标签管理', exact: true }).click()
    await page.getByPlaceholder('新标签名称').fill('桌面回归')
    await page.getByRole('button', { name: '创建标签' }).click()
    await expect(page.getByLabel('标签名称 桌面回归', { exact: true })).toHaveValue('桌面回归')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.todoApi.settings.get())).toMatchObject({ theme: 'dark', density: 'compact', dailyVideoLimit: 5, reviewReminderTime: '21:30' })
    await page.locator('.dialog-backdrop').evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))) })
    await page.screenshot({ path: 'test-results/preferences-desktop-dark.png' })
    expect(errors).toEqual([])
    await application!.close()
    application = undefined
    page = await launch()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
    expect(await page.evaluate(() => window.todoApi.settings.get())).toMatchObject({ dailyVideoLimit: 5, reviewReminderTime: '21:30' })
    await application!.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.maximize() })
    await expect.poll(() => application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true)
    await application!.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(900, 600) })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('.dialog-backdrop').evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))) })
    await page.screenshot({ path: 'test-results/preferences-desktop-small.png' })
    expect(await page.locator('.app-shell').evaluate(element => element.scrollTop)).toBe(0)
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
    await application!.evaluate(({ ipcMain }) => { ipcMain.removeHandler('settings:update'); ipcMain.handle('settings:update', () => { throw new Error('isolated write failure') }) })
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await expect(page.getByText('主题保存失败，已恢复原设置，请重试', { exact: false })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => window.todoApi.settings.get())).toMatchObject({ theme: 'dark' })
    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
    await expect.poll(() => application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true)
    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
    await expect.poll(() => application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false)
    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await expect.poll(() => application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)
    expect(application!.windows()).toHaveLength(1)
  }
  finally {
    await application?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
