<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { Task } from '../../shared/contracts'
const title = defineModel<string>({ required: true })
const props = defineProps<{ tasks: Task[]; busy: boolean; editingId: string | null; editingTitle: string; editingBusy: boolean; editingError: string; editingBlocked: boolean }>()
const emit = defineEmits<{ add: []; toggle: [task: Task]; edit: [task: Task]; openDetail: [task: Task]; 'update:editingTitle': [value: string]; save: []; cancel: []; retry: [] }>()
const input = ref<HTMLInputElement>()
const editInput = ref<HTMLInputElement>()
function bindEditInput(el: unknown) { if (el) editInput.value = el as HTMLInputElement }
watch(() => props.busy, async (busy, previous) => { if (!busy && previous) { await nextTick(); input.value?.focus() } })
watch(() => props.editingId, async (editing, previous) => { if (editing && editing !== previous) { await nextTick(); editInput.value?.focus() } })
function inputTitle(event: Event) { emit('update:editingTitle', (event.target as HTMLInputElement).value) }
</script>
<template>
  <section class="editor-section subtasks">
    <div class="editor-section-heading"><h3>子任务</h3><small v-if="tasks.length">{{ tasks.filter(task => task.status === 'completed').length }} / {{ tasks.length }} 已完成</small></div>
    <TransitionGroup name="subtask" tag="div" class="subtask-items"><div v-for="task in tasks" :key="task.id" class="subtask-row"><button class="check mini" :class="{ checked: task.status === 'completed' }" :aria-label="task.status === 'completed' ? '恢复子任务' : '完成子任务'" @click="emit('toggle', task)">{{ task.status === 'completed' ? '✓' : '' }}</button><template v-if="editingId === task.id"><div class="subtask-edit"><input :ref="bindEditInput" class="subtask-edit-input" :value="editingTitle" aria-label="编辑子任务标题" placeholder="子任务标题" @input="inputTitle" @keydown.enter="!$event.isComposing && emit('save')" @keydown.esc="emit('cancel')" /><button class="subtask-edit-action" :disabled="editingBusy || !editingTitle.trim()" @click="emit('save')">保存</button><button class="subtask-edit-action" :disabled="editingBusy" @click="emit('cancel')">取消</button><p v-if="editingBlocked" class="subtask-edit-notice" role="status"><span>该任务还有其他未保存的修改</span><button class="subtask-edit-action" @click="emit('openDetail', task)">打开任务详情</button></p><p v-if="editingError" class="subtask-edit-error" role="alert"><span>{{ editingError }}</span><button class="subtask-edit-action" @click="editingError.includes('已变化') ? emit('retry') : emit('save')">{{ editingError.includes('已变化') ? '重新核对并仅保存标题' : '重试' }}</button></p></div></template><template v-else><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span><button class="subtask-edit-action subtask-edit-trigger" :aria-label="`编辑子任务 ${task.title}`" @click="emit('edit', task)">编辑</button></template></div></TransitionGroup>
    <div class="subtask-composer"><input ref="input" v-model="title" :disabled="busy" aria-label="子任务标题" placeholder="把任务拆成可以完成的小步骤…" @keydown.enter="!$event.isComposing && emit('add')" /><button :disabled="busy || !title.trim()" aria-label="添加子任务" @click="emit('add')">＋ 添加</button></div>
  </section>
</template>
<style scoped>
.subtasks { margin: 0 0 28px; padding: 0; border: 0; }
.editor-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
h3 { margin: 0 0 12px; color: var(--text-secondary); font-size: 14px; font-weight: 600; }
small { color: var(--muted); font-size: 12px; }
.subtask-row { padding: 9px 0; height: auto; min-height: 40px; }
.subtask-row > span { overflow-wrap: anywhere; }
.subtask-edit { display: flex; flex: 1; min-width: 0; flex-wrap: wrap; align-items: center; gap: 8px; }
.subtask-edit-input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: transparent; font-size: 13px; }
.subtask-edit-input:focus-visible { box-shadow: none; }
.subtask-edit-action { flex: none; width: auto; height: auto; white-space: nowrap; font-size: 12px; color: var(--accent); }
.subtask-edit-trigger { margin-left: auto; }
.subtask-edit-error { display: flex; flex: 1 0 100%; min-width: 0; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; color: var(--danger, #d45757); font-size: 12px; overflow-wrap: anywhere; }
.subtask-edit-notice { display: flex; flex: 1 0 100%; min-width: 0; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.subtask-composer { display: flex; margin: 8px 0 0; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; }
.subtask-composer input { width: 100%; min-width: 0; height: 40px; background: transparent; border: 0; font-size: 13px; }
.subtask-composer button { flex: none; width: auto; height: auto; white-space: nowrap; font-size: 12px; color: var(--accent); }
</style>
