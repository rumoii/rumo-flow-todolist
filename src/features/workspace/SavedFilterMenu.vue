<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SavedFilter } from '../../shared/contracts'
import { useWorkspaceContext } from './context'
const props = defineProps<{ filter: SavedFilter }>()
const { openFilterMenuId, toggleFilterMenu, closeMenus, openFilterEdit, removeFilter } = useWorkspaceContext()
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const open = computed(() => openFilterMenuId.value === props.filter.id)
async function focusFirst() { await nextTick(); menu.value?.querySelector<HTMLButtonElement>('button')?.focus() }
watch(open, value => { if (value) void focusFirst() })
async function closeMenu() { closeMenus(); await nextTick(); trigger.value?.focus() }
function edit() { trigger.value?.focus(); openFilterEdit(props.filter) }
function remove() { trigger.value?.focus(); closeMenus(); void removeFilter(props.filter) }
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void closeMenu(); return }
  if (event.key === 'Tab') { closeMenus(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[index]?.focus()
}
function outside(event: PointerEvent) { if (open.value && !root.value?.contains(event.target as Node)) closeMenus() }
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <div ref="root" class="filter-menu-root" @click.stop @pointerdown.stop>
    <button ref="trigger" class="list-menu-button" aria-label="筛选操作" aria-haspopup="menu" :aria-expanded="open" @click="toggleFilterMenu(filter.id)" @keydown.down.prevent="toggleFilterMenu(filter.id)">···</button>
    <Transition name="popup">
      <div v-if="open" ref="menu" class="popup-menu list-popup" role="menu" :aria-label="`筛选操作 ${filter.name}`" @click.stop @pointerdown.stop @keydown="keyboard">
        <button role="menuitem" @click="edit">编辑筛选</button>
        <button role="menuitem" class="menu-danger" @click="remove">删除筛选</button>
      </div>
    </Transition>
  </div>
</template>
