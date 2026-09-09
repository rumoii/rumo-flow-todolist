import { expect, test } from '@playwright/test'
import { installArrangementFixture } from './arrangement-fixture'
import { installFlowHistoryFixture } from './flow-history-fixture'
import { installBrowserDrafts } from './editor-fixture'
import { draftToTask } from '../../src/shared/drafts'
import { parseQuickAdd } from '../../src/shared/quick-add'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installArrangementFixture)
  await page.addInitScript(installFlowHistoryFixture)
  await page.addInitScript(installBrowserDrafts, { task: draftToTask.toString(), quick: parseQuickAdd.toString() })
  await page.goto('/')
})

for (const width of [900, 1240, 1600]) {
  for (const theme of ['light', 'dark']) {
    for (const density of ['comfortable', 'compact']) {
      test(`document editor and calendar at ${width} ${theme} ${density}`, async ({ page }, info) => {
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.setViewportSize({ width, height: width === 900 ? 600 : width === 1240 ? 780 : 900 })
        await page.evaluate(({ theme, density }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.density = density }, { theme, density })
        await page.getByRole('button', { name: '打开任务 整理项目资料', exact: true }).click()
        const detail = page.getByRole('dialog', { name: '任务详情' })
        await expect(detail).toBeVisible()
        await expect(detail.getByRole('heading', { name: '什么时候做' })).toBeVisible()
        await expect(detail.getByRole('button', { name: '保存更改' })).toHaveCount(0)
        await detail.getByRole('button', { name: '＋ 添加标签' }).click()
        await detail.getByRole('checkbox').check()
        await detail.getByRole('button', { name: '完成选择' }).click()
        await expect(detail.locator('.selected-tags')).toContainText('#工作')
        await expect(detail.locator('.editor-save-state')).toContainText('已保存')
        await detail.getByRole('button', { name: '展开任务详情' }).click()
        await expect.poll(async () => Math.abs((await detail.boundingBox())!.x - (await page.locator('.main-content').boundingBox())!.x)).toBeLessThan(2)
        expect(await detail.locator('.drawer-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath('detail.png') })
        await detail.getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByRole('button', { name: '心流 记录与复盘', exact: true }).click()
        const flowWidth = await page.locator('.flow-view').evaluate(element => element.getBoundingClientRect().width)
        await expect(page.locator('#flow-calendar')).toBeVisible({ visible: flowWidth >= 960 })
        await page.getByRole('tab', { name: /每日复盘/ }).click()
        await page.getByPlaceholder('哪件事值得肯定？').fill('保留这一段未提交输入')
        await page.getByRole('tab', { name: /输入记录/ }).click()
        const guard = page.getByRole('dialog', { name: '离开前，处理未保存的输入' })
        await expect(guard).toBeVisible()
        await guard.getByRole('button', { name: '取消', exact: true }).click()
        await expect(page.getByRole('tab', { name: /输入记录/ })).toBeFocused()
        await expect(page.getByPlaceholder('哪件事值得肯定？')).toHaveValue('保留这一段未提交输入')
        await page.getByRole('tab', { name: /输入记录/ }).click()
        await guard.getByRole('button', { name: '保留草稿并继续' }).click()
        await expect(page.locator('.video-composer')).toBeVisible()
        expect(await page.locator('.main-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath('flow.png') })
        expect(errors).toEqual([])
      })
    }
  }
}
