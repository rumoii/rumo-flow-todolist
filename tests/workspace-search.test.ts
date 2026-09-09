// @vitest-environment jsdom
import { defineComponent, nextTick, provide, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import WorkspaceSearch from '../src/features/workspace/WorkspaceSearch.vue'
import { useWorkspaceSearch } from '../src/features/workspace/useWorkspaceSearch'
import { workspaceKey } from '../src/features/workspace/context'
import { navigationKey } from '../src/features/workspace/navigation'
import type { SearchHit, TodoApi } from '../src/shared/contracts'

afterEach(() => { vi.useRealTimers(); delete (window as { todoApi?: TodoApi }).todoApi })
function setup() {
  const view = ref('today')
  const keyword = ref('原筛选')
  const search = useWorkspaceSearch(view, ref('今天'), keyword)
  const flush = vi.fn(async () => undefined)
  const openTask = vi.fn(async () => undefined)
  const apiSearch = vi.fn(async (_text: string): Promise<SearchHit[]> => [])
  window.todoApi = { tasks: { search: apiSearch } } as unknown as TodoApi
  const wrapper = mount(defineComponent({
    components: { WorkspaceSearch },
    setup() {
      provide(workspaceKey, { workspaceSearch: search, drafts: { flush }, trapDialogFocus: vi.fn() } as unknown as ReturnType<typeof import('../src/features/workspace/useWorkspace').useWorkspace>)
      provide(navigationKey, { flowTarget: ref(null), openTask, openFlow: vi.fn() })
      return {}
    },
    template: '<WorkspaceSearch />',
  }), { attachTo: document.body })
  return { wrapper, search, keyword, view, flush, openTask, apiSearch }
}

it('separates global queries from applied filters and cancellation does not apply edits', async () => {
  const { wrapper, search, keyword } = setup()
  search.globalQuery.value = '全局关键词'
  search.show(true)
  await nextTick()
  await wrapper.get('[aria-label="搜索关键词"]').setValue('新筛选')
  await wrapper.get('[aria-label="关闭搜索"]').trigger('click')
  expect(keyword.value).toBe('原筛选')
  search.show(true)
  await nextTick()
  await wrapper.get('[aria-label="搜索关键词"]').setValue('应用筛选')
  await wrapper.get('form').trigger('submit')
  expect(keyword.value).toBe('应用筛选')
  expect(search.globalQuery.value).toBe('全局关键词')
  expect(search.open.value).toBe(false)
  wrapper.unmount()
})

it('only exposes history filtering in history and retains its keyword across task navigation', async () => {
  const { wrapper, search, keyword, view } = setup()
  search.historyKeyword.value = '历史关键词'
  view.value = 'flow'
  await nextTick()
  expect(keyword.value).toBe('')
  expect(search.currentAvailable.value).toBe(false)
  search.historyVisible.value = true
  expect(search.currentName.value).toBe('心流历史')
  search.currentKeyword.value = '修改历史关键词'
  view.value = 'today'
  await nextTick()
  expect(search.historyKeyword.value).toBe('修改历史关键词')
  view.value = 'trash'
  expect(search.currentAvailable.value).toBe(false)
  wrapper.unmount()
})

it('ignores stale results, exposes retry and invalidates requests on close', async () => {
  vi.useFakeTimers()
  const { wrapper, search, apiSearch } = setup()
  let finish!: (hits: SearchHit[]) => void
  apiSearch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
  search.show()
  search.globalQuery.value = '第一轮'
  await vi.advanceTimersByTimeAsync(300)
  search.globalQuery.value = '第二轮'
  await vi.advanceTimersByTimeAsync(300)
  expect(wrapper.text()).toContain('搜索失败')
  finish([{ kind: 'task', key: 'old', date: null, title: '过期内容', excerpt: '' }])
  await flushPromises()
  expect(wrapper.text()).not.toContain('过期内容')
  await wrapper.get('.text-button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('没有匹配内容')
  expect(apiSearch).toHaveBeenCalledTimes(3)
  search.open.value = false
  await nextTick()
  search.globalQuery.value = '关闭后'
  await vi.advanceTimersByTimeAsync(300)
  expect(apiSearch).toHaveBeenCalledTimes(3)
  wrapper.unmount()
})

it('does not navigate or dismiss search when retaining drafts fails', async () => {
  vi.useFakeTimers()
  const { wrapper, search, apiSearch, flush, openTask } = setup()
  apiSearch.mockResolvedValue([{ kind: 'task', key: 'task', date: null, title: '搜索任务结果', excerpt: '' }])
  flush.mockRejectedValueOnce(new Error('write failed'))
  search.show(); search.globalQuery.value = '任务'
  await vi.advanceTimersByTimeAsync(300)
  await wrapper.get('.unified-search-hit').trigger('click')
  await flushPromises()
  expect(openTask).not.toHaveBeenCalled()
  expect(search.open.value).toBe(true)
  expect(wrapper.text()).toContain('草稿保留失败')
  await wrapper.get('.unified-search-hit').trigger('click')
  await flushPromises()
  expect(openTask).toHaveBeenCalledWith('task')
  expect(search.open.value).toBe(false)
  wrapper.unmount()
})
