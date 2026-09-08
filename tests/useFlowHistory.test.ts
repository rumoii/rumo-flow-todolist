// @vitest-environment jsdom
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { useFlowHistory } from '../src/features/flow/useFlowHistory'
import type { FlowHistoryPage, TodoApi } from '../src/shared/contracts'
afterEach(() => { vi.useRealTimers(); delete (window as { todoApi?: TodoApi }).todoApi })
it('ignores obsolete searches and stops receiving changes after unmount', async () => {
  vi.useFakeTimers()
  let resolveFirst!: (page: FlowHistoryPage) => void
  const unsubscribe = vi.fn()
  const history = vi.fn().mockImplementationOnce(() => new Promise<FlowHistoryPage>(resolve => { resolveFirst = resolve })).mockResolvedValue({ entries: [], nextCursor: null })
  window.todoApi = { flow: { history }, desktop: { onDataChanged: () => unsubscribe } } as unknown as TodoApi
  let state!: ReturnType<typeof useFlowHistory>
  const wrapper = mount(defineComponent({ setup() { state = useFlowHistory(ref(true), ref('2026-09-08')); return () => null } }))
  state.filters.keyword = '新的搜索'
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  resolveFirst({ entries: [{ date: '2026-09-07', excerpt: '旧结果', videoTitles: [], videoLimit: 3, videoCount: 0, pendingThoughtCount: 0, reviewSaved: true, overLimit: false }], nextCursor: null })
  await flushPromises()
  expect(state.entries.value).toEqual([])
  expect(history).toHaveBeenCalledTimes(2)
  wrapper.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
