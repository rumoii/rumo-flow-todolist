// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import QuickCapture from '../src/QuickCapture.vue'
import type { TodoApi } from '../src/shared/contracts'

function createApi(overrides: Partial<TodoApi> = {}): TodoApi {
  return {
    tasks: { list: vi.fn(async () => []), create: vi.fn(async () => undefined), update: vi.fn(), complete: vi.fn(), restore: vi.fn(), remove: vi.fn(), restoreRemoved: vi.fn(), reorder: vi.fn() },
    lists: { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
    tags: { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    filters: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    settings: { get: vi.fn(async () => ({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' })), update: vi.fn(), onChanged: vi.fn(() => () => undefined) },
    desktop: { status: vi.fn(), openQuickCapture: vi.fn(), onFocusQuickAdd: vi.fn() },
    backup: { export: vi.fn(), import: vi.fn() },
    ...overrides,
  } as unknown as TodoApi
}

describe('QuickCapture', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete window.todoApi
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.density
  })

  it('loads the saved theme, reacts to updates and releases its listener', async () => {
    let changeTheme: ((settings: Awaited<ReturnType<TodoApi['settings']['get']>>) => void) | undefined
    const removeListener = vi.fn()
    const api = createApi()
    api.settings.get = vi.fn(async () => ({ theme: 'dark', density: 'compact', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }))
    api.settings.onChanged = vi.fn((callback) => { changeTheme = callback; return removeListener })
    window.todoApi = api

    const wrapper = mount(QuickCapture)
    await flushPromises()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.density).toBe('compact')

    changeTheme?.({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' })
    expect(document.documentElement.dataset.theme).toBe('light')
    wrapper.unmount()
    expect(removeListener).toHaveBeenCalledOnce()
  })

  it('renders the branded capture card without page overflow', async () => {
    window.todoApi = createApi()
    const wrapper = mount(QuickCapture)
    await flushPromises()
    expect(wrapper.find('.capture-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('快速捕获')
    expect(wrapper.text()).toContain('把想法先记下来')
    expect(wrapper.text()).toContain('标签')
    expect(wrapper.text()).toContain('优先级')
    expect(wrapper.text()).toContain('日期')
    expect(wrapper.text()).toContain('清单')
  })

  it('shows success feedback and closes after saving', async () => {
    vi.useFakeTimers()
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    const create = vi.fn(async () => undefined)
    window.todoApi = createApi({ tasks: { list: vi.fn(async () => []), create, update: vi.fn(), complete: vi.fn(), restore: vi.fn(), remove: vi.fn(), restoreRemoved: vi.fn(), reorder: vi.fn() } })
    const wrapper = mount(QuickCapture)
    await flushPromises()
    await wrapper.get('input').setValue('整理会议纪要')
    await wrapper.get('input').trigger('keydown.enter')
    await flushPromises()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: '整理会议纪要', tagIds: [] }))
    expect(wrapper.text()).toContain('已加入收集箱')
    vi.advanceTimersByTime(720)
    expect(close).toHaveBeenCalledOnce()
  })

  it('keeps the window open when saving fails', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    const create = vi.fn(async () => { throw new Error('write failed') })
    window.todoApi = createApi({ tasks: { list: vi.fn(async () => []), create, update: vi.fn(), complete: vi.fn(), restore: vi.fn(), remove: vi.fn(), restoreRemoved: vi.fn(), reorder: vi.fn() } })
    const wrapper = mount(QuickCapture)
    await flushPromises()
    await wrapper.get('input').setValue('无法保存的任务')
    await wrapper.get('input').trigger('keydown.enter')
    await flushPromises()
    expect(wrapper.text()).toContain('保存失败，请稍后重试')
    expect(close).not.toHaveBeenCalled()
  })
})
