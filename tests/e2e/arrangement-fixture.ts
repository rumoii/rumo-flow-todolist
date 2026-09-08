import type { ArrangeTaskInput, DraftKind, DraftSnapshot, DraftWrite, LifecycleResume, Task, TodoApi } from '../../src/shared/contracts'

export function installArrangementFixture() {
  const today = new Date().toLocaleDateString('sv-SE')
  const timestamp = new Date().toISOString()
  const shift = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + amount); return date.toLocaleDateString('sv-SE') }
  const plan = (kind: 'day' | 'week' | 'month', day: string) => ({ kind, start: kind === 'month' ? `${day.slice(0, 7)}-01` : kind === 'week' ? shift(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7)) : day })
  const tag = { id: 'work', name: '工作', color: '#856af9', createdAt: timestamp, updatedAt: timestamp }
  const list = { id: 'work', name: '工作清单', color: '#856af9', sortOrder: 0, isPinned: false, createdAt: timestamp, updatedAt: timestamp }
  const task = (id: string, title: string, overrides: Partial<Task>): Task => ({ id, title, listId: null, plan: null, focusDate: null, dueDate: null, dueTime: null, reminderMinutesBefore: null, priority: 'none', notes: '', status: 'active', sortOrder: 0, isPinned: false, parentTaskId: null, recurrenceRuleId: null, deletedAt: null, deletionBatch: null, tags: [], createdAt: timestamp, updatedAt: timestamp, completedAt: null, ...overrides })
  const tasks = [
    task('focus', '完成今天最重要的设计', { plan: plan('day', today), focusDate: today, tags: [tag] }),
    task('ordinary', '整理项目资料', { plan: plan('day', today), isPinned: true }),
    task('due', '提交项目报告', { dueDate: today, dueTime: '23:59', reminderMinutesBefore: 15, tags: [tag] }),
    task('past', '回顾上一次讨论', { plan: plan('day', shift(today, -2)) }),
    task('week', '阅读架构设计资料', { plan: plan('week', today) }),
    task('unplanned', '一个尚未安排的想法', {}),
  ]
  const settings = { theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }
  const records = new Map<string, DraftSnapshot>()
  const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value))
  let prepare: (() => Promise<void>) | undefined
  let resume: ((value: LifecycleResume) => void) | undefined
  let changed: (() => void) | undefined
  const get = async (kind: DraftKind, key: string): Promise<DraftSnapshot> => clone({ generation: 'browser-fixture', revision: 0, record: null, ...records.get(`${kind}:${key}`), baseUpdatedAt: tasks.find(task => task.id === key)?.updatedAt ?? null })
  const api = {
    tasks: {
      list: async () => clone(tasks.filter(task => !task.deletedAt)),
      create: async (input: Partial<Task>) => { const created = task(crypto.randomUUID(), input.title!, input); tasks.push(created); changed?.(); return clone(created) },
      arrange: async (input: ArrangeTaskInput) => {
        let synchronizedTask: LifecycleResume['synchronizedTask']
        try {
          await prepare?.()
          const current = tasks.find(task => task.id === input.taskId)!
          if (input.updatedAt !== current.updatedAt) throw new Error('任务已变化，请重新打开')
          if ((await get('task', current.id)).record) throw new Error('该任务有未保存修改，请先在详情中保存或放弃')
          const action = input.action
          if (action.kind === 'focus') { if (action.enabled) current.plan = plan('day', today); current.focusDate = action.enabled ? today : null }
          else {
            const target = action.target
            const nextPlan = typeof target === 'string' ? target === 'today' || target === 'tomorrow' ? plan('day', shift(today, target === 'today' ? 0 : 1)) : plan(target, today) : target
            if (nextPlan?.kind !== 'day' || nextPlan.start !== current.plan?.start) current.focusDate = null
            current.plan = nextPlan
          }
          current.updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
          synchronizedTask = { task: clone(current), snapshot: await get('task', current.id) }
          changed?.()
          return clone(current)
        }
        finally { resume?.({ replaced: false, synchronizedTask }) }
      },
      update: async (id: string, input: Partial<Task>) => { const current = tasks.find(task => task.id === id)!; Object.assign(current, input, { updatedAt: new Date().toISOString() }); changed?.(); return clone(current) },
      complete: async (id: string) => { tasks.find(task => task.id === id)!.status = 'completed'; changed?.() },
      reopen: async (id: string) => { tasks.find(task => task.id === id)!.status = 'active'; changed?.() },
      organize: async (id: string, input: Partial<Task>) => { const current = tasks.find(task => task.id === id)!; Object.assign(current, input); changed?.(); return clone(current) },
    },
    drafts: {
      get,
      put: async (input: DraftWrite) => {
        const snapshot = await get(input.kind, input.key)
        const next = { ...snapshot, revision: snapshot.revision + 1, record: { kind: input.kind, key: input.key, version: 2, revision: snapshot.revision + 1, baseUpdatedAt: input.baseUpdatedAt, payload: clone(input.payload), updatedAt: new Date().toISOString() } } as DraftSnapshot
        records.set(`${input.kind}:${input.key}`, next)
        return clone(next)
      },
      discard: async (input: { kind: DraftKind; key: string }) => { records.delete(`${input.kind}:${input.key}`); return get(input.kind, input.key) },
      commit: async () => { throw new Error('此浏览器样例不模拟正式草稿提交，请使用桌面验收') },
    },
    lifecycle: {
      onPrepare: (callback: () => Promise<void>) => { prepare = callback; return () => { prepare = undefined } },
      onResume: (callback: (value: LifecycleResume) => void) => { resume = callback; return () => { resume = undefined } },
    },
    lists: { list: async () => [list] },
    tags: { list: async () => [tag] },
    filters: { list: async () => [] },
    settings: { get: async () => clone(settings), update: async (input: object) => Object.assign(settings, input), onChanged: () => () => undefined },
    desktop: { status: async () => ({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: true }), onDataChanged: (callback: () => void) => { changed = callback; return () => { changed = undefined } }, onFocusQuickAdd: () => () => undefined, onOpenFlow: () => () => undefined },
  } as unknown as TodoApi
  window.todoApi = api
}
