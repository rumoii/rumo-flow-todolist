import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('expanded details save through SQLite and unified search and task deletion remain usable', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-polish-desktop-'))
  const application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
  try {
    const page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    const task = await page.evaluate(async () => {
      await window.todoApi.settings.update({ automaticUpdateChecks: false })
      return window.todoApi.tasks.create({ title: '搜索与详情真实验收', plan: { kind: 'day', start: new Date().toLocaleDateString('sv-SE') } })
    })
    await page.locator(`[data-task-id="${task.id}"]`).getByRole('button', { name: '任务操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '查看详情', exact: true }).click()
    await page.getByPlaceholder('补充背景、思路或参考信息…').fill('放大后保存的真实正文')
    await page.getByRole('button', { name: '展开任务详情' }).click()
    await expect(page.locator('.task-editor')).toHaveClass(/task-editor-expanded/)
    await page.getByRole('button', { name: '☆ 设为当日重点' }).click()
    await page.getByRole('button', { name: '收起任务详情' }).click()
    await expect(page.getByPlaceholder('补充背景、思路或参考信息…')).toHaveValue('放大后保存的真实正文')
    await page.locator('.title-input').blur()
  await expect(page.locator('.editor-save-state')).toContainText('已保存')
    await expect.poll(() => page.evaluate(async id => (await window.todoApi.tasks.list()).find(item => item.id === id)?.notes, task.id)).toBe('放大后保存的真实正文')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.keyboard.press('Control+k')
    await page.getByRole('searchbox', { name: '搜索关键词' }).fill('放大后保存')
    await expect(page.locator('.unified-search-hit')).toHaveCount(1)
    await page.locator('.unified-search-hit').click()
    await expect(page.getByRole('button', { name: '★ 已设为当日重点' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByPlaceholder('补充背景、思路或参考信息…')).toHaveValue('放大后保存的真实正文')
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.locator(`[data-task-id="${task.id}"]`).getByRole('button', { name: '任务操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '删除任务', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '删除这个任务？' })).toContainText('移入回收站')
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('任务已删除')
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(() => page.evaluate(async id => (await window.todoApi.tasks.list()).some(item => item.id === id && !item.deletedAt), task.id)).toBe(true)
  } finally { await application.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})
