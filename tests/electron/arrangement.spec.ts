import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('arranges through real windows without overwriting drafts or resetting deadlines', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-arrangement-electron-'))
  const application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
  try {
    const page = await application.firstWindow()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    const today = new Date().toLocaleDateString('sv-SE')
    const task = await page.evaluate(today => window.todoApi.tasks.create({ title: '安排验收任务', plan: { kind: 'day', start: today }, dueDate: '2030-01-01', dueTime: '12:00', reminderMinutesBefore: 15, isPinned: true }), today)
    const row = page.locator(`[data-task-id="${task.id}"]`)
    await row.getByRole('button', { name: '打开任务 安排验收任务', exact: true }).click()
    await expect(page.getByPlaceholder('记录一些想法…')).toHaveValue('')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await row.getByRole('button', { name: '设为今日重点 安排验收任务', exact: true }).click()
    await expect(page.locator('.today-focus [data-task-id]')).toHaveCount(1)
    await row.getByRole('button', { name: '打开任务 安排验收任务', exact: true }).click()
    await expect(page.getByLabel('当日重点')).toBeChecked()
    await page.getByPlaceholder('记录一些想法…').fill('缓存同步后的正式修改')
    await page.getByRole('button', { name: '保存更改', exact: true }).click()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    const saved = await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.id === id)!), task.id)
    expect(saved).toMatchObject({ plan: { kind: 'day', start: today }, focusDate: today, notes: '缓存同步后的正式修改', dueDate: task.dueDate, dueTime: '12:00', reminderMinutesBefore: 15, isPinned: true })

    await page.getByRole('button', { name: '新建任务 Ctrl N', exact: true }).click()
    await expect.poll(() => application.windows().length).toBe(2)
    const capture = application.windows().find(window => window !== page)!
    const captureInput = capture.getByRole('textbox', { name: '快速捕获任务', exact: true })
    await captureInput.fill('其他窗口还没提交的输入')
    await capture.getByRole('button', { name: '关闭快速捕获', exact: true }).click()
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('capture=1'))?.isVisible())).toBe(false)
    await page.getByRole('button', { name: '新建任务 Ctrl N', exact: true }).click()
    await expect(captureInput).toHaveValue('其他窗口还没提交的输入')
    await page.bringToFront()
    await row.getByRole('button', { name: /^安排任务/ }).click()
    await page.getByRole('dialog', { name: '安排任务' }).getByRole('button', { name: '明天', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '安排任务' })).toHaveCount(0)
    await expect.poll(() => capture.evaluate(() => window.todoApi.drafts.get('capture', 'global').then(snapshot => snapshot.record?.payload))).toEqual({ title: '其他窗口还没提交的输入' })
    await expect(captureInput).toHaveValue('其他窗口还没提交的输入')
    await expect(capture.locator('.capture-shell')).not.toHaveAttribute('inert')

    await page.getByRole('button', { name: /^总计划/ }).click()
    await row.getByRole('button', { name: '打开任务 安排验收任务', exact: true }).click()
    await page.getByPlaceholder('记录一些想法…').fill('未提交的详情，不能覆盖')
    const request = await capture.evaluate(async id => {
      const task = (await window.todoApi.tasks.list()).find(task => task.id === id)!
      return { taskId: id, updatedAt: task.updatedAt, generation: (await window.todoApi.drafts.get('task', id)).generation, action: { kind: 'plan' as const, target: 'today' as const } }
    }, task.id)
    const rejected = await capture.evaluate(async request => { try { await window.todoApi.tasks.arrange(request); return '' } catch (error) { return String(error) } }, request)
    expect(rejected).toContain('未保存修改')
    await expect(page.getByPlaceholder('记录一些想法…')).toHaveValue('未提交的详情，不能覆盖')
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
    expect((await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.id === id)!), task.id)).notes).toBe('缓存同步后的正式修改')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await row.getByRole('button', { name: /^安排任务/ }).click()
    const dialog = page.getByRole('dialog', { name: '安排任务' })
    await dialog.getByRole('button', { name: '今天', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('未保存修改')
    await expect(row).toBeVisible()
    await dialog.getByRole('button', { name: '打开详情', exact: true }).click()
    await expect(page.getByPlaceholder('记录一些想法…')).toHaveValue('未提交的详情，不能覆盖')
    expect(errors).toEqual([])
    await page.screenshot({ path: 'test-results/arrangement-electron.png' })
  }
  finally {
    await application.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
