// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import App from '../src/App.vue'

it('opens desktop capture from the flow page without changing the page', async () => {
  const openQuickCapture = vi.fn(async () => undefined)
  window.todoApi = {
    lists: { list: async () => [] }, tasks: { list: async () => [] },
    desktop: { openQuickCapture, status: async () => ({}), onFocusQuickAdd: () => () => {}, onOpenFlow: () => () => {} },
  } as never
  const wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.flow-nav-section button').trigger('click')
  await wrapper.find('.primary-action').trigger('click')
  await flushPromises()
  expect(openQuickCapture).toHaveBeenCalledOnce()
  expect(wrapper.find('h1').text()).toBe('心流')
  wrapper.unmount()
  delete (window as { todoApi?: unknown }).todoApi
})
