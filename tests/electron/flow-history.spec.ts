import { _electron as electron, expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
test('backfill, draft commit and paginated history work through real IPC and survive restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-history-desktop-'))
  let application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
  try {
    let page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    const result = await page.evaluate(async () => {
      const api = window.todoApi
      await api.settings.update({ automaticUpdateChecks: false })
      const query = { from: '2020-01-01', to: '2020-12-31', keyword: '', pendingOnly: false, reviewedOnly: false }
      await api.flow.getDay('2020-01-01')
      const empty = await api.flow.history(query)
      for (let index = 1; index <= 31; index++) await api.flow.saveReview({ date: '2020-01-' + String(index).padStart(2,'0'), reflection: '真实 IPC 复盘 ' + index })
      await api.flow.createVideo({ date: '2020-02-03', sourceUrl: 'https://example.com/history', title: '补录输入' })
      const snapshot = await api.drafts.get('review', '2020-02-03')
      const saved = await api.drafts.put({ kind: 'review', key: '2020-02-03', generation: snapshot.generation, revision: snapshot.revision, baseUpdatedAt: snapshot.baseUpdatedAt, payload: { date: '2020-02-03', reflection: '正式提交补录复盘', inputType: 'none', inputVideoId: null } })
      await api.drafts.commit({ kind: 'review', key: '2020-02-03', generation: saved.generation, revision: saved.revision })
      const first = await api.flow.history(query)
      const second = await api.flow.history({ ...query, before: first.nextCursor! })
      return { empty, first, second, day: await api.flow.getDay('2020-02-03') }
    })
    expect(result.empty.entries).toEqual([])
    expect(result.first.entries).toHaveLength(30)
    expect(result.second.entries).toHaveLength(2)
    expect(result.day.review.reflection).toBe('正式提交补录复盘')
    expect(result.day.videos).toHaveLength(1)
    await page.getByRole('button', { name: /心流 记录与复盘/ }).click()
    await page.getByRole('tab', { name: '历史记录' }).click()
    await page.getByRole('button', { name: '筛选', exact: true }).click()
    await page.getByLabel('历史开始日期').fill('2020-01-01')
    await page.getByLabel('历史结束日期').fill('2020-12-31')
    await expect(page.locator('.journal-entry')).toHaveCount(30)
    await page.locator('.journal-entry').first().getByRole('button', { name: '展开当天记录 ↓' }).click()
    await expect(page.locator('.history-reading')).toContainText('正式提交补录复盘')
    await application.close()
    application = await electron.launch({ executablePath: process.env.RUMO_TEST_EXECUTABLE, args: [...(process.env.RUMO_TEST_EXECUTABLE ? [] : ['out/main/main.js']), `--user-data-dir=${directory}`], env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
    expect(await page.evaluate(async () => (await window.todoApi.flow.getDay('2020-02-03')).review.reflection)).toBe('正式提交补录复盘')
  } finally { await application.close(); fs.rmSync(directory, { recursive: true, force: true }) }
})
