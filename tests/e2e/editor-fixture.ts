import type { DraftSnapshot, DraftRecord, TodoApi } from '../../src/shared/contracts'

export function installBrowserDrafts(sources: { task: string; quick: string }) {
  const convertTask = new Function(`return (${sources.task})`)()
  const parseQuick = new Function(`return (${sources.quick})`)()
  const api = window.todoApi
  const records = new Map<string, DraftSnapshot>()
  const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value))
  api.drafts = {
    async get(kind, key) { return clone({ generation: 'browser-editors', revision: 0, baseUpdatedAt: null, record: null, ...records.get(`${kind}:${key}`) }) },
    async put(input) {
      const snapshot = await api.drafts.get(input.kind, input.key)
      if (snapshot.revision !== input.revision) throw new Error('草稿已变化')
      const next = { ...snapshot, revision: snapshot.revision + 1, record: { ...input, revision: snapshot.revision + 1, version: 2, updatedAt: new Date().toISOString() } as DraftRecord }
      records.set(`${input.kind}:${input.key}`, clone(next))
      return clone(next)
    },
    async discard(input) {
      const snapshot = await api.drafts.get(input.kind, input.key)
      const next = { ...snapshot, revision: snapshot.revision + 1, record: null }
      records.set(`${input.kind}:${input.key}`, next)
      return clone(next)
    },
    async commit(input) {
      const snapshot = await api.drafts.get(input.kind, input.key)
      if (snapshot.revision !== input.revision) throw new Error('草稿已变化')
      const record = snapshot.record
      if (!record) throw new Error('没有草稿')
      let result: unknown
      if (record.kind === 'task') result = await api.tasks.update(record.key, convertTask(record.payload))
      else if (record.kind === 'review') result = await api.flow.saveReview(record.payload)
      else if (record.kind === 'video') result = await api.flow.updateVideo(record.key, record.payload)
      else if (record.kind === 'videoLink') result = await api.flow.createVideo({ date: record.key, sourceUrl: record.payload.sourceUrl })
      else if (record.kind === 'subtask') result = await api.tasks.create({ title: record.payload.title, parentTaskId: record.key })
      else {
        const tags = await api.tags.list()
        const parsed = parseQuick(record.payload.title, await api.lists.list(), tags)
        const tagIds = await Promise.all(parsed.tagNames.map(async (name: string) => (tags.find(tag => tag.name === name) ?? await api.tags.create({ name })).id))
        result = await api.tasks.create({ ...parsed.input, tagIds, ...(record.kind === 'quickTask' ? { plan: record.payload.plan, listId: record.payload.listId } : {}) })
      }
      await api.drafts.discard(input)
      return result
    },
  } satisfies TodoApi['drafts']
}
