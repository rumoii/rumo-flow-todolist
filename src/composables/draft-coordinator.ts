import { reactive, ref } from 'vue'
import type { InjectionKey } from 'vue'
import type { TaskSynchronization, TodoApi } from '../shared/contracts'
import { taskToDraft } from '../shared/drafts'
import type { DraftKind, DraftPayloads, DraftSnapshot } from '../shared/drafts'
interface Entry {
  kind: DraftKind
  key: string
  snapshot: DraftSnapshot
  payload: DraftPayloads[DraftKind]
  dirty: boolean
  sequence: number
  status: string
  error: string
  queue: Promise<unknown>
  timer?: ReturnType<typeof setTimeout>
}
const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value))
export function createDraftCoordinator(api: TodoApi | undefined) {
  const entries = reactive(new Map<string, Entry>())
  const paused = ref(false)
  const saving = ref(false)
  const epoch = ref(0)
  const synchronizedTask = ref<TaskSynchronization | null>(null)
  let removePrepare: (() => void) | undefined
  let removeResume: (() => void) | undefined
  const supported = Boolean(api?.drafts)
  const identity = (kind: DraftKind, key: string) => `${kind}:${key}`
  async function open<Kind extends DraftKind>(kind: Kind, key: string, fallback: DraftPayloads[Kind]): Promise<DraftPayloads[Kind]> {
    if (!supported)
      return clone(fallback)
    const existing = entries.get(identity(kind, key))
    if (existing)
      return clone(existing.payload) as DraftPayloads[Kind]
    const generation = epoch.value
    const snapshot = await api!.drafts.get(kind, key)
    if (epoch.value !== generation)
      throw new Error('数据已恢复，请重新打开编辑器')
    const pending = entries.get(identity(kind, key))
    if (pending)
      return clone(pending.payload) as DraftPayloads[Kind]
    const entry: Entry = { kind, key, snapshot, payload: clone(snapshot.record?.payload ?? fallback), dirty: false, sequence: 0,
      status: snapshot.record ? '草稿已恢复' : '', error: '', queue: Promise.resolve() }
    entries.set(identity(kind, key), entry)
    return clone(entry.payload) as DraftPayloads[Kind]
  }
  function update<Kind extends DraftKind>(kind: Kind, key: string, payload: DraftPayloads[Kind]) {
    const entry = entries.get(identity(kind, key))
    if (!entry || paused.value || saving.value || JSON.stringify(entry.payload) === JSON.stringify(payload))
      return
    entry.payload = clone(payload)
    entry.sequence++
    entry.dirty = true
    entry.status = '正在保留草稿…'
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => { void flushEntry(entry).catch(() => undefined); }, 500)
  }
  function enqueue<Result>(entry: Entry, action: () => Promise<Result>): Promise<Result> {
    const pending = entry.queue.catch(() => undefined).then(action)
    entry.queue = pending
    return pending
  }
  function flushEntry(entry: Entry): Promise<void> {
    clearTimeout(entry.timer)
    return enqueue(entry, async () => {
      if (!entry.dirty)
        return
      const sequence = entry.sequence
      try {
        const snapshot = await api!.drafts.put({ kind: entry.kind, key: entry.key, generation: entry.snapshot.generation,
          revision: entry.snapshot.revision, baseUpdatedAt: entry.snapshot.record ? entry.snapshot.record.baseUpdatedAt : entry.snapshot.baseUpdatedAt,
          payload: clone(entry.payload) })
        entry.snapshot = snapshot
        entry.dirty = sequence !== entry.sequence
        entry.status = entry.dirty ? '正在保留草稿…' : '草稿已保留'
        entry.error = ''
      }
      catch (error) {
        entry.error = error instanceof Error ? error.message : '草稿保留失败'
        entry.status = '草稿保留失败，请重试'
        throw error
      }
    })
  }
  async function flush() {
    for (const entry of entries.values()) {
      await flushEntry(entry)
      if (entry.dirty)
        await flushEntry(entry)
    }
  }
  async function commit(kind: DraftKind, key: string, acceptChanges = false): Promise<unknown> {
    if (paused.value || saving.value)
      throw new Error('正在保留或恢复数据，请稍后重试')
    const entry = entries.get(identity(kind, key))
    if (!entry)
      throw new Error('编辑器尚未准备好')
    saving.value = true
    try {
      if (!entry.snapshot.record)
        entry.dirty = true
      await flushEntry(entry)
      return await enqueue(entry, async () => {
        const submit = (acceptChanges: boolean) => api!.drafts.commit({ kind, key, generation: entry.snapshot.generation, revision: entry.snapshot.revision, acceptChanges })
        let result: unknown
        try {
          result = await submit(acceptChanges)
        }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes('正式记录已变化') || !window.confirm('正式记录已变化。保留当前编辑内容并覆盖对应字段吗？取消可返回检查，草稿不会丢失。'))
            throw error
          result = await submit(true)
        }
        clearTimeout(entry.timer)
        entries.delete(identity(kind, key))
        return result
      })
    }
    finally {
      saving.value = false
    }
  }
  async function discard(kind: DraftKind, key: string) {
    if (paused.value || saving.value) throw new Error('正在保存，请稍后重试')
    const entry = entries.get(identity(kind, key))
    if (!entry)
      return
    clearTimeout(entry.timer)
    saving.value = true
    try {
      await enqueue(entry, async () => {
        const snapshot = await api!.drafts.get(kind, key)
        if (snapshot.generation !== entry.snapshot.generation) throw new Error('数据已恢复，请重新打开编辑器')
        return api!.drafts.discard({ kind, key, generation: snapshot.generation, revision: snapshot.revision })
      })
      entries.delete(identity(kind, key))
    } finally { saving.value = false }
  }
  async function reload(kind: DraftKind, key: string) {
    const entry = entries.get(identity(kind, key))
    if (!entry)
      return
    await entry.queue.catch(() => undefined)
    const snapshot = await api!.drafts.get(kind, key)
    entry.snapshot = snapshot
    if (kind === 'task') {
      const payload = entry.payload as DraftPayloads['task']
      const [lists, tags] = await Promise.all([api!.lists.list(), api!.tags.list()])
      if (payload.listId && !lists.some(list => list.id === payload.listId))
        payload.listId = null
      payload.tagIds = payload.tagIds.filter(id => tags.some(tag => tag.id === id))
    }
    entry.dirty = true
    await flushEntry(entry)
  }
  function forget(kind: DraftKind, key: string) {
    const entry = entries.get(identity(kind, key))
    if (entry)
      clearTimeout(entry.timer)
    entries.delete(identity(kind, key))
  }
  function reset() {
    for (const entry of entries.values())
      clearTimeout(entry.timer)
    entries.clear()
    synchronizedTask.value = null
    epoch.value++
  }
  function retainTasks(ids: Set<string>) {
    for (const entry of entries.values())
      if (entry.kind === 'task' && !ids.has(entry.key))
        forget(entry.kind, entry.key)
  }
  function connect() {
    removePrepare = api?.lifecycle?.onPrepare(async () => {
      paused.value = true
      if (saving.value) throw new Error('正在保存修改，请稍后重试')
      await flush()
    })
    removeResume = api?.lifecycle?.onResume(result => {
      try {
        if (result.replaced) reset()
        if (result.synchronizedTask) {
          const sync = clone(result.synchronizedTask)
          const entry = entries.get(identity('task', sync.task.id))
          if (sync.snapshot.record || (entry && (entry.dirty || entry.snapshot.record || entry.snapshot.generation !== sync.snapshot.generation))) return
          if (entry) {
            clearTimeout(entry.timer)
            entry.snapshot = sync.snapshot
            entry.payload = taskToDraft(sync.task)
            entry.status = ''
            entry.error = ''
          }
          else {
            entries.set(identity('task', sync.task.id), { kind: 'task', key: sync.task.id, snapshot: sync.snapshot,
              payload: taskToDraft(sync.task), dirty: false, sequence: 0, status: '', error: '', queue: Promise.resolve() })
          }
          synchronizedTask.value = sync
        }
      } finally { paused.value = false }
    })
  }
  function dispose() {
    removePrepare?.()
    removeResume?.()
    for (const entry of entries.values())
      clearTimeout(entry.timer)
  }
  const status = (kind: DraftKind, key: string) => entries.get(identity(kind, key))?.status ?? ''
  const error = (kind: DraftKind, key: string) => entries.get(identity(kind, key))?.error ?? ''
  return { supported, paused, saving, epoch, synchronizedTask, open, update, flush, commit, discard, reload, forget, reset, retainTasks, connect, dispose, status, error }
}
export type DraftCoordinator = ReturnType<typeof createDraftCoordinator>
export const draftCoordinatorKey: InjectionKey<DraftCoordinator> = Symbol('draft-coordinator')
