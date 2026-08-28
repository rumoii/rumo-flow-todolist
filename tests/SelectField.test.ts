// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SelectField from '../src/components/SelectField.vue'

const options = [
  { value: null, label: '不提醒' },
  { value: 5, label: '提前 5 分钟' },
  { value: 15, label: '提前 15 分钟', disabled: true },
  { value: 60, label: '提前 1 小时' },
]

describe('SelectField', () => {
  it('opens and emits the selected value', async () => {
    const wrapper = mount(SelectField, { props: { modelValue: null, options, ariaLabel: '任务提醒' } })
    await wrapper.get('[role="combobox"]').trigger('click')
    expect(wrapper.get('[role="listbox"]').isVisible()).toBe(true)
    await wrapper.findAll('[role="option"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[5]])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('supports keyboard navigation and skips disabled options', async () => {
    const wrapper = mount(SelectField, { attachTo: document.body, props: { modelValue: 5, options, ariaLabel: '任务提醒' } })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[60]])
    wrapper.unmount()
  })

  it('closes with Escape without changing the value', async () => {
    const wrapper = mount(SelectField, { attachTo: document.body, props: { modelValue: null, options, ariaLabel: '任务提醒' } })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('click')
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes when clicking outside', async () => {
    const wrapper = mount(SelectField, { attachTo: document.body, props: { modelValue: null, options, ariaLabel: '任务提醒' } })
    await wrapper.get('[role="combobox"]').trigger('click')
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
