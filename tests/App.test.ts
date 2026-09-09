// @vitest-environment jsdom
import { config, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import type { SavedFilter, Tag, Task, TaskList, TodoApi } from '../src/shared/contracts'

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
  return {
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
        const index = tasks.findIndex((item) => item.id === id)
        if (index >= 0) tasks.splice(index, 1)
      }),
      reorder: vi.fn(async () => undefined),
      organize: vi.fn(async (id, input) => {
        const task = tasks.find((item) => item.id === id)!
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
  } as unknown as TodoApi
}

describe('App critical interactions', () => {
  it('puts focus first, separates ordinary pinning and filters both reminder sections', async () => {
    const today = new Date().toLocaleDateString('sv-SE')
    window.todoApi = createApi([
      makeTask({ id: 'focus', title: '项目重点', focusDate: today }),
      makeTask({ id: 'pinned', title: '普通置顶', isPinned: true }),
      makeTask({ id: 'due', title: '项目到期', plan: null }),
      makeTask({ id: 'past', title: '项目过往', dueDate: null, plan: { kind: 'day', start: '2025-01-01' } }),
    ])
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.get('.today-focus').text()).toContain('项目重点')
    expect(wrapper.get('.today-focus').text()).not.toContain('普通置顶')
    expect(wrapper.get('.today-other').text()).toContain('普通置顶')
    expect(wrapper.get('.today-reminders').text()).toContain('项目到期')
    expect(wrapper.findAll('.today-reminders details').every(panel => panel.attributes('open') === undefined)).toBe(true)
    await wrapper.get('.workspace-search-trigger').trigger('click')
    await wrapper.findAll('.search-scopes button')[1].trigger('click')
    await wrapper.get('[aria-label="搜索关键词"]').setValue('普通')
    await wrapper.get('.unified-search-form').trigger('submit')
    expect(wrapper.find('.today-reminders').exists()).toBe(false)
    expect(wrapper.get('.today-other').text()).toContain('普通置顶')
    wrapper.unmount()
  })

  it('arranges through the dedicated command and retains errors without hiding the task', async () => {
    const task = makeTask()
    const api = createApi([task])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    api.drafts = { get: vi.fn(async () => ({ generation: 'generation', revision: 0, record: null, baseUpdatedAt: task.updatedAt })) } as unknown as TodoApi['drafts']
    api.tasks.arrange = vi.fn().mockRejectedValueOnce(new Error('该任务有未保存修改')).mockResolvedValueOnce({ ...task, plan: null, focusDate: null, dueDate: null })
    await wrapper.get('.task-plan-button').trigger('click')
    await flushPromises()
    const unplanned = () => wrapper.findAll('.arrangement-options button').find(button => button.text() === '未安排')!
    await unplanned().trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('未保存修改')
    expect(wrapper.find('.today-other .task-row').exists()).toBe(true)
    await unplanned().trigger('click')
    await flushPromises()
    expect(api.tasks.arrange).toHaveBeenLastCalledWith({ taskId: task.id, generation: 'generation', updatedAt: task.updatedAt, action: { kind: 'plan', target: null } })
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(wrapper.find('.arrangement-dialog').exists()).toBe(false)
    expect(wrapper.find('.today-other .task-row').exists()).toBe(false)
    expect(document.activeElement?.tagName).toBe('H1')
    wrapper.unmount()
  })
  beforeEach(() => {
    config.global.stubs = { ...config.global.stubs, Teleport: true }
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete (config.global.stubs as Record<string, unknown>).Teleport
    vi.useRealTimers()
    delete window.todoApi
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.density
  })

  it('applies the loaded theme and saves an immediately visible theme change', async () => {
    const api = createApi([])
    api.settings.get = vi.fn(async () => ({ automaticUpdateChecks: true, theme: 'dark', density: 'compact', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }))
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.density).toBe('compact')

    await wrapper.findAll('.nav-item').find((button) => button.text().includes('设置'))!.trigger('click')
    await wrapper.findAll('.theme-option').find(option => option.text().includes('浅色'))!.trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
    await flushPromises()
    expect(api.settings.update).toHaveBeenCalledWith({ theme: 'light' })
  })

  it('restores the last saved theme when persistence fails', async () => {
    const api = createApi([])
    let rejectUpdate: ((reason?: unknown) => void) | undefined
    api.settings.update = vi.fn(() => new Promise((_resolve, reject) => { rejectUpdate = reject }))
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.findAll('.nav-item').find((button) => button.text().includes('设置'))!.trigger('click')
    await wrapper.findAll('.theme-option').find(option => option.text().includes('深色'))!.trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')
    rejectUpdate?.(new Error('write failed'))
    await flushPromises()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(wrapper.text()).toContain('主题保存失败，已恢复原设置')
  })

  it('adds a task from the quick input on Enter', async () => {
    const api = createApi([])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.quick-add input').setValue('整理会议纪要')
    await wrapper.find('.quick-add input').trigger('keydown.enter')
    expect(api.tasks.create).toHaveBeenCalledWith(expect.objectContaining({ title: '整理会议纪要' }))
    expect(wrapper.text()).toContain('整理会议纪要')
  })

  it('keeps unplanned custom-list tasks out of today', async () => {
    const api = createApi([])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    const listButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('工作'))
    await listButton!.trigger('click')
    await wrapper.find('.quick-add input').setValue('开学前任务')
    await wrapper.find('.quick-add input').trigger('keydown.enter')
    await flushPromises()

    const todayButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('今天'))!
    await todayButton.trigger('click')
    expect(todayButton.find('em').text()).toBe('0')
    expect(wrapper.findAll('.task-row')).toHaveLength(0)
  })

  it('creates an unknown Quick Add tag and binds it to the new task', async () => {
    const api = createApi([])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.quick-add input').setValue('整理会议纪要 #会议')
    await wrapper.find('.quick-add input').trigger('keydown.enter')
    await flushPromises()
    expect(api.tags.create).toHaveBeenCalledWith(expect.objectContaining({ name: '会议' }))
    expect(api.tasks.create).toHaveBeenCalledWith(expect.objectContaining({ title: '整理会议纪要', tagIds: ['tag-1'] }))
    expect(wrapper.text()).toContain('#会议')
  })

  it('toggles the saved-filter composer inside its motion wrapper', async () => {
    window.todoApi = createApi()
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.filter-composer-motion').exists()).toBe(false)
    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    expect(wrapper.find('.filter-composer-motion').exists()).toBe(true)
    expect(wrapper.findAll('.filter-composer-motion [role="combobox"]')).toHaveLength(5)
    expect(wrapper.findAll('.filter-field-row>span').map(label => label.text())).toEqual(['状态', '清单', '重要程度', '标签', '日期'])
    expect(wrapper.findAll('.filter-field-row .select-field__value').map(value => value.text())).toEqual(['进行中', '任意清单', '任意重要程度', '任意标签', '任意日期'])
    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    expect(wrapper.find('.filter-composer-motion').exists()).toBe(false)
  })

  it('toggles completion through the checkbox and reports success', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .check').trigger('click')
    expect(api.tasks.complete).toHaveBeenCalledWith('task-1')
    expect(wrapper.find('.detail-drawer').exists()).toBe(false)
    expect(wrapper.text()).toContain('已完成')
  })

  it('opens the detail drawer and saves edited fields', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .task-main').trigger('click')
    expect(wrapper.find('.detail-drawer').exists()).toBe(true)
    await wrapper.find('.title-input').setValue('改名后的任务')
    const reminderSelect = wrapper.findAll('[role="combobox"]').find(select => select.attributes('aria-label') === '任务提醒')!
    await reminderSelect.trigger('click')
    const hourOption = wrapper.findAll('[role="option"]').find(option => option.text().includes('提前 1 小时'))!
    await hourOption.trigger('click')
    await wrapper.find('.save-button').trigger('click')
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ title: '改名后的任务', reminderMinutesBefore: 60 }))
  })

  it('filters by a task tag without opening task details', async () => {
    const workTag = makeTag()
    const privateTag = makeTag({ id: 'tag-2', name: '个人' })
    const api = createApi([makeTask({ title: '工作任务', tags: [workTag] }), makeTask({ id: 'task-2', title: '个人任务', tags: [privateTag] })], [workTag, privateTag])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-tag').trigger('click')
    expect(wrapper.find('.detail-drawer').exists()).toBe(false)
    expect(wrapper.text()).toContain('当前标签：#工作')
    expect(wrapper.text()).toContain('工作任务')
    expect(wrapper.text()).not.toContain('个人任务')
  })

  it('creates and selects a tag from task details', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .task-main').trigger('click')
    await wrapper.find('.editor-tag-query').setValue('新标签')
    await wrapper.find('.tag-create-button').trigger('click')
    await flushPromises()
    expect(api.tags.create).toHaveBeenCalledWith(expect.objectContaining({ name: '新标签' }))
    await wrapper.find('.save-button').trigger('click')
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ tagIds: ['tag-1'] }))
  })

  it('shows the completed view only for completed tasks', async () => {
    const api = createApi([makeTask({ status: 'completed', title: '完成项' }), makeTask({ id: 'task-2', title: '进行中' })])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    const completedButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('已完成'))
    await completedButton!.trigger('click')
    expect(wrapper.text()).toContain('完成项')
    expect(wrapper.text()).not.toContain('进行中')
  })

  it('shows completed tasks and a filter-specific empty state in saved filters', async () => {
    const completedFilter: SavedFilter = { id: 'filter-completed', name: '仅看已完成', criteria: { status: 'completed' }, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const emptyFilter: SavedFilter = { id: 'filter-empty', name: '仅看高重要程度', criteria: { priorities: ['high'] }, sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    const api = createApi([makeTask({ status: 'completed', title: '完成项' }), makeTask({ id: 'task-2', title: '进行中' })], [], [completedFilter, emptyFilter])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.findAll('.saved-filter-row .nav-item')[0].trigger('click')
    expect(wrapper.text()).toContain('完成项')
    expect(wrapper.text()).not.toContain('进行中')
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('仅看已完成')

    await wrapper.findAll('.saved-filter-row .nav-item')[1].trigger('click')
    expect(wrapper.text()).toContain('“仅看高重要程度”暂无匹配任务')
    expect(wrapper.text()).not.toContain('添加第一项任务')
  })

  it('does not open shortcut help while typing and moves focus into dialogs', async () => {
    window.todoApi = createApi()
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    const searchInput = wrapper.find('.quick-add input')
    await searchInput.trigger('keydown', { key: '?' })
    expect(wrapper.find('.shortcut-dialog').exists()).toBe(false)

    const settingsButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('设置'))!
    await settingsButton.trigger('click')
    await flushPromises()
    const dialog = wrapper.find('.settings-dialog').element
    expect(dialog.contains(document.activeElement)).toBe(true)
    wrapper.unmount()
  })

  it('refreshes today after the application crosses midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T23:59:30'))
    window.todoApi = createApi([makeTask({ plan: { kind: 'day', start: '2026-09-08' } })])
    const wrapper = mount(App)
    await flushPromises()
    const todayButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('今天'))!
    expect(todayButton.find('em').text()).toBe('0')

    await vi.advanceTimersByTimeAsync(60000)
    expect(todayButton.find('em').text()).toBe('1')
    wrapper.unmount()
  })

  it('sets task priority and pin state from the task menu', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.task-row .icon-button').trigger('click')
    const pinButton = wrapper.findAll('.task-menu-panel button').find((button) => button.text().includes('置顶任务'))
    await pinButton!.trigger('click')
    await flushPromises()
    expect(api.tasks.organize).toHaveBeenCalledWith('task-1', expect.objectContaining({ isPinned: true, priority: 'none', orderedIds: ['task-1'] }))
    expect(wrapper.text()).toContain('置顶')

    await wrapper.find('.task-row .icon-button').trigger('click')
    await wrapper.findAll('.task-menu-panel button').find(button => button.text().includes('重要程度'))!.trigger('click')
    const priorityButton = wrapper.findAll('.task-menu-panel button').find((button) => button.text().includes('高'))
    await priorityButton!.trigger('click')
    await flushPromises()
    expect(api.tasks.organize).toHaveBeenLastCalledWith('task-1', expect.objectContaining({ isPinned: true, priority: 'high', orderedIds: ['task-1'] }))
    expect(wrapper.text()).toContain('高')
  })

  it('pins a list and deletes it with the selected task policy', async () => {
    const api = createApi([makeTask({ listId: list.id })])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.list-menu-button').trigger('click')
    const pinButton = wrapper.findAll('.list-popup button').find((button) => button.text().includes('置顶清单'))
    await pinButton!.trigger('click')
    await flushPromises()
    expect(api.lists.organize).toHaveBeenCalledWith('list-1', { isPinned: true, orderedIds: ['list-1'] })

    await wrapper.find('.list-menu-button').trigger('click')
    const deleteButton = wrapper.findAll('.list-popup button').find((button) => button.text().includes('删除清单'))
    await deleteButton!.trigger('click')
    await wrapper.find('input[value="delete"]').setValue()
    await wrapper.find('.list-delete-dialog .delete-button').trigger('click')
    await flushPromises()
    expect(api.lists.remove).toHaveBeenCalledWith('list-1', { taskPolicy: 'delete' })
    expect(wrapper.text()).not.toContain('测试任务')
  })

  it('places the subtask composer before task fields in the detail drawer', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .task-main').trigger('click')

    const subtasks = wrapper.find('.subtasks').element
    const firstField = wrapper.find('.editor-properties').element
    expect(subtasks.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps notes and subtasks visible without card navigation', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .task-main').trigger('click')
    expect(wrapper.findAll('.detail-card')).toHaveLength(0)
    expect(wrapper.findAll('.editor-section h3').map(heading => heading.text())).toEqual(['备注', '子任务'])
    await wrapper.get('[aria-label="展开任务详情"]').trigger('click')
    expect(wrapper.get('.task-editor').classes()).toContain('task-editor-expanded')
  })
})
