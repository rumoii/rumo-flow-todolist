import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('restores new composers with their original association and applies recovered task drafts only explicitly', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-editor-experience-'))
  let application: ElectronApplication | undefined
  async function launch() {
    application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    return page
  }
  try {
    let page = await launch()
    const task = await page.evaluate(async () => {
      const today = new Date().toLocaleDateString('sv-SE')
      const task = await window.todoApi.tasks.create({ title: '恢复验收任务', plan: { kind: 'day', start: today } })
      const snapshot = await window.todoApi.drafts.get('task', task.id)
      await window.todoApi.drafts.put({ ...snapshot, kind: 'task', key: task.id, payload: { title: '恢复后的标题', notes: '未应用的草稿', listId: null, dueDate: '', dueTime: '', priority: 'none', tagIds: [], plan: task.plan, focusDate: null, reminderMinutesBefore: null, recurrence: 'none', recurrenceEnd: '' } })
      return task
    })
    await page.getByRole('button', { name: '打开任务 恢复验收任务' }).click()
    await expect(page.getByRole('button', { name: '应用草稿' })).toBeVisible()
    expect(await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.id === id)?.title), task.id)).toBe('恢复验收任务')
    await page.getByRole('textbox', { name: '子任务标题' }).fill('重启后再添加的子任务')
    await expect.poll(() => page.evaluate(id => window.todoApi.drafts.get('subtask', id).then(snapshot => snapshot.record?.payload), task.id)).toEqual({ title: '重启后再添加的子任务' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '保留草稿并继续' }).click()
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await page.locator('.video-composer input').fill('https://example.com/restart-link')
    const today = new Date().toLocaleDateString('sv-SE')
    await expect.poll(() => page.evaluate(date => window.todoApi.drafts.get('videoLink', date).then(snapshot => snapshot.record?.payload), today)).toEqual({ sourceUrl: 'https://example.com/restart-link' })
    await page.evaluate(async () => {
      const snapshot = await window.todoApi.drafts.get('quickTask', 'global')
      await window.todoApi.drafts.put({ ...snapshot, kind: 'quickTask', key: 'global', payload: { title: '原日期的新任务', contextDate: '2026-09-01', listId: null, plan: { kind: 'day', start: '2026-09-01' } } })
    })
    const stopped = application!.waitForEvent('close')
    await application!.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await stopped
    page = await launch()
    await expect(page.locator('.quick-add input')).toHaveValue('原日期的新任务')
    await page.locator('.quick-add input').press('Enter')
    await expect.poll(() => page.evaluate(() => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.title === '原日期的新任务')?.plan))).toEqual({ kind: 'day', start: '2026-09-01' })
    await page.getByRole('button', { name: '打开任务 恢复验收任务' }).click()
    await expect(page.getByRole('textbox', { name: '子任务标题' })).toHaveValue('重启后再添加的子任务')
    await page.getByRole('button', { name: '应用草稿' }).click()
    await expect(page.locator('.editor-save-state')).toContainText('已保存')
    await page.getByRole('button', { name: '添加子任务', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '子任务标题' })).toBeFocused()
    expect(await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.filter(task => task.parentTaskId === id).length), task.id)).toBe(1)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await expect(page.locator('.video-composer input')).toHaveValue('https://example.com/restart-link')
    await page.getByRole('button', { name: /^今天/ }).click()
    await page.getByRole('button', { name: '保存并继续' }).click()
    expect(await page.evaluate(date => window.todoApi.flow.getDay(date).then(day => day.videos.length), today)).toBe(1)
    expect(await page.evaluate(date => window.todoApi.flow.getDay(date).then(day => day.review.savedAt), today)).toBeNull()
  } finally {
    await application?.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
