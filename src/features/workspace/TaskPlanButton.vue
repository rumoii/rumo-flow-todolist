<script setup lang="ts">
import type { Task } from '../../shared/contracts'
import { planLabel } from '../../shared/planning'
import { useWorkspaceContext } from './context'
import { injectBatchSelection } from './useBatchSelection'
const batch = injectBatchSelection()
defineProps<{ task: Task }>()
const { arrangement } = useWorkspaceContext()
</script>

<template>
  <button v-if="task.status === 'active' && !task.parentTaskId && !task.deletedAt" class="task-plan-button" :title="planLabel(task.plan)" :aria-label="`安排任务 ${task.title}：${planLabel(task.plan)}`" aria-haspopup="dialog" :aria-expanded="arrangement.state.task?.id === task.id" :disabled="arrangement.state.busy || batch?.active.value" @click.stop="arrangement.open(task, $event)"><span class="task-plan-icon" aria-hidden="true">▦</span><span class="task-plan-label">{{ planLabel(task.plan) }}</span><span class="task-plan-icon" aria-hidden="true">⌄</span></button>
  <span v-else class="task-plan-display" :title="planLabel(task.plan)"><span class="task-plan-icon" aria-hidden="true">▦</span><span class="task-plan-label">{{ planLabel(task.plan) }}</span></span>
</template>

<style scoped>
.task-plan-button, .task-plan-display { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; white-space: nowrap; }
.task-plan-button { padding: 3px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-secondary); font: inherit; text-align: left; }
.task-plan-label { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.task-plan-icon { flex: none; }
.task-plan-button:hover, .task-plan-button:focus-visible { border-color: #856af9; color: #856af9; background: var(--accent-soft); }
</style>
