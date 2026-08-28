<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export type SelectValue = string | number | null
export interface SelectOption {
  label: string
  value: SelectValue
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: SelectValue
  options: SelectOption[]
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
}>(), {
  ariaLabel: '选择选项',
  placeholder: '请选择',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  change: [value: SelectValue]
}>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const openUpwards = ref(false)
const activeIndex = ref(-1)
const listboxId = `select-${Math.random().toString(36).slice(2)}`

const selectedIndex = computed(() => props.options.findIndex(option => Object.is(option.value, props.modelValue)))
const selectedOption = computed(() => props.options[selectedIndex.value])
const activeOptionId = computed(() => activeIndex.value >= 0 ? `${listboxId}-option-${activeIndex.value}` : undefined)

function firstEnabledIndex() {
  return props.options.findIndex(option => !option.disabled)
}

function lastEnabledIndex() {
  for (let index = props.options.length - 1; index >= 0; index -= 1) if (!props.options[index].disabled) return index
  return -1
}

function moveActive(direction: 1 | -1) {
  if (!props.options.length) return
  let index = activeIndex.value
  for (let count = 0; count < props.options.length; count += 1) {
    index = (index + direction + props.options.length) % props.options.length
    if (!props.options[index].disabled) {
      activeIndex.value = index
      nextTick(() => document.getElementById(activeOptionId.value || '')?.scrollIntoView?.({ block: 'nearest' }))
      return
    }
  }
}

async function openMenu() {
  if (props.disabled || open.value) return
  activeIndex.value = selectedIndex.value >= 0 && !props.options[selectedIndex.value]?.disabled ? selectedIndex.value : firstEnabledIndex()
  const rect = root.value?.getBoundingClientRect()
  const estimatedHeight = Math.min(248, props.options.length * 38 + 12)
  openUpwards.value = !!rect && window.innerHeight - rect.bottom < estimatedHeight && rect.top > window.innerHeight - rect.bottom
  open.value = true
  await nextTick()
  document.getElementById(activeOptionId.value || '')?.scrollIntoView?.({ block: 'nearest' })
}

function closeMenu(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) nextTick(() => trigger.value?.focus())
}

function toggleMenu() {
  if (open.value) closeMenu()
  else openMenu()
}

function selectOption(option: SelectOption) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeMenu(true)
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) openMenu()
    else moveActive(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Home' || event.key === 'End') {
    if (!open.value) return
    event.preventDefault()
    activeIndex.value = event.key === 'Home' ? firstEnabledIndex() : lastEnabledIndex()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) openMenu()
    else if (activeIndex.value >= 0) selectOption(props.options[activeIndex.value])
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) closeMenu()
}

function onWindowChange() {
  closeMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<template>
  <div ref="root" :class="['select-field', { 'is-open': open, 'is-disabled': disabled, 'opens-up': openUpwards }]">
    <button
      ref="trigger"
      type="button"
      class="select-field__trigger"
      role="combobox"
      :aria-label="ariaLabel"
      :aria-controls="listboxId"
      :aria-expanded="open"
      :aria-activedescendant="open ? activeOptionId : undefined"
      :disabled="disabled"
      @click.stop="toggleMenu"
      @keydown="onKeydown"
    >
      <span :class="['select-field__value', { placeholder: !selectedOption }]">{{ selectedOption?.label ?? placeholder }}</span>
      <span class="select-field__caret" aria-hidden="true">⌄</span>
    </button>
    <Transition name="select-pop">
      <ul v-if="open" :id="listboxId" class="select-field__menu" role="listbox" :aria-label="ariaLabel" @click.stop>
        <li
          v-for="(option, index) in options"
          :id="`${listboxId}-option-${index}`"
          :key="`${String(option.value)}-${index}`"
          :class="['select-field__option', { active: index === activeIndex, selected: Object.is(option.value, modelValue), disabled: option.disabled }]"
          role="option"
          :aria-selected="Object.is(option.value, modelValue)"
          :aria-disabled="option.disabled || undefined"
          @mouseenter="!option.disabled && (activeIndex = index)"
          @mousedown.prevent
          @click="selectOption(option)"
        >
          <span>{{ option.label }}</span>
          <span v-if="Object.is(option.value, modelValue)" class="select-field__check" aria-hidden="true">✓</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>
