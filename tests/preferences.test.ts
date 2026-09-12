// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, isProxy, nextTick, reactive } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { usePreferences } from '../src/features/workspace/usePreferences'
import type { AppSettings, TodoApi } from '../src/shared/contracts'
import { titleBarAppearance } from '../electron/window-appearance'

const initial: AppSettings = { automaticUpdateChecks: true, theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }

describe('preference save boundary', () => {
  afterEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.density; delete window.todoApi })
  it('sends only plain fields, blocks overlapping writes and adopts external settings while open', async () => {
    let resolveUpdate: (value: AppSettings) => void = () => undefined
    let listener: (value: AppSettings) => void = () => undefined
    const remove = vi.fn()
    const update = vi.fn((_input: Partial<AppSettings>) => new Promise<AppSettings>(resolve => { resolveUpdate = resolve }))
    window.todoApi = { settings: { update, onChanged: callback => { listener = callback; return remove } }, desktop: { status: async () => ({ globalShortcut: initial.globalShortcut, globalShortcutRegistered: true }) } } as unknown as TodoApi
    let preferences!: ReturnType<typeof usePreferences>
    const wrapper = mount(defineComponent({ setup() { preferences = usePreferences({ loadData: async () => undefined, notify: vi.fn() }); return () => null } }))
    preferences.adoptSettings(initial)
    preferences.settingsOpen.value = true
    const pending = preferences.saveSettings(reactive({ theme: 'dark' as const }), '主题')
    expect(update).toHaveBeenCalledWith({ theme: 'dark' })
    expect(isProxy(update.mock.calls[0][0])).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(await preferences.saveSettings({ density: 'compact' })).toBe(false)
    expect(update).toHaveBeenCalledOnce()
    resolveUpdate({ ...initial, theme: 'dark' })
    expect(await pending).toBe(true)
    listener({ ...initial, theme: 'dark', density: 'compact' })
    await nextTick()
    expect(preferences.settings.value.density).toBe('compact')
    wrapper.unmount()
    expect(remove).toHaveBeenCalledOnce()
    delete window.todoApi
  })

  it('keeps failed business edits out of the next theme save', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const notify = vi.fn()
    const update = vi.fn().mockRejectedValueOnce(new Error('设置无效：视频额度须为 0 至 10 的整数')).mockResolvedValueOnce({ ...initial, theme: 'dark' })
    window.todoApi = { settings: { update }, desktop: { status: async () => ({}) } } as unknown as TodoApi
    let preferences!: ReturnType<typeof usePreferences>
    const wrapper = mount(defineComponent({ setup() { preferences = usePreferences({ loadData: async () => undefined, notify }); return () => null } }))
    preferences.adoptSettings(initial)
    expect(await preferences.saveSettings({ dailyVideoLimit: 11 }, '视频额度')).toBe(false)
    expect(preferences.settings.value.dailyVideoLimit).toBe(3)
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('视频额度须为 0 至 10 的整数'))
    expect(await preferences.saveSettings({ theme: 'dark' }, '主题')).toBe(true)
    expect(update).toHaveBeenLastCalledWith({ theme: 'dark' })
    await flushPromises()
    wrapper.unmount()
    delete window.todoApi
    log.mockRestore()
  })

  it('distinguishes a failed import transaction from a failed refresh after commit', async () => {
    const notify = vi.fn()
    const loadData = vi.fn().mockRejectedValueOnce(new Error('refresh failed'))
    const importBackup = vi.fn().mockResolvedValueOnce({ importedTasks: 2 }).mockRejectedValueOnce(new Error('import failed'))
    window.todoApi = { backup: { import: importBackup } } as unknown as TodoApi
    let preferences!: ReturnType<typeof usePreferences>
    const wrapper = mount(defineComponent({ setup() { preferences = usePreferences({ loadData, notify }); return () => null } }))

    await preferences.importBackup()
    expect(notify).toHaveBeenLastCalledWith('备份已恢复，但界面刷新失败，请重启应用查看最新数据')
    notify.mockClear()
    await preferences.importBackup()
    expect(loadData).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenLastCalledWith('备份恢复失败，现有数据未改变')

    wrapper.unmount()
    delete window.todoApi
  })

  it('uses the same title bar height with contrasting light and dark colors', () => {
    expect(titleBarAppearance('light')).toEqual({ color: '#ffffff', symbolColor: '#514b60', height: 36 })
    expect(titleBarAppearance('dark')).toEqual({ color: '#211f28', symbolColor: '#eeeaf5', height: 36 })
  })
})
