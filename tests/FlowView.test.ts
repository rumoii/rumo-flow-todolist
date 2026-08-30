// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlowView from '../src/components/FlowView.vue'
import type { DailyReview, FlowDay, TodoApi, VideoReflection } from '../src/shared/contracts'

const date = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
const review = (): DailyReview => ({ date: date(), videoLimit: 3, didWell: '', didNotWell: '', reflection: '', inputType: 'none', inputVideoId: null, inputText: '', outputText: '', tomorrowExpectation: '', savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })

function createFlowApi(seed: VideoReflection[] = []) {
  const day: FlowDay = { review: review(), videos: [...seed] }
  const api = {
    flow: {
      getDay: vi.fn(async () => structuredClone(day)),
      createVideo: vi.fn(async (input) => {
        const video: VideoReflection = { id: `video-${day.videos.length + 1}`, date: input.date, title: input.title, sourceUrl: input.sourceUrl, sourcePlatform: '抖音', author: input.author ?? '', thought: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        day.videos.push(video); return structuredClone(video)
      }),
      updateVideo: vi.fn(async (id, input) => { const video = day.videos.find((item) => item.id === id)!; Object.assign(video, input); return structuredClone(video) }),
      removeVideo: vi.fn(async (id) => { day.videos = day.videos.filter((item) => item.id !== id) }),
      saveReview: vi.fn(async (input) => { Object.assign(day.review, input, { savedAt: new Date().toISOString() }); return structuredClone(day.review) }),
      month: vi.fn(async () => []),
      summary: vi.fn(async () => ({ from: date(), to: date(), reviewedDays: 0, videoCount: day.videos.length, overLimitDays: 0, pendingThoughts: day.videos.filter((video) => !video.thought).length })),
    },
    desktop: { openExternal: vi.fn(async () => undefined) },
  } as unknown as TodoApi
  return { api, day }
}

describe('FlowView', () => {
  beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)) })
  afterEach(() => { vi.unstubAllGlobals(); delete (window as { todoApi?: TodoApi }).todoApi })

  it('registers a video before opening it and saves the later thought', async () => {
    const { api } = createFlowApi()
    Object.defineProperty(window, 'todoApi', { configurable: true, value: api })
    const wrapper = mount(FlowView, { props: { todayCompletedCount: 2, todayPendingCount: 1 } })
    await flushPromises()

    const inputs = wrapper.findAll('.video-composer input')
    await inputs[0].setValue('关于注意力的视频')
    await inputs[1].setValue('https://www.douyin.com/video/1')
    await wrapper.findAll('button').find((button) => button.text() === '登记并打开视频')!.trigger('click')
    await flushPromises()

    expect(api.flow.createVideo).toHaveBeenCalledWith(expect.objectContaining({ title: '关于注意力的视频' }))
    expect(api.desktop.openExternal).toHaveBeenCalledWith('https://www.douyin.com/video/1')
    expect(wrapper.text()).toContain('待补思考')

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
    const wrapper = mount(FlowView, { props: { todayCompletedCount: 0, todayPendingCount: 0 } })
    await flushPromises()

    const inputs = wrapper.findAll('.video-composer input')
    await inputs[0].setValue('第四个视频')
    await inputs[1].setValue('https://example.com/4')
    await wrapper.findAll('button').find((button) => button.text() === '登记并打开视频')!.trigger('click')
    await flushPromises()
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('今天已达到 3/3'))

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
    const wrapper = mount(FlowView, { props: { todayCompletedCount: 0, todayPendingCount: 0 } })
    await flushPromises()

    const inputs = wrapper.findAll('.video-composer input')
    await inputs[0].setValue('已经保存的视频')
    await inputs[1].setValue('https://example.com/video')
    await wrapper.findAll('button').find((button) => button.text() === '登记并打开视频')!.trigger('click')
    await flushPromises()

    expect(api.flow.createVideo).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('视频已登记，但来源链接未能打开')
    expect(wrapper.text()).toContain('已经保存的视频')
    wrapper.unmount()
  })
})
