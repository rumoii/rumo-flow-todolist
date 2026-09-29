// @vitest-environment jsdom
import { installDraftApi } from './draft-api-fixture'
import { config, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import type { SavedFilter, Tag, Task, TaskList, TodoApi } from '../src/shared/contracts'
import { taskToDraft } from '../src/shared/drafts'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  plan: { kind: 'day', start: new Date().toLocaleDateString('sv-SE') },
  focusDate: null,
  deletionBatch: null,
  id: 'task-1',
  title: '测试任务',
  listId: null,
  dueDate: new Date().toISOString().slice(0, 10),
  dueTime: null,
  reminderMinutesBefore: null,
  priority: 'none',
  notes: '',
  status: 'active',
  sortOrder: 0,
  isPinned: false,
  parentTaskId: null,
  recurrenceRuleId: null,
  deletedAt: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  ...overrides,
})

const list: TaskList = {
  id: 'list-1',
  name: '工作',
  color: '#856AF9',
  sortOrder: 0,
  isPinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const makeTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 'tag-1',
  name: '工作',
  color: '#856AF9',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

function createApi(seed: Task[] = [makeTask()], seedTags: Tag[] = [], seedFilters: SavedFilter[] = []): TodoApi {
  const tasks = [...seed]
  const tags = [...seedTags]
  const filters = [...seedFilters]
  const lists = [{ ...list }]
  return installDraftApi({
    tasks: {
      list: vi.fn(async () => tasks.map((task) => ({ ...task }))),
      create: vi.fn(async (input) => {
        const task = makeTask({ id: `task-${tasks.length + 1}`, ...input, priority: input.priority ?? 'none', notes: input.notes ?? '', tags: tags.filter((tag) => input.tagIds?.includes(tag.id)) })
        tasks.push(task)
        return { ...task }
      }),
      update: vi.fn(async (id, input) => {
        const index = tasks.findIndex((task) => task.id === id)
        tasks[index] = { ...tasks[index], ...input, updatedAt: new Date().toISOString() }
        return { ...tasks[index] }
      }),
      complete: vi.fn(async (id) => {
        const task = tasks.find((item) => item.id === id)
        if (task) task.status = 'completed'
      }),
      reopen: vi.fn(async (id) => {
        const task = tasks.find((item) => item.id === id)
        if (task) task.status = 'active'
      }),
      remove: vi.fn(async (id) => {
        const index = tasks.findIndex((task) => task.id === id)
        if (index >= 0) tasks.splice(index, 1)
      }),
      reorder: vi.fn(async () => undefined),
      organize: vi.fn(async (id, input) => {
        const task = tasks.find((task) => task.id === id)!
        Object.assign(task, { isPinned: input.isPinned, priority: input.priority })
        input.orderedIds.forEach((taskId, index) => { const item = tasks.find((candidate) => candidate.id === taskId); if (item) item.sortOrder = index })
        return { ...task }
      }),
    },
    lists: {
      list: vi.fn(async () => lists.map((item) => ({ ...item }))),
      create: vi.fn(async (input) => { const created = { ...list, id: `list-${lists.length + 1}`, ...input }; lists.push(created); return { ...created } }),
      update: vi.fn(async (id, input) => { const current = lists.find((item) => item.id === id)!; Object.assign(current, input); return { ...current } }),
      remove: vi.fn(async (id) => { const index = lists.findIndex((item) => item.id === id); if (index >= 0) lists.splice(index, 1) }),
      reorder: vi.fn(async () => undefined),
      organize: vi.fn(async (id, input) => {
        const current = lists.find((item) => item.id === id)
        if (!current) throw new Error('missing list')
        current.isPinned = input.isPinned
        input.orderedIds.forEach((listId, index) => { const item = lists.find((candidate) => candidate.id === listId); if (item) item.sortOrder = index })
        return { ...current }
      }),
    },
    tags: {
      list: vi.fn(async () => tags.map((tag) => ({ ...tag }))),
      create: vi.fn(async (input) => {
        const tag = makeTag({ id: `tag-${tags.length + 1}`, ...input })
        tags.push(tag)
        return { ...tag }
      }),
      update: vi.fn(async (id, input) => {
        const index = tags.findIndex((tag) => tag.id === id)
        tags[index] = { ...tags[index], ...input, updatedAt: new Date().toISOString() }
        return { ...tags[index] }
      }),
      remove: vi.fn(async (id) => {
        const index = tags.findIndex((tag) => tag.id === id)
        if (index >= 0) tags.splice(index, 1)
      }),
    },
    filters: {
      list: vi.fn(async () => filters.map((filter) => ({ ...filter, criteria: { ...filter.criteria } }))),
      create: vi.fn(async (input) => { const filter: SavedFilter = { id: `filter-${filters.length + 1}`, sortOrder: input.sortOrder ?? filters.length, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...input }; filters.push(filter); return { ...filter } }),
      update: vi.fn(async (id, input) => { const filter = filters.find((item) => item.id === id)!; Object.assign(filter, input); return { ...filter } }),
      remove: vi.fn(async (id) => { const index = filters.findIndex((item) => item.id === id); if (index >= 0) filters.splice(index, 1) }),
    },
    flow: { actionLinks: vi.fn(async () => []), taskFacts: vi.fn(async () => ({ completed: [], pending: [] })) },
    backup: {
      export: vi.fn(),
      import: vi.fn(),
    },
    settings: {
      get: vi.fn(async () => ({ automaticUpdateChecks: true, theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' })),
      update: vi.fn(async (input) => ({ automaticUpdateChecks: true, theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00', ...input })),
      onChanged: vi.fn(() => () => undefined),
    },
    desktop: {
      onDataChanged: vi.fn(() => () => undefined),
      status: vi.fn(async () => ({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: true })),
      openQuickCapture: vi.fn(),
      openExternal: vi.fn(),
      onFocusQuickAdd: vi.fn(() => () => undefined),
      onOpenFlow: vi.fn(() => () => undefined),
    },
  } as unknown as TodoApi)
}

function seedPair() {
  const parent = makeTask({ id: 'parent-1', title: '父任务' })
  const subtask = makeTask({ id: 'subtask-1', title: '旧子任务', parentTaskId: parent.id, notes: '子任务备注', priority: 'medium' })
  const api = createApi([parent, subtask])
  window.todoApi = api
  return { api, parent, subtask }
}

async function openDetail(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.task-row .task-main').trigger('click')
  await flushPromises()
  return wrapper.get('[aria-label="编辑子任务 旧子任务"]')
}

async function startEdit(wrapper: ReturnType<typeof mount>) {
  const trigger = await openDetail(wrapper)
  await trigger.trigger('click')
  await flushPromises()
  return wrapper.get<HTMLInputElement>('[aria-label="编辑子任务标题"]')
}

async function plantNotesDraft(api: TodoApi, subtask: Task) {
  const snapshot = await api.drafts.get('task', subtask.id)
  await api.drafts.put({ ...snapshot, kind: 'task', key: subtask.id, payload: { ...taskToDraft(subtask), notes: '未保存的备注' } })
}

describe('子任务标题编辑', () => {
  beforeEach(() => {
    config.global.stubs = { ...config.global.stubs, Teleport: true }
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete (config.global.stubs as Record<string, unknown>).Teleport
    vi.useRealTimers()
    delete window.todoApi
  })

  it('为每条子任务提供可发现的编辑入口并在进入时预填、聚焦', async () => {
    seedPair()
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    const trigger = await openDetail(wrapper)
    expect(trigger.attributes('aria-label')).toBe('编辑子任务 旧子任务')
    await trigger.trigger('click')
    await flushPromises()
    const input = wrapper.get('[aria-label="编辑子任务标题"]')
    expect((input.element as HTMLInputElement).value).toBe('旧子任务')
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.findAll('button').filter(button => button.text() === '保存' || button.text() === '取消')).toHaveLength(2)
    wrapper.unmount()
  })

  it('Enter 保存标题（输入法组合期间不触发），保存后立即显示新标题且其他字段不变', async () => {
    const { api } = seedPair()
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('  新子任务  ')
    await input.trigger('keydown.enter', { isComposing: true })
    await flushPromises()
    expect(api.tasks.update).not.toHaveBeenCalled()
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledWith('subtask-1', expect.objectContaining({ title: '新子任务', notes: '子任务备注', priority: 'medium' }))
    expect((api.tasks.update as ReturnType<typeof vi.fn>).mock.calls[0][1]).not.toHaveProperty('parentTaskId')
    expect(wrapper.find('.subtask-row').text()).toContain('新子任务')
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Esc 与取消按钮放弃修改并恢复原标题', async () => {
    const { api } = seedPair()
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('不要保存的标题')
    await input.trigger('keydown.esc')
    await flushPromises()
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(wrapper.find('.subtask-row').text()).toContain('旧子任务')
    const reopened = await startEdit(wrapper)
    await reopened.setValue('再次放弃')
    await wrapper.findAll('.subtask-edit button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(wrapper.find('.subtask-row').text()).toContain('旧子任务')
    wrapper.unmount()
  })

  it('空标题不能提交，输入与编辑状态保留', async () => {
    const { api } = seedPair()
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(wrapper.get('.subtask-edit-error').text()).toContain('请填写子任务标题')
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('提交中禁止重复保存', async () => {
    const { api, subtask } = seedPair()
    let release: ((task: Task) => void) | undefined
    api.tasks.update = vi.fn(() => new Promise<Task>((resolve) => { release = resolve })) as typeof api.tasks.update
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('慢速保存')
    await input.trigger('keydown.enter')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledTimes(1)
    release!({ ...subtask, title: '慢速保存', updatedAt: new Date().toISOString() })
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(false)
    expect(wrapper.find('.subtask-row').text()).toContain('慢速保存')
    wrapper.unmount()
  })

  it('保存响应不覆盖保存期间继续输入的标题', async () => {
    const { api, subtask } = seedPair()
    let release: ((task: Task) => void) | undefined
    let pending = true
    api.tasks.update = vi.fn(async (id, input) => {
      if (pending) { pending = false; return new Promise<Task>((resolve) => { release = resolve }) }
      return { ...subtask, id, ...input, updatedAt: new Date().toISOString() }
    }) as typeof api.tasks.update
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('慢速保存')
    await input.trigger('keydown.enter')
    await flushPromises()
    await input.setValue('保存期间继续输入')
    await flushPromises()
    release!({ ...subtask, title: '慢速保存', updatedAt: new Date().toISOString() })
    await flushPromises()
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(true)
    expect(wrapper.get<HTMLInputElement>('[aria-label="编辑子任务标题"]').element.value).toBe('保存期间继续输入')
    expect(api.tasks.update).toHaveBeenCalledTimes(1)
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledTimes(2)
    expect((api.tasks.update as ReturnType<typeof vi.fn>).mock.calls[1][1]).toMatchObject({ title: '保存期间继续输入' })
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('保存失败后保留输入供重试，重试成功后关闭编辑', async () => {
    const { api } = seedPair()
    const update = api.tasks.update
    let failed = false
    api.tasks.update = vi.fn(async (id, input) => {
      if (!failed) { failed = true; throw new Error('磁盘写入失败') }
      return update(id, input)
    }) as typeof api.tasks.update
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('失败后保留')
    await wrapper.findAll('.subtask-edit button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.subtask-edit-error').text()).toContain('磁盘写入失败')
    expect((wrapper.get('[aria-label="编辑子任务标题"]').element as HTMLInputElement).value).toBe('失败后保留')
    await wrapper.get('.subtask-edit-error button').trigger('click')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.subtask-row').text()).toContain('失败后保留')
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('正式记录变化时报错而不覆盖，重新核对后仅保存标题', async () => {
    const { api } = seedPair()
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('编辑标题')
    await api.tasks.update('subtask-1', { notes: '他处备注' })
    await flushPromises()
    await wrapper.findAll('.subtask-edit button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.subtask-edit-error').text()).toContain('已变化')
    expect((wrapper.get('[aria-label="编辑子任务标题"]').element as HTMLInputElement).value).toBe('编辑标题')
    expect(wrapper.find('.subtask-row').text()).not.toContain('编辑标题')
    await wrapper.findAll('.subtask-edit-error button').find(button => button.text() === '重新核对并仅保存标题')!.trigger('click')
    await flushPromises()
    const rename = (api.tasks.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)!
    expect(rename[0]).toBe('subtask-1')
    expect(rename[1]).toMatchObject({ title: '编辑标题', notes: '他处备注' })
    expect(wrapper.find('.subtask-row').text()).toContain('编辑标题')
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('后台刷新不覆盖正在输入的标题', async () => {
    const { api } = seedPair()
    let fireDataChanged: (() => void) | undefined
    api.desktop.onDataChanged = vi.fn((callback: () => void) => { fireDataChanged = callback; return () => undefined }) as typeof api.desktop.onDataChanged
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('正在输入的标题')
    await api.tasks.update('subtask-1', { title: '他处改名' })
    fireDataChanged!()
    await flushPromises()
    expect((wrapper.get('[aria-label="编辑子任务标题"]').element as HTMLInputElement).value).toBe('正在输入的标题')
    wrapper.unmount()
  })

  it('离开父详情时提示处理子任务标题，保留草稿后再次编辑可恢复', async () => {
    const { api } = seedPair()
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('离开时保留的标题')
    await flushPromises()
    await wrapper.get('.drawer-header [aria-label="关闭"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor-leave-dialog').text()).toContain('子任务标题')
    await wrapper.findAll('.editor-leave-dialog button').find(button => button.text() === '保留草稿并继续')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.detail-drawer').exists()).toBe(false)
    expect(api.tasks.update).not.toHaveBeenCalled()
    const trigger = await openDetail(wrapper)
    await trigger.trigger('click')
    await flushPromises()
    const restored = wrapper.get<HTMLInputElement>('[aria-label="编辑子任务标题"]')
    expect(restored.element.value).toBe('离开时保留的标题')
    wrapper.unmount()
  })

  it('离开父详情时可直接保存子任务标题', async () => {
    const { api } = seedPair()
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('离开时保存的标题')
    await flushPromises()
    await wrapper.get('.drawer-header [aria-label="关闭"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('.editor-leave-dialog button').find(button => button.text() === '保存并继续')!.trigger('click')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledWith('subtask-1', expect.objectContaining({ title: '离开时保存的标题' }))
    expect(wrapper.find('.detail-drawer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('切换编辑另一条子任务前完成当前编辑的离开检查', async () => {
    const parent = makeTask({ id: 'parent-1', title: '父任务' })
    const first = makeTask({ id: 'subtask-1', title: '旧子任务', parentTaskId: parent.id, sortOrder: 1 })
    const second = makeTask({ id: 'subtask-2', title: '第二子任务', parentTaskId: parent.id, sortOrder: 2 })
    const api = createApi([parent, first, second])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await openDetail(wrapper)
    await wrapper.get('[aria-label="编辑子任务 旧子任务"]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="编辑子任务标题"]').setValue('切换前的输入')
    await wrapper.get('[aria-label="编辑子任务 第二子任务"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor-leave-dialog').exists()).toBe(true)
    expect(wrapper.find('.editor-leave-dialog').text()).toContain('子任务标题')
    await wrapper.findAll('.editor-leave-dialog button').find(button => button.text() === '保留草稿并继续')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="编辑子任务标题"]').element).toHaveProperty('value', '第二子任务')
    await wrapper.findAll('.subtask-edit button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="编辑子任务 旧子任务"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="编辑子任务标题"]').element).toHaveProperty('value', '切换前的输入')
    wrapper.unmount()
  })

  it('已有其他字段草稿时阻止行内保存误提交草稿内容', async () => {
    const { api, subtask } = seedPair()
    await plantNotesDraft(api, subtask)
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    expect(wrapper.get('.subtask-edit-notice').text()).toContain('其他未保存的修改')
    await input.setValue('悄悄改名')
    await wrapper.findAll('.subtask-edit button').find(button => button.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(wrapper.get('.subtask-edit-error').text()).toContain('打开任务详情')
    expect(wrapper.get<HTMLInputElement>('[aria-label="编辑子任务标题"]').element.value).toBe('悄悄改名')
    const snapshot = await api.drafts.get('task', 'subtask-1')
    expect(snapshot.record?.payload).toEqual({ ...taskToDraft(subtask), notes: '未保存的备注' })
    wrapper.unmount()
  })

  it('已有其他字段草稿时取消不改变或丢失草稿内容', async () => {
    const { api, subtask } = seedPair()
    await plantNotesDraft(api, subtask)
    const wrapper = mount(App)
    await flushPromises()
    const input = await startEdit(wrapper)
    await input.setValue('取消前的输入')
    await wrapper.findAll('.subtask-edit button').find(button => button.text() === '取消')!.trigger('click')
    await flushPromises()
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(wrapper.find('[aria-label="编辑子任务标题"]').exists()).toBe(false)
    expect(wrapper.find('.subtask-row').text()).toContain('旧子任务')
    const snapshot = await api.drafts.get('task', 'subtask-1')
    expect(snapshot.record?.payload).toEqual({ ...taskToDraft(subtask), notes: '未保存的备注' })
    wrapper.unmount()
  })

  it('提供打开任务详情处理已有草稿的路径', async () => {
    const { api, subtask } = seedPair()
    await plantNotesDraft(api, subtask)
    const wrapper = mount(App)
    await flushPromises()
    await startEdit(wrapper)
    await wrapper.findAll('.subtask-edit-notice button').find(button => button.text() === '打开任务详情')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.recovery-banner').exists()).toBe(true)
    expect(wrapper.get<HTMLInputElement>('.title-input').element.value).toBe('旧子任务')
    const snapshot = await api.drafts.get('task', 'subtask-1')
    expect(snapshot.record?.payload).toEqual({ ...taskToDraft(subtask), notes: '未保存的备注' })
    wrapper.unmount()
  })
})
