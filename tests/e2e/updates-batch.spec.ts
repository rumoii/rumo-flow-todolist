import { filterCurrentList } from './search-helpers'
import { expect, test } from '@playwright/test'
import { installArrangementFixture } from './arrangement-fixture'
import type { UpdateState } from '../../src/shared/updates'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installArrangementFixture)
  await page.addInitScript(() => {
    let state: UpdateState = { phase: 'idle', version: '0.9.0-rc.1', platform: 'win32', arch: 'x64' }
    let listener: ((value: UpdateState) => void) | undefined
    const publish = (patch: Partial<UpdateState>) => { state = { ...state, ...patch }; listener?.(state) }
    window.todoApi.updates = {
      status: async () => state,
      check: async () => { publish({ phase: 'checking' }); await new Promise(resolve => setTimeout(resolve, 100)); publish({ phase: 'available', nextVersion: '0.9.0', notes: '正式版更新说明' }) },
      download: async () => { publish({ phase: 'downloading', progress: 50 }); await new Promise(resolve => setTimeout(resolve, 400)); publish({ phase: 'downloaded', progress: 100 }) },
      cancel: async () => publish({ phase: 'idle' }), install: async () => publish({ phase: 'downloaded', error: '草稿保存失败，安装已取消' }),
      feedback: async () => undefined, copyInfo: async () => undefined,
      onChanged: callback => { listener = callback; return () => { listener = undefined } },
    }
  })
  await page.goto('/')
})

test('version, opt-out, explicit download and failed installation remain usable in both themes', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '更新与关于', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toContainText('v0.9.0-rc.1')
  await expect(dialog.getByText('邮箱', { exact: true })).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: '启动时自动检查更新' }).uncheck()
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await dialog.getByRole('button', { name: '检查更新', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '下载更新', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '下载更新', exact: true }).click()
  await expect(dialog.getByRole('progressbar')).toBeVisible()
  await dialog.getByRole('button', { name: '关闭设置' }).click()
  await page.getByRole('button', { name: '更新已下载 · 查看' }).click()
  await dialog.getByRole('button', { name: '重启并安装' }).click()
  await expect(dialog.getByRole('alert')).toContainText('草稿保存失败')
  await dialog.getByRole('button', { name: '复制版本信息' }).click()
  await expect(dialog).toContainText('版本信息已复制')
  await dialog.screenshot({ path: testInfo.outputPath('updates-light.png') })
  await dialog.getByRole('button', { name: '外观', exact: true }).click()
  await dialog.getByRole('button', { name: '深色' }).click()
  await dialog.getByRole('button', { name: '更新与关于', exact: true }).click()
  await page.setViewportSize({ width: 900, height: 600 })
  await dialog.screenshot({ path: testInfo.outputPath('updates-dark-minimum.png') })
  expect(errors).toEqual([])
})

test('selects original rows, excludes collapsed reminders and never selects off-page tasks', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '选择任务', exact: true }).click()
  const toolbar = page.getByRole('region', { name: '批量操作', exact: true })
  await toolbar.getByRole('button', { name: '选择当前范围' }).click()
  await expect(toolbar).toContainText('已选 2 项')
  await expect(page.locator('.batch-choices')).toHaveCount(0)
  await page.getByText('今日到期 · 1 项', { exact: true }).click()
  await page.getByRole('checkbox', { name: '选择任务 提交项目报告' }).check()
  await expect(toolbar).toContainText('已选 3 项')
  await page.getByText('今日到期 · 1 项', { exact: true }).click()
  await expect(toolbar).toContainText('已选 2 项')
  await expect(page.locator('[data-task-id="ordinary"] .check')).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('batch-today.png') })
  await toolbar.getByRole('button', { name: '应用', exact: true }).click()
  await expect(toolbar).toContainText('已选 0 项')
  const remaining = await page.evaluate(() => window.todoApi.tasks.list({}))
  expect(remaining.filter(task => task.status === 'completed').map(task => task.id).sort()).toEqual(['focus', 'ordinary'])
})

test('week cards use the same selection and filter changes clear it', async ({ page }) => {
  await page.getByRole('button', { name: '本周', exact: true }).click()
  await page.getByRole('button', { name: '选择任务', exact: true }).click()
  await page.getByRole('checkbox', { name: '选择任务 整理项目资料' }).check()
  await expect(page.getByRole('region', { name: '批量操作' })).toContainText('已选 1 项')
  await expect(page.locator('.task-card[data-task-id="ordinary"]')).toHaveAttribute('draggable', 'false')
  await filterCurrentList(page, '架构')
  await expect(page.getByRole('region', { name: '批量操作' })).toHaveCount(0)
  await page.getByRole('button', { name: '选择任务', exact: true }).click()
  await page.getByRole('button', { name: '选择当前范围' }).click()
  await expect(page.getByRole('region', { name: '批量操作' })).toContainText('已选 1 项')
  await page.getByRole('button', { name: '退出选择' }).click()
  await expect(page.getByRole('button', { name: '选择任务', exact: true })).toBeFocused()
})
