<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Task, TaskPriority } from '../../shared/contracts'
import { useWorkspaceContext } from './context'
import { injectBatchSelection } from './useBatchSelection'
const props = defineProps<{ task: Task }>()
const { drafts, openTaskMenuId, toggleTaskMenu, closeMenus, selectTask, setTaskPinned, setTaskPriority, pendingDelete, priorityLabel } = useWorkspaceContext()
const batch = injectBatchSelection()
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const priorities = ref(false)
const position = ref({ left: '0px', top: '0px', maxHeight: '320px' })
const open = computed(() => openTaskMenuId.value === props.task.id)
const choices: TaskPriority[] = ['high', 'medium', 'low', 'none']
function place() {
  if (!open.value || !trigger.value || !menu.value) return
  const rect = trigger.value.getBoundingClientRect()
  const height = Math.min(menu.value.scrollHeight, window.innerHeight - 56)
  const top = rect.bottom + 6 + height <= window.innerHeight - 12 ? rect.bottom + 6 : Math.max(44, rect.top - height - 6)
  position.value = { left: `${Math.max(12, Math.min(rect.right - 192, window.innerWidth - 204))}px`, top: `${top}px`, maxHeight: `${window.innerHeight - top - 12}px` }
}
async function focusFirst() { await nextTick(); place(); menu.value?.querySelector<HTMLButtonElement>('button')?.focus() }
watch(open, value => { priorities.value = false; if (value) void focusFirst() })
async function showPriorities(value: boolean) { priorities.value = value; await focusFirst() }
async function close() { closeMenus(); await nextTick(); trigger.value?.focus() }
async function choose(priority: TaskPriority) { await setTaskPriority(props.task, priority); await close() }
async function pin() { await setTaskPinned(props.task, !props.task.isPinned); await close() }
function details() { trigger.value?.focus(); closeMenus(); void selectTask(props.task) }
function remove() { trigger.value?.focus(); closeMenus(); pendingDelete.value = props.task }
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (priorities.value) void showPriorities(false); else void close(); return }
  if (event.key === 'Tab') { closeMenus(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[index]?.focus()
}
function outside(event: PointerEvent) { if (open.value && !root.value?.contains(event.target as Node) && !menu.value?.contains(event.target as Node)) closeMenus() }
onMounted(() => { window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('pointerdown', outside) })
onBeforeUnmount(() => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', outside) })
</script>
<template>
  <div v-if="!batch?.active.value" ref="root" class="row-actions task-menu-root" @click.stop @pointerdown.stop @dragstart.prevent.stop>
    <button ref="trigger" class="icon-button" aria-label="任务操作" aria-haspopup="menu" :aria-expanded="open" @click="toggleTaskMenu(task.id)" @keydown.down.prevent="toggleTaskMenu(task.id)">···</button>
    <Teleport to="body">
    <Transition name="task-menu">
      <div v-if="open" ref="menu" class="task-menu-panel" :style="position" :inert="drafts.paused.value || drafts.saving.value" role="menu" aria-label="任务操作菜单" @click.stop @pointerdown.stop @keydown="keyboard">
        <div v-if="!priorities" key="actions" class="task-menu-section">
          <button role="menuitem" @click="details">查看详情</button>
          <button role="menuitem" @click="pin">{{ task.isPinned ? '取消置顶' : '置顶任务' }}</button>
          <button role="menuitem" @click="showPriorities(true)">重要程度 <span>{{ priorityLabel(task.priority) }} ›</span></button>
          <hr />
          <button role="menuitem" class="task-menu-delete" @click="remove">删除任务</button>
        </div>
        <div v-else key="priorities" class="task-menu-section">
          <button role="menuitem" @click="showPriorities(false)">‹ 返回任务操作</button>
          <hr />
          <button v-for="priority in choices" :key="priority" role="menuitemradio" :aria-checked="task.priority === priority" @click="choose(priority)">{{ priorityLabel(priority) }} <span v-if="task.priority === priority">✓</span></button>
        </div>
      </div>
    </Transition>
    </Teleport>
  </div>
</template>
