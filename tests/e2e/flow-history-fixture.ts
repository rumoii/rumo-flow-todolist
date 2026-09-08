import type { DailyReview, FlowDay, TodoApi } from '../../src/shared/contracts'
export function installFlowHistoryFixture() {
  const today = new Date().toLocaleDateString('sv-SE')
  const timestamp = new Date().toISOString()
  const shift = (amount: number) => { const date = new Date(today + 'T12:00:00'); date.setDate(date.getDate() + amount); return date.toLocaleDateString('sv-SE') }
  const blank = (date: string): FlowDay => ({ review: { date, videoLimit: 3, didWell: '', didNotWell: '', reflection: '', inputType: 'none', inputVideoId: null, inputText: '', outputText: '', tomorrowExpectation: '', savedAt: null, createdAt: timestamp, updatedAt: timestamp }, videos: [] })
  const days = new Map<string, FlowDay>()
  for (let index = 0; index < 45; index++) {
    const date = shift(-index)
    const value = blank(date)
    value.review = { ...value.review, didWell: '先完成一件事，再开始下一件。', reflection: '今天减少了来回切换，完成工作后反而更轻松。\n给自己留出安静思考的时间，比填满日程更重要。', tomorrowExpectation: '从整理桌面和阅读十分钟开始。', savedAt: timestamp }
    value.videos.push({ id: 'history-video-' + index, date, title: index % 2 ? '阅读方法：理解比速度重要' : '关于注意力与深度工作的思考', author: '阅读笔记', sourceUrl: 'https://example.com/video', sourcePlatform: 'example.com', thought: index % 3 ? '比起一次做很多，更重要的是明天还能继续。' : '', createdAt: timestamp, updatedAt: timestamp })
    days.set(date, value)
  }
  const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value))
  const listeners = new Set<(domains: ['flow']) => void>()
  const changed = () => listeners.forEach(callback => callback(['flow']))
  const flow: TodoApi['flow'] = {
    getDay: async date => clone(days.get(date) ?? blank(date)),
    history: async query => {
      const entries = [...days.values()].filter(day => day.review.date >= query.from && day.review.date <= query.to && (!query.before || day.review.date < query.before)
        && (!query.reviewedOnly || day.review.savedAt) && (!query.pendingOnly || day.videos.some(video => !video.thought.trim()))
        && JSON.stringify(day).includes(query.keyword)).sort((left, right) => right.review.date.localeCompare(left.review.date))
        .map(day => ({ date: day.review.date, videoLimit: day.review.videoLimit, videoCount: day.videos.length, pendingThoughtCount: day.videos.filter(video => !video.thought.trim()).length, reviewSaved: !!day.review.savedAt, overLimit: false, excerpt: day.review.reflection.slice(0,240), videoTitles: day.videos.slice(0,2).map(video => video.title) }))
      return clone({ entries: entries.slice(0,30), nextCursor: entries.length > 30 ? entries[29].date : null })
    },
    month: async month => [...days.values()].filter(day => day.review.date.startsWith(month)).map(day => ({ date: day.review.date, videoLimit: 3, videoCount: day.videos.length, pendingThoughtCount: day.videos.filter(video => !video.thought).length, reviewSaved: !!day.review.savedAt, overLimit: false })),
    summary: async () => ({ from: shift(-6), to: today, videoCount: 7, reviewedDays: 7, overLimitDays: 0, pendingThoughts: 2 }),
    createVideo: async input => {
      const day = days.get(input.date) ?? blank(input.date)
      const video = { id: crypto.randomUUID(), date: input.date, title: input.title ?? '', sourceUrl: input.sourceUrl, sourcePlatform: 'example.com', author: input.author ?? '', thought: '', createdAt: timestamp, updatedAt: timestamp }
      day.videos.push(video); days.set(input.date, day); changed(); return clone(video)
    },
    updateVideo: async (id, input) => { const video = [...days.values()].flatMap(day => day.videos).find(video => video.id === id)!; Object.assign(video, input); changed(); return clone(video) },
    removeVideo: async id => { for (const day of days.values()) day.videos = day.videos.filter(video => video.id !== id); changed() },
    saveReview: async input => { const day = days.get(input.date) ?? blank(input.date); Object.assign(day.review, input, { savedAt: new Date().toISOString() }); days.set(input.date, day); changed(); return clone(day.review) },
    taskFacts: async () => ({ completed: [], pending: [] }),
    actionLinks: async () => [],
    createAction: async () => { throw new Error('This fixture does not create tasks') },
  }
  const api = window.todoApi
  const originalDrafts = api.drafts
  const draftValues = new Map<string, object>()
  api.drafts = {
    ...originalDrafts,
    get: async (kind, key) => kind === 'review' || kind === 'video' ? { generation: 'history-fixture', revision: 0, baseUpdatedAt: null, record: null } : originalDrafts.get(kind, key),
    put: async input => {
      if (input.kind !== 'review' && input.kind !== 'video') return originalDrafts.put(input)
      draftValues.set(input.kind + ':' + input.key, clone(input.payload))
      return { generation: 'history-fixture', revision: input.revision + 1, baseUpdatedAt: null, record: null }
    },
    commit: async input => {
      const value = draftValues.get(input.kind + ':' + input.key)!
      return input.kind === 'review' ? flow.saveReview({ ...value, date: input.key } as DailyReview) : flow.updateVideo(input.key, value)
    },
  }
  api.flow = flow
  api.desktop.onDataChanged = callback => { listeners.add(callback); return () => { listeners.delete(callback) } }
  api.desktop.openExternal = async () => { throw new Error('External browsing disabled in fixture') }
  api.updates = { status: async () => ({ phase: 'error', version: '0.9.0-rc.1', platform: 'win32', arch: 'x64', error: '发布端暂未提供完整更新信息，请稍后重试。', errorDetails: 'Cannot find latest.yml\n' + 'https://example.com/'.repeat(300) + '\n404\n'.repeat(100) }), check: async () => undefined, download: async () => undefined, install: async () => undefined, cancel: async () => undefined, feedback: async () => undefined, copyInfo: async () => undefined, onChanged: () => () => undefined }
}
