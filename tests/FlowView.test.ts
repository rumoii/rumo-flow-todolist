// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { draftCoordinatorKey, createDraftCoordinator } from '../src/composables/draft-coordinator'
import { navigationKey } from '../src/features/workspace/navigation'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FlowView from '../src/components/FlowView.vue'
import type { DailyReview, FlowDay, TodoApi, VideoReflection } from '../src/shared/contracts'

const date = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
const review = (): DailyReview => ({ date: date(), videoLimit: 3, didWell: '', didNotWell: '', reflection: '', inputType: 'none', inputVideoId: null, inputText: '', outputText: '', tomorrowExpectation: '', savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })

function createFlowApi(seed: VideoReflection[] = []) {
  const day: FlowDay = { review: review(), videos: [...seed] }
  const api = {
    flow: {
      actionLinks: vi.fn(async () => []),
      taskFacts: vi.fn(async () => ({ completed: [], pending: [] })),
      getDay: vi.fn(async () => structuredClone(day)),
      createVideo: vi.fn(async (input) => {
        const video: VideoReflection = { id: `video-${day.videos.length + 1}`, date: input.date, title: input.title ?? '', sourceUrl: input.sourceUrl, sourcePlatform: '抖音', author: input.author ?? '', thought: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        day.videos.push(video); return structuredClone(video)
      }),
      updateVideo: vi.fn(async (id, input) => { const video = day.videos.find((item) => item.id === id)!; Object.assign(video, input); return structuredClone(video) }),
      removeVideo: vi.fn(async (id) => { day.videos = day.videos.filter((item) => item.id !== id) }),
      saveReview: vi.fn(async (input) => { Object.assign(day.review, input, { savedAt: new Date().toISOString() }); return structuredClone(day.review) }),
      month: vi.fn(async () => []),
      summary: vi.fn(async () => ({ from: date(), to: date(), reviewedDays: 0, videoCount: day.videos.length, overLimitDays: 0, pendingThoughts: day.videos.filter((video) => !video.thought).length })),
    },
    tasks: { list: vi.fn(async () => []) },
    desktop: { onDataChanged: vi.fn(() => () => undefined), openExternal: vi.fn(async () => undefined) },
  } as unknown as TodoApi
  return { api, day }
}

describe('FlowView', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete (window as { todoApi?: TodoApi }).todoApi })

  it('stashes a link before opening it and saves details after watching', async () => {
    const { api } = createFlowApi()
    Object.defineProperty(window, 'todoApi', { configurable: true, value: api })
    const wrapper = mount(FlowView, { global: { provide: { [draftCoordinatorKey as symbol]: createDraftCoordinator(api), [navigationKey as symbol]: { flowTarget: ref(null), openTask: vi.fn(), openFlow: vi.fn() } } }, props: { todayCompletedCount: 2, todayPendingCount: 1 } })
    await flushPromises()

    await wrapper.find('.video-composer input').setValue('https://www.douyin.com/video/1')
    await wrapper.findAll('button').find((button) => button.text() === '暂存并打开')!.trigger('click')
    await flushPromises()

    expect(api.flow.createVideo).toHaveBeenCalledWith({ date: date(), sourceUrl: 'https://www.douyin.com/video/1' })
    expect(api.desktop.openExternal).toHaveBeenCalledWith('https://www.douyin.com/video/1')
    expect(wrapper.text()).toContain('待补充标题')
    expect(wrapper.text()).toContain('待补思考')

    await wrapper.find('.video-entry input').setValue('关于注意力的视频')
    await wrapper.find('.video-entry textarea').setValue('我会先问自己为什么要打开这条视频。')
    await wrapper.findAll('button').find((button) => button.text() === '保存记录')!.trigger('click')
    await flushPromises()
    expect(api.flow.updateVideo).toHaveBeenCalledWith('video-1', expect.objectContaining({ thought: '我会先问自己为什么要打开这条视频。' }))
    wrapper.unmount()
  })

  it('warns at the quota and treats saving an empty review as completion', async () => {
    const videos = Array.from({ length: 3 }, (_, index): VideoReflection => ({ id: `video-${index}`, date: date(), title: `视频 ${index}`, sourceUrl: `https://example.com/${index}`, sourcePlatform: 'example.com', author: '', thought: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
    const { api } = createFlowApi(videos)
    Object.defineProperty(window, 'todoApi', { configurable: true, value: api })
    const wrapper = mount(FlowView, { global: { provide: { [draftCoordinatorKey as symbol]: createDraftCoordinator(api), [navigationKey as symbol]: { flowTarget: ref(null), openTask: vi.fn(), openFlow: vi.fn() } } }, props: { todayCompletedCount: 0, todayPendingCount: 0 } })
    await flushPromises()

    await wrapper.find('.video-composer input').setValue('https://example.com/4')
    await wrapper.findAll('button').find((button) => button.text() === '暂存并打开')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.flow-confirm-dialog').text()).toContain('今天已达到 3/3')
    await wrapper.find('.flow-confirm-dialog .delete-button').trigger('click')
    await flushPromises()
    expect(api.flow.createVideo).toHaveBeenCalled()

    await wrapper.findAll('button').find((button) => button.text().includes('每日复盘'))!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '保存今日复盘')!.trigger('click')
    await flushPromises()
    expect(api.flow.saveReview).toHaveBeenCalledWith(expect.objectContaining({ inputType: 'none', inputVideoId: null }))
    expect(wrapper.text()).toContain('已保存')
    wrapper.unmount()
  })

  it('keeps a persisted video when opening the external source fails', async () => {
    const { api } = createFlowApi()
    api.desktop.openExternal = vi.fn(async () => { throw new Error('browser unavailable') })
    Object.defineProperty(window, 'todoApi', { configurable: true, value: api })
    const wrapper = mount(FlowView, { global: { provide: { [draftCoordinatorKey as symbol]: createDraftCoordinator(api), [navigationKey as symbol]: { flowTarget: ref(null), openTask: vi.fn(), openFlow: vi.fn() } } }, props: { todayCompletedCount: 0, todayPendingCount: 0 } })
    await flushPromises()

    await wrapper.find('.video-composer input').setValue('https://example.com/video')
    await wrapper.findAll('button').find((button) => button.text() === '暂存并打开')!.trigger('click')
    await flushPromises()

    expect(api.flow.createVideo).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('链接已暂存，但来源页面未能打开')
    expect(wrapper.text()).toContain('待补充标题')
    wrapper.unmount()
  })

  it('explains improvements and expands review questions without losing inputs or saving', async () => {
    const { api } = createFlowApi()
    Object.defineProperty(window, 'todoApi', { configurable: true, value: api })
    const wrapper = mount(FlowView, { global: { provide: { [draftCoordinatorKey as symbol]: createDraftCoordinator(api), [navigationKey as symbol]: { flowTarget: ref(null), openTask: vi.fn(), openFlow: vi.fn() } } }, props: { todayCompletedCount: 0, todayPendingCount: 0 }, attachTo: document.body })
    await flushPromises()
    await wrapper.find('#flow-tab-review').trigger('click')
    await flushPromises()
    const toggle = wrapper.get('.review-toggle')
    const questions = wrapper.get('#flow-review-questions')
    const labels = () => questions.findAll('label').filter(label => label.isVisible()).map(label => label.find('span').text())
    const reflection = wrapper.get('[placeholder="写下一件不够满意的事，以及下次可以尝试的做法。"]')
    expect(toggle.attributes('type')).toBe('button')
    expect(toggle.attributes('aria-controls')).toBe('flow-review-questions')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toBe('展开完整复盘（6 问）')
    expect(labels()).toEqual(['1 · 今天做好了什么？', '2 · 今天有什么可以改进？下次可以怎么做？', '3 · 明天有什么期待？准备从哪一步开始？'])
    await reflection.setValue('下次先完成一件事再切换')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.text()).toBe('收起为简版复盘（3 问）')
    expect(labels()).toHaveLength(6)
    expect(labels().map(label => label.slice(0, 1))).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(labels()[2]).toBe('3 · 今天有什么可以改进？下次可以怎么做？')
    const hiddenQuestion = wrapper.get('[placeholder="如实写下，不责备自己。"]')
    await hiddenQuestion.setValue('切换任务太频繁')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(labels()).toHaveLength(3)
    expect(hiddenQuestion.isVisible()).toBe(false)
    await toggle.trigger('click')
    expect((hiddenQuestion.element as HTMLTextAreaElement).value).toBe('切换任务太频繁')
    expect((reflection.element as HTMLTextAreaElement).value).toBe('下次先完成一件事再切换')
    expect(api.flow.saveReview).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('switches tabs with the keyboard and keeps an unfinished review draft', async () => {
    const { api } = createFlowApi()
    Object.defineProperty(window, 'todoApi', { configurable: true, value: api })
    const wrapper = mount(FlowView, { global: { provide: { [draftCoordinatorKey as symbol]: createDraftCoordinator(api), [navigationKey as symbol]: { flowTarget: ref(null), openTask: vi.fn(), openFlow: vi.fn() } } }, props: { todayCompletedCount: 0, todayPendingCount: 0 }, attachTo: document.body })
    await flushPromises()

    const inputTab = wrapper.find('#flow-tab-input')
    expect(inputTab.attributes('aria-selected')).toBe('true')
    await inputTab.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(wrapper.find('#flow-tab-review').attributes('aria-selected')).toBe('true')
    await wrapper.find('[placeholder="哪件事值得肯定？"]').setValue('没有保存的复盘草稿')
    await wrapper.find('#flow-tab-input').trigger('click')
    await wrapper.find('#flow-tab-review').trigger('click')
    expect((wrapper.find('[placeholder="哪件事值得肯定？"]').element as HTMLTextAreaElement).value).toBe('没有保存的复盘草稿')
    wrapper.unmount()
  })
})
