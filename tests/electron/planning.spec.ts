import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('plans tasks, creates linked actions, searches and recovers through real IPC', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-planning-desktop-'))
  let application: ElectronApplication | undefined
  async function launch() {
    application = await electron.launch({
      executablePath: process.env.RUMO_TEST_EXECUTABLE,
      args: [
        ...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']),
        `--user-data-dir=${directory}`
      ],
      env: { ...process.env, ELECTRON_RENDERER_URL: '' }
    })
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    return page
  }
  try {
    let page = await launch()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const today = new Date().toLocaleDateString('sv-SE')
    const task = await page.evaluate(async today => window.todoApi.tasks.create({ title: '待细化的任务', dueDate: today, plan: null }), today)
    await page.getByRole('button', { name: '总计划', exact: true }).click()
    await page.getByRole('button', { name: '打开任务 待细化的任务' }).click()
    await page.getByRole('combobox', { name: '计划精度' }).click()
    await page.getByRole('option', { name: '日计划', exact: true }).click()
    await page.getByLabel('当日重点', { exact: true }).check()
    await page.getByRole('button', { name: '保存更改' }).click()
    await expect.poll(() => page.evaluate(async id => (await window.todoApi.tasks.list({})).find(task => task.id === id), task.id)).toMatchObject({ plan: { kind: 'day', start: today }, focusDate: today, dueDate: today })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: /^今天/ }).click()
    await expect(page.locator('.pinned-zone')).toContainText('待细化的任务')
    await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
    await page.getByRole('tab', { name: /每日复盘/ }).click()
    await page.getByPlaceholder('哪件事值得肯定？').fill('完成了计划整理')
    await page.getByPlaceholder('给明天留一个轻盈的起点。').fill('明天检验计划')
    await expect(page.getByRole('button', { name: '＋ 创建关联任务', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '展开完整六问' }).click()
    await page.getByPlaceholder('如实写下，不责备自己。').fill('需要减少切换')
    await page.getByRole('button', { name: '收起为三问' }).click()
    await page.getByRole('button', { name: '保存今日复盘' }).click()
    await expect(page.locator('.saved-pill')).toHaveText('已保存')
    await page.getByRole('button', { name: '＋ 创建关联任务', exact: true }).click()
    await expect(page.getByLabel('行动任务标题')).toHaveValue('明天检验计划')
    await page.getByRole('button', { name: '创建任务', exact: true }).click()
    await expect(page.getByRole('button', { name: '○ 明天检验计划', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '＋ 创建关联任务', exact: true }).click()
    await page.getByLabel('行动任务标题').fill('第二个行动')
    await page.getByRole('button', { name: '创建任务', exact: true }).click()
    await expect(page.getByRole('button', { name: '○ 第二个行动' })).toBeVisible()
    const linked = await page.evaluate(async today => ({ links: await window.todoApi.flow.actionLinks({ kind: 'review', key: today }), review: (await window.todoApi.flow.getDay(today)).review }), today)
    expect(linked.links).toHaveLength(2)
    expect(linked.review.didNotWell).toBe('需要减少切换')
    await page.getByRole('button', { name: '○ 明天检验计划', exact: true }).click()
    await expect(page.getByRole('heading', { name: '行动来源' })).toBeVisible()
    await page.locator('.detail-card .source-link').click()
    await expect(page.getByRole('tabpanel', { name: /每日复盘/ })).toBeVisible()
    await page.getByRole('button', { name: '历史搜索', exact: true }).click()
    await page.getByRole('textbox', { name: '历史搜索' }).fill('完成了计划整理')
    await expect(page.locator('.history-hit')).toHaveCount(1)
    await page.locator('.history-hit').click()
    await expect(page.getByPlaceholder('哪件事值得肯定？')).toHaveValue('完成了计划整理')
    await page.getByRole('button', { name: '总计划', exact: true }).click()
    await page.locator('.batch-panel summary').click()
    await page.locator('.batch-choices').getByLabel('待细化的任务', { exact: true }).check()
    await page.getByRole('combobox', { name: '批量操作' }).click()
    await page.getByRole('option', { name: '移入回收站', exact: true }).click()
    await page.getByRole('button', { name: '应用', exact: true }).click()
    await page.getByRole('button', { name: '确认移入回收站' }).click()
    await page.getByRole('button', { name: '回收站', exact: true }).click()
    await page.getByLabel(/待细化的任务/).check()
    await page.getByRole('button', { name: '恢复所选' }).click()
    await expect(page.getByText('回收站为空')).toBeVisible()
    await page.getByRole('button', { name: '本月', exact: true }).click()
    await page.screenshot({ path: 'test-results/planning-desktop-month.png' })
    expect(errors).toEqual([])
    await application.close(); application = undefined
    page = await launch()
    expect(await page.evaluate(async id => (await window.todoApi.tasks.list({})).find(task => task.id === id), task.id)).toMatchObject({ plan: { kind: 'day', start: today }, focusDate: today, deletedAt: null })
    expect(await page.evaluate(async today => (await window.todoApi.flow.actionLinks({ kind: 'review', key: today })).length, today)).toBe(2)
  } finally { await application?.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})
