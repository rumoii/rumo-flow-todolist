import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('preserves drafts across navigation, restart and v6 backup through real IPC and SQLite', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-electron-'))
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
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await page.getByRole('tab', { name: '每日复盘 待完成', exact: true }).click()
    await page.getByPlaceholder('哪件事值得肯定？').fill('真实桌面未提交的复盘')
    await expect(page.getByText('草稿已保留', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^今天/ }).click()
    await page.getByRole('button', { name: '保留草稿并继续' }).click()
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await expect(page.getByPlaceholder('哪件事值得肯定？')).toHaveValue('真实桌面未提交的复盘')
    const date = new Date().toLocaleDateString('sv-SE')
    expect(await page.evaluate(date => window.todoApi.flow.getDay(date).then(day => day.review.savedAt), date)).toBeNull()

    await page.getByRole('button', { name: '新建任务 Ctrl N', exact: true }).click()
    await expect.poll(() => application!.windows().length).toBe(2)
    const capture = application!.windows().find(window => window !== page)!
    await capture.getByRole('textbox', { name: '快速捕获任务', exact: true }).fill('桌面捕获任务')
    await capture.getByRole('textbox', { name: '快速捕获任务', exact: true }).press('Enter')
    await expect.poll(() => page.evaluate(() => window.todoApi.tasks.list().then(tasks => tasks.length))).toBe(1)
    await expect(page.getByRole('heading', { name: '心流', exact: true })).toBeVisible()
    await page.evaluate(() => { void window.todoApi.tasks.list() })
    await application!.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application!.close()
    application = undefined
    page = await launch()
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await page.getByRole('tab', { name: '每日复盘 待完成', exact: true }).click()
    await expect(page.getByPlaceholder('哪件事值得肯定？')).toHaveValue('真实桌面未提交的复盘')

    const backupPath = path.join(directory, 'roundtrip.json')
    await application!.evaluate(({ dialog }, backupPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: backupPath })
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    }, backupPath)
    await page.evaluate(() => window.todoApi.backup.export())
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
    expect(backup.version).toBe(6)
    expect(backup.drafts.some((draft: { payload: { didWell?: string } }) => draft.payload.didWell === '真实桌面未提交的复盘')).toBe(true)
    const importing = page.evaluate(backup => window.todoApi.backup.import(backup), backup)
    await page.getByRole('button', { name: '保留草稿并继续' }).click()
    await importing
    await expect(page.getByPlaceholder('哪件事值得肯定？')).toHaveValue('真实桌面未提交的复盘')
    await page.getByRole('button', { name: '保存今日复盘', exact: true }).click()
    await expect(page.getByText('复盘已保存', { exact: true })).toBeVisible()
    expect(await page.evaluate(date => window.todoApi.drafts.get('review', date).then(snapshot => snapshot.record), date)).toBeNull()
    expect(errors).toEqual([])
    await page.screenshot({ path: 'test-results/electron-flow.png' })
  } finally {
    await application?.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('restores autosaved task and unsubmitted video and capture after abrupt exit', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-electron-editors-'))
  let application: ElectronApplication | undefined
  async function launch() {
    application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    return page
  }
  try {
    let page = await launch()
    const date = new Date().toLocaleDateString('sv-SE')
    const task = await page.evaluate(date => window.todoApi.tasks.create({ title: '已保存任务', plan: { kind: 'day', start: date } }), date)
    await page.locator('.task-row .task-main').filter({ hasText: '已保存任务' }).click()
    await page.getByPlaceholder('补充背景、思路或参考信息…').fill('不能被后台刷新覆盖的备注')
    await expect(page.locator('.editor-save-state')).toContainText('已保存')
    await page.evaluate(() => window.todoApi.tasks.create({ title: '触发后台刷新' }))
    await expect(page.getByPlaceholder('补充背景、思路或参考信息…')).toHaveValue('不能被后台刷新覆盖的备注')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    const video = await page.evaluate(date => window.todoApi.flow.createVideo({ date, sourceUrl: 'https://example.com/test' }), date)
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    const thought = page.locator('.video-entry textarea')
    await thought.fill('未提交的视频思考')
    await expect(page.locator('.video-entry').getByText('草稿已保留', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '新建任务 Ctrl N', exact: true }).click()
    await expect.poll(() => application!.windows().length).toBe(2)
    let capture = application!.windows().find(window => window !== page)!
    await capture.getByRole('textbox', { name: '快速捕获任务', exact: true }).fill('未提交的捕获输入 #重复 #重复')
    await expect(capture.getByText('草稿已保留', { exact: true })).toBeVisible()
    const stopped = application!.waitForEvent('close')
    await application!.evaluate(({ app }) => { app.exit(0) }).catch(() => undefined)
    await stopped
    application = undefined
    page = await launch()
    await page.locator('.task-row .task-main').filter({ hasText: '已保存任务' }).click()
    await expect(page.getByPlaceholder('补充背景、思路或参考信息…')).toHaveValue('不能被后台刷新覆盖的备注')
    expect(await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.id === id)?.notes), task.id)).toBe('不能被后台刷新覆盖的备注')
    await page.locator('.title-input').blur()
    await expect.poll(() => page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.id === id)?.notes), task.id)).toBe('不能被后台刷新覆盖的备注')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await expect(page.locator('.video-entry textarea')).toHaveValue('未提交的视频思考')
    expect(await page.evaluate(date => window.todoApi.flow.getDay(date).then(day => day.videos[0].thought), date)).toBe('')
    await page.getByRole('button', { name: '保存记录', exact: true }).click()
    await expect.poll(() => page.evaluate(id => window.todoApi.drafts.get('video', id).then(snapshot => snapshot.record), video.id)).toBeNull()
    await page.getByRole('button', { name: '新建任务 Ctrl N', exact: true }).click()
    await expect.poll(() => application!.windows().length).toBe(2)
    capture = application!.windows().find(window => window !== page)!
    await expect(capture.getByRole('textbox', { name: '快速捕获任务', exact: true })).toHaveValue('未提交的捕获输入 #重复 #重复')
    await capture.getByRole('textbox', { name: '快速捕获任务', exact: true }).press('Enter')
    await expect.poll(() => page.evaluate(() => window.todoApi.tasks.list().then(tasks => tasks.filter(task => task.title === '未提交的捕获输入').length))).toBe(1)
    expect(await page.evaluate(() => window.todoApi.tags.list().then(tags => tags.filter(tag => tag.name === '重复').length))).toBe(1)
  } finally {
    await application?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
