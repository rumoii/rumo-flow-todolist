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

test('renames a subtask on the desktop persistence path and retries conflicts without silent overwrite', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-subtask-title-'))
  let application: ElectronApplication | undefined
  async function launch() {
    application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    return page
  }
  try {
    let page = await launch()
    const ids = await page.evaluate(async () => {
      const today = new Date().toLocaleDateString('sv-SE')
      const parent = await window.todoApi.tasks.create({ title: '子任务改名父任务', plan: { kind: 'day', start: today } })
      const subtask = await window.todoApi.tasks.create({ title: '原标题', parentTaskId: parent.id, notes: '原备注', priority: 'medium' })
      return { parent: parent.id, subtask: subtask.id }
    })
    await page.getByRole('button', { name: '打开任务 子任务改名父任务' }).click()
    await page.getByRole('button', { name: '编辑子任务 原标题' }).click()
    const input = page.getByRole('textbox', { name: '编辑子任务标题' })
    await expect(input).toHaveValue('原标题')
    await input.fill('改名后的子任务')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: '编辑子任务 改名后的子任务' })).toBeVisible()
    expect(await page.evaluate(id => window.todoApi.tasks.list().then(tasks => {
      const task = tasks.find(item => item.id === id)!
      return { title: task.title, notes: task.notes, priority: task.priority, parentTaskId: task.parentTaskId }
    }), ids.subtask)).toEqual({ title: '改名后的子任务', notes: '原备注', priority: 'medium', parentTaskId: ids.parent })
    await page.getByRole('button', { name: '编辑子任务 改名后的子任务' }).click()
    await input.fill('冲突后的标题')
    await page.evaluate(id => window.todoApi.tasks.update(id, { notes: '他处备注' }), ids.subtask)
    await input.press('Enter')
    await expect(page.locator('.subtask-edit-error')).toContainText('已变化')
    await expect(input).toHaveValue('冲突后的标题')
    await page.getByRole('button', { name: '重新核对并仅保存标题' }).click()
    await expect(page.getByRole('button', { name: '编辑子任务 冲突后的标题' })).toBeVisible()
    expect(await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(item => item.id === id)?.notes), ids.subtask)).toBe('他处备注')
    await page.getByRole('button', { name: '编辑子任务 冲突后的标题' }).click()
    await input.fill('重启后恢复的标题')
    await expect.poll(() => page.evaluate(id => window.todoApi.drafts.get('task', id).then(snapshot => snapshot.record?.payload?.title), ids.subtask)).toBe('重启后恢复的标题')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '保留草稿并继续' }).click()
    const stopped = application!.waitForEvent('close')
    await application!.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await stopped
    page = await launch()
    await page.getByRole('button', { name: '打开任务 子任务改名父任务' }).click()
    await expect(page.getByRole('button', { name: '编辑子任务 冲突后的标题' })).toBeVisible()
    await page.getByRole('button', { name: '编辑子任务 冲突后的标题' }).click()
    await expect(page.getByRole('textbox', { name: '编辑子任务标题' })).toHaveValue('重启后恢复的标题')
  } finally {
    await application?.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('keeps a pending full-detail draft untouched by the inline title editor', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-subtask-draft-isolation-'))
  let application: ElectronApplication | undefined
  try {
    application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    const subtask = await page.evaluate(async () => {
      const today = new Date().toLocaleDateString('sv-SE')
      const parent = await window.todoApi.tasks.create({ title: '草稿隔离父任务', plan: { kind: 'day', start: today } })
      const subtask = await window.todoApi.tasks.create({ title: '原标题', parentTaskId: parent.id })
      const snapshot = await window.todoApi.drafts.get('task', subtask.id)
      await window.todoApi.drafts.put({ ...snapshot, kind: 'task', key: subtask.id, payload: { title: '原标题', notes: '未保存的备注', listId: null, dueDate: '', dueTime: '', priority: 'none', tagIds: [], plan: subtask.plan, focusDate: null, reminderMinutesBefore: null, recurrence: 'none', recurrenceEnd: '' } })
      return subtask.id
    })
    await page.getByRole('button', { name: '打开任务 草稿隔离父任务' }).click()
    await page.getByRole('button', { name: '编辑子任务 原标题' }).click()
    await expect(page.locator('.subtask-edit-notice')).toContainText('其他未保存的修改')
    await page.getByRole('textbox', { name: '编辑子任务标题' }).fill('悄悄改名')
    await page.locator('.subtask-edit').getByRole('button', { name: '保存' }).click()
    await expect(page.locator('.subtask-edit-error')).toContainText('打开任务详情')
    expect(await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(item => item.id === id)?.title), subtask)).toBe('原标题')
    expect(await page.evaluate(id => window.todoApi.drafts.get('task', id).then(snapshot => snapshot.record?.payload), subtask)).toMatchObject({ notes: '未保存的备注', title: '原标题' })
    await page.locator('.subtask-edit').getByRole('button', { name: '取消' }).click()
    expect(await page.evaluate(id => window.todoApi.drafts.get('task', id).then(snapshot => snapshot.record?.payload), subtask)).toMatchObject({ notes: '未保存的备注', title: '原标题' })
  } finally {
    await application?.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
