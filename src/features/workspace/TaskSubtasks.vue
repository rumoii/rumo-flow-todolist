<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { Task } from '../../shared/contracts'
const title = defineModel<string>({ required: true })
const props = defineProps<{ tasks: Task[]; busy: boolean }>()
const emit = defineEmits<{ add: []; toggle: [task: Task] }>()
const input = ref<HTMLInputElement>()
watch(() => props.busy, async (busy, previous) => { if (!busy && previous) { await nextTick(); input.value?.focus() } })
</script>
<template>
  <section class="editor-section subtasks">
    <div class="editor-section-heading"><h3>子任务</h3><small v-if="tasks.length">{{ tasks.filter(task => task.status === 'completed').length }} / {{ tasks.length }} 已完成</small></div>
    <TransitionGroup name="subtask" tag="div" class="subtask-items"><div v-for="task in tasks" :key="task.id" class="subtask-row"><button class="check mini" :class="{ checked: task.status === 'completed' }" :aria-label="task.status === 'completed' ? '恢复子任务' : '完成子任务'" @click="emit('toggle', task)">{{ task.status === 'completed' ? '✓' : '' }}</button><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span></div></TransitionGroup>
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
.subtask-composer { display: flex; margin: 8px 0 0; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; }
.subtask-composer input { width: 100%; min-width: 0; height: 40px; background: transparent; border: 0; font-size: 13px; }
.subtask-composer button { flex: none; width: auto; height: auto; white-space: nowrap; font-size: 12px; color: var(--accent); }
</style>
