import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('uses real version/settings IPC and atomically arranges selected tasks without overwriting drafts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-updates-batch-electron-'))
  const application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
  try {
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    const result = await page.evaluate(async () => {
      const state = await window.todoApi.updates.status()
      await window.todoApi.settings.update({ automaticUpdateChecks: false })
      const today = new Date().toLocaleDateString('sv-SE')
      const first = await window.todoApi.tasks.create({ title: '批量第一项', plan: { kind: 'day', start: today }, dueDate: '2030-01-01', dueTime: '12:00', reminderMinutesBefore: 15 })
      const second = await window.todoApi.tasks.create({ title: '批量第二项', plan: { kind: 'day', start: today } })
      return { state, first, second }
    })
    expect(result.state.platform).toBe('win32')
    expect(result.state.version).toBe(JSON.parse(fs.readFileSync('package.json', 'utf8')).version)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '更新与关于', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: '启动时自动检查更新' })).not.toBeChecked()
    await page.getByRole('button', { name: '复制版本信息' }).click()
    const clipboard = await application.evaluate(({ clipboard }) => clipboard.readText())
    expect(clipboard).toContain(result.state.version)
    expect(clipboard).not.toContain('批量第一项')
    await page.getByRole('button', { name: '关闭设置' }).click()
    await page.getByRole('button', { name: '打开任务 批量第二项', exact: true }).click()
    await page.locator('.title-input').fill('')
    await page.getByPlaceholder('补充背景、思路或参考信息…').fill('未提交的详情修改')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '保留草稿并继续' }).click()
    const input = { targets: [result.first, result.second].map(({ id, updatedAt }) => ({ id, updatedAt })), action: { kind: 'plan' as const, plan: { kind: 'day' as const, start: '2030-02-01' } } }
    const rejection = await page.evaluate(async input => {
      const snapshot = await window.todoApi.drafts.get('capture', 'global')
      try { await window.todoApi.tasks.batch({ ...input, generation: snapshot.generation }); return '' }
      catch (error) { return String(error) }
    }, input)
    expect(rejection).toContain('未保存修改')
    const unchanged = await page.evaluate(id => window.todoApi.tasks.list().then(tasks => tasks.find(task => task.id === id)), result.first.id)
    expect(unchanged?.plan).toEqual(result.first.plan)
    await page.evaluate(async id => {
      const snapshot = await window.todoApi.drafts.get('task', id)
      await window.todoApi.drafts.discard({ ...snapshot, kind: 'task', key: id })
    }, result.second.id)
    await page.getByRole('button', { name: '选择任务', exact: true }).click()
    await page.getByRole('button', { name: '选择当前范围' }).click()
    await page.getByRole('combobox', { name: '批量操作', exact: true }).click()
    await page.getByRole('option', { name: '调整计划', exact: true }).click()
    await page.getByRole('combobox', { name: '安排方式', exact: true }).click()
    await page.getByRole('option', { name: '按日安排', exact: true }).click()
    await page.getByLabel('计划日期', { exact: true }).fill('2030-02-01')
    await page.getByRole('button', { name: '应用', exact: true }).click()
    await expect(page.getByRole('region', { name: '批量操作' })).toContainText('已选 0 项')
    const changed = await page.evaluate(() => window.todoApi.tasks.list())
    expect(changed.filter(task => [result.first.id, result.second.id].includes(task.id)).every(task => task.plan?.start === '2030-02-01')).toBe(true)
    expect(changed.find(task => task.id === result.first.id)).toMatchObject({ dueDate: '2030-01-01', dueTime: '12:00', reminderMinutesBefore: 15 })
  } finally {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await application.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
