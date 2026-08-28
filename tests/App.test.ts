// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import type { Tag, Task, TaskList, TodoApi } from '../src/shared/contracts'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
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

function createApi(seed: Task[] = [makeTask()], seedTags: Tag[] = []): TodoApi {
  const tasks = [...seed]
  const tags = [...seedTags]
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
      restore: vi.fn(async (id) => {
        const task = tasks.find((item) => item.id === id)
        if (task) task.status = 'active'
      }),
      remove: vi.fn(async (id) => {
        const index = tasks.findIndex((item) => item.id === id)
        if (index >= 0) tasks.splice(index, 1)
      }),
      reorder: vi.fn(async () => undefined),
    },
    lists: {
      list: vi.fn(async () => [list]),
      create: vi.fn(async () => list),
      update: vi.fn(async () => list),
      remove: vi.fn(async () => undefined),
      reorder: vi.fn(async () => undefined),
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
    backup: {
      export: vi.fn(),
      import: vi.fn(),
    },
  } as unknown as TodoApi
}

describe('App critical interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
    await wrapper.find('.save-button').trigger('click')
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ title: '改名后的任务' }))
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
    await wrapper.find('.tag-search-row input').setValue('新标签')
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

  it('sets task priority and pin state from the task menu', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.task-row .icon-button').trigger('click')
    const pinButton = wrapper.findAll('.task-popup button').find((button) => button.text().includes('置顶任务'))
    await pinButton!.trigger('click')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', { isPinned: true })
    expect(wrapper.text()).toContain('置顶')

    await wrapper.find('.task-row .icon-button').trigger('click')
    const priorityButton = wrapper.findAll('.task-popup button').find((button) => button.text().includes('P1'))
    await priorityButton!.trigger('click')
    await flushPromises()
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', { priority: 'high' })
    expect(wrapper.text()).toContain('P1')
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
    expect(api.lists.update).toHaveBeenCalledWith('list-1', { isPinned: true })

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
    const firstField = wrapper.find('.field').element
    expect(subtasks.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
