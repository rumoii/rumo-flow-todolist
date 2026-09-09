import type { Page } from '@playwright/test'

export async function filterCurrentList(page: Page, keyword: string) {
  await page.locator('.workspace-search-trigger').click()
  await page.getByRole('button', { name: /^当前列表 ·/ }).click()
  await page.getByRole('searchbox', { name: '搜索关键词' }).fill(keyword)
  await page.getByRole('button', { name: '应用筛选' }).click()
}
