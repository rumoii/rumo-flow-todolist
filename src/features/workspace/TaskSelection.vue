<script setup lang="ts">
import type { Task } from '../../shared/contracts'
import { injectBatchSelection } from './useBatchSelection'
defineProps<{ task: Task }>()
const batch = injectBatchSelection()
</script>
<template>
  <input v-if="batch?.active.value" class="task-selection" type="checkbox" :aria-label="`选择任务 ${task.title}`" :checked="batch.chosen.value.has(task.id)" :disabled="batch.busy.value || batch.saved.value || !batch.available.value.some(item => item.id === task.id)" @click.stop @change="batch.toggle(task)" />
</template>
