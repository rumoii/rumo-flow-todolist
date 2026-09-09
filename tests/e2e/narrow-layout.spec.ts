import { expect, test, type Page } from '@playwright/test'
import { installArrangementFixture } from './arrangement-fixture'

async function assertPageWidth(page: Page) {
  expect(await page.locator('.main-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installArrangementFixture)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
})

for (const width of [900, 1240, 1600]) {
  for (const theme of ['light', 'dark']) {
    for (const density of ['comfortable', 'compact']) {
      test(`week controls stay readable at ${width} ${theme} ${density}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 900 ? 600 : width === 1240 ? 780 : 900 })
        await page.evaluate(({ theme, density }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.density = density }, { theme, density })
        await page.evaluate(async () => {
          await window.todoApi.tasks.update('ordinary', { title: '这是需要保持可读的长任务标题LongUnbrokenTaskTitle0123456789', priority: 'high' })
        })
        await page.getByRole('button', { name: /^本周/ }).click()
        const board = page.getByRole('region', { name: '本周任务看板' })
        await expect(board).toBeVisible()
        const card = board.locator('[data-task-id="ordinary"]')
        await card.scrollIntoViewIfNeeded()
        const sizes = await card.evaluate(element => {
          const heading = element.querySelector('.task-card-heading')!.getBoundingClientRect()
          const control = element.querySelector('.task-plan-button')!.getBoundingClientRect()
          const label = element.querySelector('.task-plan-label')!
          const range = document.createRange()
          range.selectNodeContents(label)
          return { headingBottom: heading.bottom, controlTop: control.top, controlHeight: control.height, lines: range.getClientRects().length, fits: label.scrollWidth <= label.clientWidth + 1, columnWidth: element.closest('.day-column')!.getBoundingClientRect().width }
        })
        expect(sizes.columnWidth).toBeGreaterThanOrEqual(180)
        expect(sizes.controlTop).toBeGreaterThanOrEqual(sizes.headingBottom)
        expect(sizes.controlHeight).toBeLessThan(32)
        expect(sizes.lines).toBe(1)
        expect(sizes.fits).toBe(true)
        await assertPageWidth(page)
        const date = card.getByRole('button', { name: /^安排任务/ })
        await date.click()
        await expect(page.getByRole('dialog', { name: '安排任务' })).toBeInViewport()
        await page.keyboard.press('Escape')
        await expect(date).toBeFocused()
        await page.screenshot({ path: info.outputPath('week-readable.png') })
      })
    }
  }
}

test('rightmost day supports scrolling, drag, menus and batch selection', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await page.getByRole('button', { name: /^本周/ }).click()
  const board = page.getByRole('region', { name: '本周任务看板' })
  const lastDay = board.locator('.day-column').last()
  await board.evaluate(element => { element.scrollLeft = element.scrollWidth })
  await expect(lastDay).toBeInViewport()
  expect(await board.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await page.locator('[data-task-id="week"]').dragTo(lastDay, { targetPosition: { x: 60, y: 70 } })
  const card = lastDay.locator('[data-task-id="week"]')
  await expect(card).toBeVisible()
  const menu = card.getByRole('button', { name: '任务操作', exact: true })
  await menu.click()
  await expect(page.getByRole('menu')).toBeInViewport()
  await page.getByRole('menuitem', { name: /重要程度/ }).click()
  await expect(page.getByRole('menuitemradio', { name: '高', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await page.getByRole('button', { name: '选择任务', exact: true }).click()
  await card.getByRole('checkbox').check()
  await expect(page.getByRole('region', { name: '批量操作' })).toContainText('已选 1 项')
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await assertPageWidth(page)
})

test('list metadata and batch fields wrap as units instead of squeezing text', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  const longLabel = '一个非常长的分类名称LongUnbrokenLabel0123456789'.repeat(3)
  await page.evaluate(async label => {
    const lists = await window.todoApi.lists.list()
    lists[0].name = label
    const tags = await window.todoApi.tags.list()
    tags[0].name = label
    await window.todoApi.tasks.update('ordinary', { listId: lists[0].id, tags, notes: '备注内容', dueDate: '2030-01-01' })
    await window.todoApi.tasks.update('week', { listId: lists[0].id, tags })
  }, longLabel)
  for (const view of [/^今天/, /^总计划/, /^本月/]) {
    await page.getByRole('button', { name: view }).click()
    const row = page.locator('[data-task-id="ordinary"]')
    await expect(row).toBeVisible()
    await expect(row.locator('.task-tag')).toHaveAttribute('title', longLabel)
    for (const selector of ['.task-plan-label', '.task-tag', '.list-meta-name']) {
      expect(await row.locator(selector).evaluate(element => getComputedStyle(element).whiteSpace)).toBe('nowrap')
    }
    expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await assertPageWidth(page)
  }
  await page.getByRole('button', { name: '选择任务', exact: true }).click()
  await page.locator('[data-task-id="ordinary"]').getByRole('checkbox').check()
  const toolbar = page.getByRole('region', { name: '批量操作' })
  await toolbar.getByRole('combobox', { name: '批量操作', exact: true }).click()
  await page.getByRole('option', { name: '移动清单', exact: true }).click()
  await toolbar.getByRole('combobox', { name: '批量清单', exact: true }).click()
  await page.getByRole('option', { name: longLabel, exact: true }).click()
  await expect(toolbar.getByRole('combobox', { name: '批量清单', exact: true })).toHaveAttribute('title', longLabel)
  expect(await toolbar.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await toolbar.getByRole('combobox', { name: '批量操作', exact: true }).click()
  await page.getByRole('option', { name: '调整计划', exact: true }).click()
  await toolbar.getByRole('combobox', { name: '安排方式', exact: true }).click()
  await page.getByRole('option', { name: '按周安排', exact: true }).click()
  await expect(toolbar.getByRole('textbox', { name: '计划日期' })).toBeInViewport()
  await expect(toolbar.getByRole('combobox', { name: '安排方式', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(toolbar.getByRole('button', { name: '应用', exact: true })).toBeInViewport()
  await assertPageWidth(page)
  await toolbar.getByRole('button', { name: '退出选择', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^${longLabel}`) }).click()
  await assertPageWidth(page)
  await page.locator('[data-task-id="ordinary"]').getByRole('button', { name: '打开任务 整理项目资料', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '任务详情' })
  await expect(detail).toBeVisible()
  expect(await detail.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  expect(await detail.locator('.drawer-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('[data-task-id="ordinary"]').getByRole('button', { name: '完成任务', exact: true }).click()
  await page.getByRole('button', { name: /^已完成/ }).click()
  await expect(page.locator('[data-task-id="ordinary"] .task-plan-display')).toBeVisible()
  await assertPageWidth(page)
})
