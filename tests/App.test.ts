// @vitest-environment jsdom
import { installDraftApi } from './draft-api-fixture'
import { config, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import type { SavedFilter, Tag, Task, TaskList, TodoApi } from '../src/shared/contracts'

enableAutoUnmount(afterEach)

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
  } as unknown as TodoApi)
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
    await flushPromises()
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
    await flushPromises()
    await wrapper.find('.quick-add input').setValue('开学前任务')
    await wrapper.find('.quick-add input').trigger('keydown.enter')
    await flushPromises()
    await flushPromises()

    const todayButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('今天'))!
    await todayButton.trigger('click')
    await flushPromises()
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
    await flushPromises()
    expect(api.tags.create).toHaveBeenCalledWith(expect.objectContaining({ name: '会议' }))
    expect(api.tasks.create).toHaveBeenCalledWith(expect.objectContaining({ title: '整理会议纪要', tagIds: ['tag-1'] }))
    expect(wrapper.text()).toContain('#会议')
  })

  it('toggles the saved-filter composer button state and keeps the unsubmitted draft', async () => {
    window.todoApi = createApi()
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.filter-composer-motion').exists()).toBe(false)
    const closedButton = wrapper.get('[aria-label="新建筛选"]')
    expect(closedButton.text()).toBe('＋')
    expect(closedButton.attributes('aria-expanded')).toBe('false')
    expect(closedButton.attributes('aria-controls')).toBe('filter-composer-form')

    await closedButton.trigger('click')
    expect(wrapper.find('.filter-composer-motion').exists()).toBe(true)
    const openButton = wrapper.get('[aria-label="收起新建筛选"]')
    expect(openButton.text()).toBe('−')
    expect(openButton.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#filter-composer-form').exists()).toBe(true)
    expect(wrapper.findAll('.filter-composer-motion [role="combobox"]')).toHaveLength(5)
    expect(wrapper.findAll('.filter-composer-motion .filter-field-row>span').map(label => label.text())).toEqual(['关键词', '状态', '清单', '重要程度', '标签', '日期'])
    expect(wrapper.findAll('.filter-composer-motion .filter-field-row .select-field__value').map(value => value.text())).toEqual(['进行中', '任意清单', '任意重要程度', '任意标签', '任意日期'])

    await wrapper.get('[aria-label="筛选关键词"]').setValue('草稿关键词')
    await wrapper.get('.filter-name-input').setValue('草稿名称')
    await wrapper.get('[aria-label="收起新建筛选"]').trigger('click')
    expect(wrapper.find('.filter-composer-motion').exists()).toBe(false)
    expect(wrapper.get('[aria-label="新建筛选"]').text()).toBe('＋')

    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    expect(wrapper.get('.filter-name-input').element.value).toBe('草稿名称')
    expect(wrapper.get('[aria-label="筛选关键词"]').element.value).toBe('草稿关键词')
  })

  it('prefills the new filter keyword from the page search only on the first expand', async () => {
    window.todoApi = createApi()
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.workspace-search-trigger').trigger('click')
    await wrapper.findAll('.search-scopes button')[1].trigger('click')
    await wrapper.get('[aria-label="搜索关键词"]').setValue('页面词')
    await wrapper.get('.unified-search-form').trigger('submit')
    await flushPromises()

    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    expect(wrapper.get('[aria-label="筛选关键词"]').element.value).toBe('页面词')
    await wrapper.get('[aria-label="筛选关键词"]').setValue('表单草稿')
    await wrapper.get('[aria-label="收起新建筛选"]').trigger('click')

    await wrapper.get('.workspace-search-trigger').trigger('click')
    await wrapper.findAll('.search-scopes button')[1].trigger('click')
    await wrapper.get('[aria-label="搜索关键词"]').setValue('另一个页面词')
    await wrapper.get('.unified-search-form').trigger('submit')
    await flushPromises()

    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    expect(wrapper.get('[aria-label="筛选关键词"]').element.value).toBe('表单草稿')
    wrapper.unmount()
  })

  it('creates a filter from the keyword input instead of the page search and resets the form', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.get('.workspace-search-trigger').trigger('click')
    await wrapper.findAll('.search-scopes button')[1].trigger('click')
    await wrapper.get('[aria-label="搜索关键词"]').setValue('页面词')
    await wrapper.get('.unified-search-form').trigger('submit')
    await flushPromises()

    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    await wrapper.get('.filter-name-input').setValue('我的筛选')
    await wrapper.get('[aria-label="筛选关键词"]').setValue('表单词')
    await wrapper.get('.filter-submit').trigger('click')
    await flushPromises()

    expect(api.filters.create).toHaveBeenCalledWith(expect.objectContaining({ name: '我的筛选', criteria: expect.objectContaining({ search: '表单词' }) }))
    expect((api.filters.create as ReturnType<typeof vi.fn>).mock.calls[0][0].criteria.search).toBe('表单词')
    expect(wrapper.find('.filter-composer-motion').exists()).toBe(false)
    expect(wrapper.get('[aria-label="新建筛选"]').text()).toBe('＋')
    await wrapper.get('[aria-label="新建筛选"]').trigger('click')
    expect(wrapper.get('.filter-name-input').element.value).toBe('')
    expect(wrapper.get('[aria-label="筛选关键词"]').element.value).toBe('')
  })

  it('toggles the list composer button state and keeps its draft until creation', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    const closedButton = wrapper.get('[aria-label="新建清单"]')
    expect(closedButton.text()).toBe('＋')
    expect(closedButton.attributes('aria-expanded')).toBe('false')
    expect(closedButton.attributes('aria-controls')).toBe('list-composer-form')
    await closedButton.trigger('click')
    const openButton = wrapper.get('[aria-label="收起新建清单"]')
    expect(openButton.text()).toBe('−')
    expect(openButton.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#list-composer-form').exists()).toBe(true)

    await wrapper.get('#list-composer-form input').setValue('读书清单')
    await wrapper.get('[aria-label="收起新建清单"]').trigger('click')
    expect(wrapper.get('[aria-label="新建清单"]').text()).toBe('＋')
    await wrapper.get('[aria-label="新建清单"]').trigger('click')
    expect(wrapper.get('#list-composer-form input').element.value).toBe('读书清单')

    await wrapper.get('#list-composer-form button').trigger('click')
    await flushPromises()
    expect(api.lists.create).toHaveBeenCalledWith(expect.objectContaining({ name: '读书清单' }))
    expect(wrapper.find('#list-composer-form').exists()).toBe(false)
    expect(wrapper.get('[aria-label="新建清单"]').text()).toBe('＋')
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
    await flushPromises()
    expect(wrapper.find('.detail-drawer').exists()).toBe(true)
    await wrapper.find('.title-input').setValue('改名后的任务')
    await wrapper.findAll('button').find(button => button.text().startsWith('最晚 '))!.trigger('click')
    await wrapper.find('input[type="time"]').setValue('18:00')
    const reminderSelect = wrapper.findAll('[role="combobox"]').find(select => select.attributes('aria-label') === '任务提醒')!
    await reminderSelect.trigger('click')
    const hourOption = wrapper.findAll('[role="option"]').find(option => option.text().includes('提前 1 小时'))!
    await hourOption.trigger('click')
    await wrapper.find('.title-input').trigger('blur')
    await flushPromises()
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
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '＋ 添加标签')!.trigger('click')
    await wrapper.find('[aria-label="搜索或创建标签"]').setValue('新标签')
    await wrapper.findAll('button').find(button => button.text().startsWith('创建并添加'))!.trigger('click')
    await flushPromises()
    expect(api.tags.create).toHaveBeenCalledWith(expect.objectContaining({ name: '新标签' }))
    await wrapper.find('.title-input').trigger('blur')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ tagIds: ['tag-1'] }))
  })

  it('shows the completed view only for completed tasks', async () => {
    const api = createApi([makeTask({ status: 'completed', title: '完成项' }), makeTask({ id: 'task-2', title: '进行中' })])
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    const completedButton = wrapper.findAll('.nav-item').find((button) => button.text().includes('已完成'))
    await completedButton!.trigger('click')
    await flushPromises()
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
    await flushPromises()
    expect(wrapper.text()).toContain('完成项')
    expect(wrapper.text()).not.toContain('进行中')
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('仅看已完成')

    await wrapper.findAll('.saved-filter-row .nav-item')[1].trigger('click')
    await flushPromises()
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

  it('places the subtask composer before notes in the detail drawer', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .task-main').trigger('click')
    await flushPromises()

    const subtasks = wrapper.find('.subtasks').element
    const firstField = wrapper.find('.editor-notes').element
    expect(subtasks.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps notes and subtasks visible without card navigation', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .task-main').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.detail-card')).toHaveLength(0)
    expect(wrapper.findAll('.editor-section h3').map(heading => heading.text())).toEqual(['子任务', '备注'])
    await wrapper.get('[aria-label="展开任务详情"]').trigger('click')
    expect(wrapper.get('.task-editor').classes()).toContain('task-editor-expanded')
  })

  const savedFilter = (overrides: Partial<SavedFilter> = {}): SavedFilter => ({
    id: 'filter-1',
    name: '我的筛选',
    criteria: { status: 'active', listId: null, priorities: ['high'], tagIds: ['tag-1'], due: 'today', search: '关键词' },
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  })

  it('opens the saved-filter row menu and deletes only through its command', async () => {
    const api = createApi([makeTask()], [makeTag()], [savedFilter()])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    const row = wrapper.get('.saved-filter-row')
    expect(row.find('.list-name').text()).toBe('我的筛选')
    await row.get('[aria-label="筛选操作"]').trigger('click')
    const menu = wrapper.get('.filter-menu-root .popup-menu')
    expect(menu.findAll('[role="menuitem"]').map(item => item.text())).toEqual(['编辑筛选', '删除筛选'])
    expect(menu.attributes('role')).toBe('menu')

    await row.get('.nav-item').trigger('click')
    await flushPromises()
    expect(api.filters.remove).not.toHaveBeenCalled()
    expect(row.get('.nav-item').classes()).toContain('active')

    await row.get('[aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '删除筛选')!.trigger('click')
    await flushPromises()
    expect(api.filters.remove).toHaveBeenCalledWith('filter-1')
    expect(wrapper.find('.saved-filter-row').exists()).toBe(false)
    wrapper.unmount()
  })

  it('restores menu focus on escape and prefills every edit field accurately', async () => {
    const tag = makeTag()
    const api = createApi([makeTask()], [tag], [savedFilter()])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    const trigger = wrapper.get('.saved-filter-row [aria-label="筛选操作"]')
    await trigger.trigger('click')
    await wrapper.get('.filter-menu-root [role="menuitem"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('.filter-menu-root .popup-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    expect(dialog.find('h2').text()).toBe('编辑筛选')
    expect((dialog.get('input').element as HTMLInputElement).value).toBe('我的筛选')
    expect(document.activeElement).toBe(dialog.get('input').element)
    expect((dialog.get('[placeholder="关键词"]').element as HTMLInputElement).value).toBe('关键词')
    const rows = dialog.findAll('.filter-field-row')
    expect(rows.map(row => row.find('span').text())).toEqual(['名称', '关键词', '状态', '清单', '重要程度', '标签', '日期'])
    expect(rows[2].find('.select-field__value').text()).toBe('进行中')
    expect(rows[3].find('.select-field__value').text()).toBe('收集箱')
    expect(rows[6].find('.select-field__value').text()).toBe('今天')
    const priorities = rows[4].findAll('label').map(label => ({ text: label.text(), checked: (label.find('input').element as HTMLInputElement).checked }))
    expect(priorities).toEqual([{ text: '高', checked: true }, { text: '中', checked: false }, { text: '低', checked: false }, { text: '未设置', checked: false }])
    const tagBoxes = rows[5].findAll('label').map(label => ({ text: label.text(), checked: (label.find('input').element as HTMLInputElement).checked }))
    expect(tagBoxes).toEqual([{ text: '#工作', checked: true }])

    await dialog.get('.cancel-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(api.filters.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('edits multi-select criteria and refreshes the active filter title and results', async () => {
    const tag = makeTag()
    const other = makeTag({ id: 'tag-2', name: '复盘' })
    const filter = savedFilter({ criteria: { status: 'active', listId: null, priorities: ['high'], tagIds: ['tag-1'], due: 'any', search: '' } })
    const api = createApi([makeTask({ id: 'focus', title: '高优任务', priority: 'high', tags: [tag] }), makeTask({ id: 'low', title: '低优任务', priority: 'low', tags: [other] })], [tag, other], [filter])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.findAll('.saved-filter-row .nav-item')[0].trigger('click')
    await flushPromises()
    expect(wrapper.get('.page-header h1').text()).toBe('我的筛选')
    expect(wrapper.text()).toContain('高优任务')
    expect(wrapper.text()).not.toContain('低优任务')

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    await dialog.get('[placeholder="筛选名称"]').setValue('新筛选')
    const rows = dialog.findAll('.filter-field-row')
    await rows[4].findAll('label').find(label => label.text() === '低')!.find('input').setChecked(true)
    await rows[5].findAll('label').find(label => label.text() === '#复盘')!.find('input').setChecked(true)
    await dialog.get('.save-button').trigger('click')
    await flushPromises()

    expect(api.filters.update).toHaveBeenCalledTimes(1)
    expect(api.filters.update).toHaveBeenCalledWith('filter-1', { name: '新筛选', criteria: { status: 'active', listId: null, priorities: ['high', 'low'], tagIds: ['tag-1', 'tag-2'], due: 'any', search: '' } })
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('新筛选')
    expect(wrapper.get('.page-header h1').text()).toBe('新筛选')
    expect(wrapper.text()).toContain('高优任务')
    expect(wrapper.text()).toContain('低优任务')
    wrapper.unmount()
  })

  it('keeps stale list and tag references while editing other fields and allows removing them', async () => {
    const filter = savedFilter({ criteria: { status: 'active', listId: 'list-gone', tagIds: ['tag-gone'], due: 'any' } })
    const api = createApi([makeTask()], [makeTag({ id: 'tag-1', name: '工作' })], [filter])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    const rows = dialog.findAll('.filter-field-row')
    expect(rows[3].find('.select-field__value').text()).toBe('已不可用')
    const staleTag = rows[5].findAll('label').find(label => label.text() === '已不可用')!
    expect((staleTag.find('input').element as HTMLInputElement).checked).toBe(true)

    await rows[2].find('.select-field__trigger').trigger('click')
    await wrapper.findAll('[role="option"]').find(option => option.text().includes('全部'))!.trigger('click')
    await dialog.get('.save-button').trigger('click')
    await flushPromises()
    const [id, input] = (api.filters.update as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(id).toBe('filter-1')
    expect(input.name).toBeUndefined()
    expect(input.criteria).toEqual({ status: 'all', listId: 'list-gone', tagIds: ['tag-gone'], due: 'any' })

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const reopened = wrapper.get('.filter-edit-dialog')
    const reopenedRows = reopened.findAll('.filter-field-row')
    await reopenedRows[5].findAll('label').find(label => label.text() === '已不可用')!.find('input').setChecked(false)
    await reopenedRows[3].find('.select-field__trigger').trigger('click')
    await wrapper.findAll('[role="option"]').find(option => option.text().includes('任意清单'))!.trigger('click')
    await reopened.get('.save-button').trigger('click')
    await flushPromises()
    const second = (api.filters.update as ReturnType<typeof vi.fn>).mock.calls[1][1]
    expect(second.criteria.listId).toBeUndefined()
    expect(second.criteria.tagIds).toBeUndefined()
    expect(second.criteria.status).toBe('all')
    wrapper.unmount()
  })

  it('blocks empty names and composition enter, and skips saves without real changes', async () => {
    const api = createApi([makeTask()], [], [savedFilter()])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    const nameInput = dialog.get('[placeholder="筛选名称"]')
    await nameInput.setValue('   ')
    await nameInput.trigger('keydown.enter')
    expect(api.filters.update).not.toHaveBeenCalled()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(true)
    expect(wrapper.get('.filter-edit-error').text()).toContain('筛选名称不能为空')

    await nameInput.setValue('我的筛选')
    await nameInput.trigger('compositionstart')
    await nameInput.trigger('keydown.enter')
    expect(api.filters.update).not.toHaveBeenCalled()
    await nameInput.trigger('compositionend')
    await nameInput.trigger('keydown.enter')
    await flushPromises()
    expect(api.filters.update).not.toHaveBeenCalled()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sends only the name for renames and keeps the draft with retry after a failure', async () => {
    const api = createApi([makeTask()], [], [savedFilter()])
    let rejectUpdate: ((reason?: unknown) => void) | undefined
    api.filters.update = vi.fn(() => new Promise((resolve, reject) => { rejectUpdate = reject; resolve(savedFilter({ name: '已改名' })) }))
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    await dialog.get('[placeholder="筛选名称"]').setValue('已改名')
    await dialog.get('.save-button').trigger('click')
    await flushPromises()
    expect(api.filters.update).toHaveBeenCalledWith('filter-1', { name: '已改名' })
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('已改名')

    api.filters.update = vi.fn(() => new Promise((_resolve, reject) => { rejectUpdate = reject }))
    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    await wrapper.get('.filter-edit-dialog [placeholder="筛选名称"]').setValue('失败后重试')
    await wrapper.get('.filter-edit-dialog .save-button').trigger('click')
    await flushPromises()
    rejectUpdate?.(new Error('write failed'))
    await flushPromises()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(true)
    expect(wrapper.get('.filter-edit-error').text()).toContain('保存失败')
    expect((wrapper.get('.filter-edit-dialog [placeholder="筛选名称"]').element as HTMLInputElement).value).toBe('失败后重试')
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('已改名')

    api.filters.update = vi.fn(async () => savedFilter({ name: '失败后重试' }))
    await wrapper.get('.filter-edit-dialog .save-button').trigger('click')
    await flushPromises()
    expect(api.filters.update).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('失败后重试')
    wrapper.unmount()
  })

  it('prevents duplicate filter updates while a save is in flight', async () => {
    const api = createApi([makeTask()], [], [savedFilter()])
    let resolveUpdate: ((filter: SavedFilter) => void) | undefined
    api.filters.update = vi.fn(() => new Promise((resolve) => { resolveUpdate = resolve }))
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    await dialog.get('[placeholder="筛选名称"]').setValue('保存中')
    await dialog.get('.save-button').trigger('click')
    await dialog.get('.save-button').trigger('click')
    await dialog.get('.cancel-button').trigger('click')
    expect(api.filters.update).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(true)

    resolveUpdate?.(savedFilter({ name: '保存中' }))
    await flushPromises()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('保存中')
    wrapper.unmount()
  })

  it('keeps a legacy padded keyword untouched when only the name changes', async () => {
    const filter = savedFilter({ name: '旧名', criteria: { status: 'active', search: ' 会议 ' } })
    const api = createApi([makeTask({ id: 'match', title: ' 会议 纪要' }), makeTask({ id: 'other', title: '项目会议' })], [], [filter])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.findAll('.saved-filter-row .nav-item')[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('会议 纪要')
    expect(wrapper.text()).not.toContain('项目会议')

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.filter-edit-dialog')
    expect((dialog.get('[placeholder="关键词"]').element as HTMLInputElement).value).toBe(' 会议 ')
    await dialog.get('[placeholder="筛选名称"]').setValue('改名后的筛选')
    await dialog.get('.save-button').trigger('click')
    await flushPromises()

    expect(api.filters.update).toHaveBeenCalledTimes(1)
    expect(api.filters.update).toHaveBeenCalledWith('filter-1', { name: '改名后的筛选' })
    expect(wrapper.text()).toContain('会议 纪要')
    expect(wrapper.text()).not.toContain('项目会议')

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    expect((wrapper.get('.filter-edit-dialog [placeholder="关键词"]').element as HTMLInputElement).value).toBe(' 会议 ')
    wrapper.unmount()
  })

  it('blocks the search shortcut while the filter edit dialog is open', async () => {
    const api = createApi([makeTask()], [], [savedFilter()])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    const nameInput = wrapper.get('.filter-edit-dialog [placeholder="筛选名称"]')
    await nameInput.setValue('编辑中的草稿')
    await nameInput.trigger('keydown', { key: 'k', ctrlKey: true })
    await flushPromises()
    expect(wrapper.find('.workspace-search-backdrop').exists()).toBe(false)
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(true)
    expect((wrapper.get('.filter-edit-dialog [placeholder="筛选名称"]').element as HTMLInputElement).value).toBe('编辑中的草稿')

    await wrapper.get('.filter-edit-dialog .cancel-button').trigger('click')
    await flushPromises()
    await wrapper.get('.quick-add input').trigger('keydown', { key: 'k', ctrlKey: true })
    await flushPromises()
    expect(wrapper.find('.workspace-search-backdrop').exists()).toBe(true)
    wrapper.unmount()
  })

  it('skips the update when the edited name only gains spaces', async () => {
    const api = createApi([makeTask()], [], [savedFilter()])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    await wrapper.get('.filter-edit-dialog [placeholder="筛选名称"]').setValue(' 我的筛选 ')
    await wrapper.get('.filter-edit-dialog .save-button').trigger('click')
    await flushPromises()
    expect(api.filters.update).not.toHaveBeenCalled()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect(wrapper.find('.saved-filter-row .list-name').text()).toBe('我的筛选')
    wrapper.unmount()
  })

  it('skips the update when the keyword only contains spaces over an empty search', async () => {
    const api = createApi([makeTask()], [], [savedFilter({ criteria: { status: 'active' } })])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    await wrapper.get('.filter-edit-dialog [placeholder="关键词"]').setValue('   ')
    await wrapper.get('.filter-edit-dialog .save-button').trigger('click')
    await flushPromises()
    expect(api.filters.update).not.toHaveBeenCalled()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    wrapper.unmount()
  })

  it('skips the update when spaces are typed over an explicit empty search', async () => {
    const api = createApi([makeTask()], [], [savedFilter({ criteria: { status: 'active', search: '' } })])
    window.todoApi = api
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.saved-filter-row [aria-label="筛选操作"]').trigger('click')
    await wrapper.findAll('.filter-menu-root [role="menuitem"]').find(item => item.text() === '编辑筛选')!.trigger('click')
    await flushPromises()
    await wrapper.get('.filter-edit-dialog [placeholder="关键词"]').setValue('   ')
    await wrapper.get('.filter-edit-dialog .save-button').trigger('click')
    await flushPromises()
    expect(api.filters.update).not.toHaveBeenCalled()
    expect(wrapper.find('.filter-edit-dialog').exists()).toBe(false)
    expect((await api.filters.list())[0].criteria.search).toBe('')
    wrapper.unmount()
  })
})
