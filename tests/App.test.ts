// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import type { Task, TaskList, TodoApi } from '../src/shared/contracts'

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: '测试任务',
  listId: null,
  dueDate: new Date().toISOString().slice(0, 10),
  priority: 'none',
  notes: '',
  status: 'active',
  sortOrder: 0,
  parentTaskId: null,
  recurrenceRuleId: null,
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function createApi(seed: Task[] = [makeTask()]): TodoApi {
  const tasks = [...seed]
  return {
    tasks: {
      list: vi.fn(async () => tasks.map((task) => ({ ...task }))),
      create: vi.fn(async (input) => {
        const task = makeTask({ id: `task-${tasks.length + 1}`, ...input, priority: input.priority ?? 'none', notes: input.notes ?? '' })
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
    },
    lists: {
      list: vi.fn(async () => [list]),
      create: vi.fn(async () => list),
      update: vi.fn(async () => list),
      remove: vi.fn(async () => undefined),
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

  it('toggles completion through the checkbox and reports success', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row .check').trigger('click')
    expect(api.tasks.complete).toHaveBeenCalledWith('task-1')
    expect(wrapper.text()).toContain('已完成')
  })

  it('opens the detail drawer and saves edited fields', async () => {
    const api = createApi()
    window.todoApi = api
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.find('.task-row').trigger('click')
    expect(wrapper.find('.detail-drawer').exists()).toBe(true)
    await wrapper.find('.title-input').setValue('改名后的任务')
    await wrapper.find('.save-button').trigger('click')
    expect(api.tasks.update).toHaveBeenCalledWith('task-1', expect.objectContaining({ title: '改名后的任务' }))
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
})
