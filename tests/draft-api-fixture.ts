import type { DraftKind, DraftSnapshot, DraftRecord, TodoApi, Task } from '../src/shared/contracts'
import { draftToTask } from '../src/shared/drafts'
import { parseQuickAdd } from '../src/shared/quick-add'

export function installDraftApi(api: TodoApi): TodoApi {
  const records = new Map<string, DraftSnapshot>()
  const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value))
  api.drafts = {
    async get(kind, key) {
      const task = kind === 'task' ? (await api.tasks.list()).find(item => item.id === key) : undefined
      return clone({ generation: 'test', revision: 0, record: null, ...records.get(`${kind}:${key}`), baseUpdatedAt: task?.updatedAt ?? null })
    },
    async put(input) {
      const current = await api.drafts.get(input.kind, input.key)
      if (current.revision !== input.revision || current.generation !== input.generation) throw new Error('草稿已变化')
      const next = { ...current, revision: current.revision + 1, record: { ...input, version: 2, revision: current.revision + 1, updatedAt: new Date().toISOString() } as DraftRecord }
      records.set(`${input.kind}:${input.key}`, clone(next))
      return clone(next)
    },
    async discard(input) {
      const current = await api.drafts.get(input.kind, input.key)
      const next = { ...current, revision: current.revision + 1, record: null }
      records.set(`${input.kind}:${input.key}`, next)
      return clone(next)
    },
    async commit(input) {
      const snapshot = await api.drafts.get(input.kind, input.key)
      if (snapshot.revision !== input.revision) throw new Error('草稿已变化')
      const record = snapshot.record
      if (!record) throw new Error('没有草稿')
      let result: unknown
      if (record.kind === 'task') result = await api.tasks.update(record.key, draftToTask(record.payload))
      else if (record.kind === 'review') result = await api.flow.saveReview(record.payload)
      else if (record.kind === 'video') result = await api.flow.updateVideo(record.key, record.payload)
      else if (record.kind === 'videoLink') result = await api.flow.createVideo({ date: record.key, sourceUrl: record.payload.sourceUrl })
      else if (record.kind === 'subtask') {
        const parent = (await api.tasks.list()).find(task => task.id === record.key) as Task
        result = await api.tasks.create({ title: record.payload.title, parentTaskId: parent.id, listId: parent.listId, dueDate: parent.dueDate })
      } else {
        const tags = await api.tags.list()
        const parsed = parseQuickAdd(record.payload.title, await api.lists.list(), tags)
        const tagIds = await Promise.all(parsed.tagNames.map(async name => (tags.find(tag => tag.name === name) ?? await api.tags.create({ name })).id))
        result = await api.tasks.create({ ...parsed.input, tagIds, ...(record.kind === 'quickTask' ? { listId: record.payload.listId, plan: record.payload.plan, focusDate: null } : {}) })
      }
      await api.drafts.discard(input)
      return result
    },
  }
  return api
}
