import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('Must use isolated database') } } }))
const { getDatabase, closeDatabase, useDatabaseForTests } = await import('../electron/database/db')
const { Repository } = await import('../electron/database/repository')
const { listFlowHistory } = await import('../electron/database/flow-history')
const { localDay, shiftDay } = await import('../src/shared/planning')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-history-'))
let counter = 0
beforeEach(() => { useDatabaseForTests(path.join(directory, `${counter++}.sqlite`)) })
afterAll(() => { closeDatabase(); fs.rmSync(directory, { recursive: true, force: true }) })
const today = localDay()
const query = () => ({ from: shiftDay(today, -80), to: today, keyword: '', pendingOnly: false, reviewedOnly: false })

it('reads empty dates without creating rows and saves backfill into its own date', () => {
  const repo = new Repository()
  const past = shiftDay(today, -40)
  repo.flow.getFlowDay(past)
  expect(getDatabase().prepare('SELECT COUNT(*) AS count FROM flow_days').get()).toEqual({ count: 0 })
  repo.settings.updateSettings({ dailyVideoLimit: 2 })
  repo.flow.createFlowVideo({ date: past, sourceUrl: 'https://example.com/video', title: '往日输入' })
  repo.flow.saveFlowReview({ date: past, reflection: '往日思考' })
  repo.settings.updateSettings({ dailyVideoLimit: 5 })
  expect(repo.flow.getFlowDay(past).review.videoLimit).toBe(2)
  expect(repo.flow.getFlowDay(today).videos).toHaveLength(0)
  expect(listFlowHistory(query()).entries[0]).toMatchObject({ date: past, excerpt: '往日思考', videoTitles: ['往日输入'], reviewSaved: true })
  closeDatabase()
  expect(repo.flow.getFlowDay(past).review.reflection).toBe('往日思考')
})

it('paginates dates without duplication and combines keyword and status filters', () => {
  const repo = new Repository()
  for (let index = 0; index < 37; index++) {
    const date = shiftDay(today, -index)
    repo.flow.saveFlowReview({ date, reflection: index % 2 ? '普通记录' : '100% 专注' })
    if (index % 3 === 0) repo.flow.createFlowVideo({ date, sourceUrl: 'https://example.com', author: '读书人', title: '输入' })
  }
  const first = listFlowHistory(query())
  const second = listFlowHistory({ ...query(), before: first.nextCursor! })
  expect(first.entries).toHaveLength(30)
  expect(second.entries).toHaveLength(7)
  expect(second.nextCursor).toBeNull()
  expect(new Set([...first.entries, ...second.entries].map(entry => entry.date)).size).toBe(37)
  expect(listFlowHistory({ ...query(), keyword: '100%', pendingOnly: true, reviewedOnly: true }).entries).toHaveLength(7)
  expect(listFlowHistory({ ...query(), keyword: '读书人' }).entries).toHaveLength(13)
  expect(listFlowHistory({ ...query(), keyword: '_' }).entries).toHaveLength(0)
  expect(listFlowHistory({ ...query(), keyword: '不存在' }).entries).toHaveLength(0)
})

it('retains insertion order when videos have the same creation timestamp', () => {
  const repo = new Repository()
  repo.flow.createFlowVideo({ date: today, sourceUrl: 'https://example.com/first', title: '第一个视频' })
  repo.flow.createFlowVideo({ date: today, sourceUrl: 'https://example.com/second', title: '第二个视频' })
  getDatabase().prepare('UPDATE flow_videos SET created_at=?').run('2020-01-01T00:00:00.000Z')
  expect(repo.flow.getFlowDay(today).videos.map(video => video.title)).toEqual(['第一个视频', '第二个视频'])
  expect(listFlowHistory(query()).entries[0].videoTitles).toEqual(['第一个视频', '第二个视频'])
})

it('does not expose drafts or empty rows as completed history and rejects invalid writes without effects', () => {
  const repo = new Repository()
  const past = shiftDay(today, -3)
  const snapshot = repo.drafts.get('review', past)
  repo.drafts.put({ kind: 'review', key: past, generation: snapshot.generation, revision: snapshot.revision, baseUpdatedAt: snapshot.baseUpdatedAt, payload: { date: past, reflection: '只在草稿里', inputType: 'none', inputVideoId: null } })
  expect(listFlowHistory(query()).entries).toHaveLength(0)
  expect(() => repo.flow.createFlowVideo({ date: today, sourceUrl: 'file:///secret' })).toThrow()
  expect(() => repo.flow.saveFlowReview({ date: shiftDay(today, 1) })).toThrow()
  expect(() => repo.flow.createFlowVideo({ date: shiftDay(today, 1), sourceUrl: 'https://example.com' })).toThrow()
  expect(() => listFlowHistory({ ...query(), from: '2026-02-30' })).toThrow()
  expect(getDatabase().prepare('SELECT COUNT(*) AS count FROM flow_days').get()).toEqual({ count: 0 })
})
