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
  <button v-if="task.status === 'active' && !task.parentTaskId && !task.deletedAt" class="task-plan-button" :aria-label="`安排任务 ${task.title}：${planLabel(task.plan)}`" aria-haspopup="dialog" :aria-expanded="arrangement.state.task?.id === task.id" :disabled="arrangement.state.busy || batch?.active.value" @click.stop="arrangement.open(task, $event)">▦ {{ planLabel(task.plan) }} <span aria-hidden="true">⌄</span></button>
  <span v-else>▦ {{ planLabel(task.plan) }}</span>
</template>

<style scoped>
.task-plan-button { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-secondary); font: inherit; text-align: left; white-space: normal; }
.task-plan-button:hover, .task-plan-button:focus-visible { border-color: #856af9; color: #856af9; background: var(--accent-soft); }
</style>
