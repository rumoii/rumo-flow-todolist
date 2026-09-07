<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Task, TaskBatchAction, TaskPlan } from '../../shared/contracts'
import { useWorkspaceContext } from './context'
import PlanField from './PlanField.vue'
import SelectField from '../../components/SelectField.vue'
const props = defineProps<{ tasks: Task[] }>()
const { lists, tags, drafts, loadData } = useWorkspaceContext()
const selected = ref<string[]>([])
const operation = ref('complete')
const plan = ref<TaskPlan | null>(null)
const date = ref('')
const list = ref('')
const tagIds = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const confirm = ref(false)
const expanded = ref(false)
watch(selected, () => { confirm.value = false }, { deep: true })
watch(() => props.tasks.map(task => task.id), ids => { selected.value = selected.value.filter(id => ids.includes(id)) })
async function apply() {
  if (busy.value || !selected.value.length) return
  if (operation.value === 'remove' && !confirm.value) { confirm.value = true; return }
  busy.value = true; error.value = ''
  try {
    await drafts.flush()
    const action: TaskBatchAction = operation.value === 'plan' ? { kind: 'plan', plan: plan.value ? { ...plan.value } : null } : operation.value === 'deadline' ? { kind: 'deadline', date: date.value || null } : operation.value === 'move' ? { kind: 'move', listId: list.value || null } : operation.value === 'tags' ? { kind: 'tags', tagIds: [...tagIds.value] } : { kind: operation.value === 'remove' ? 'remove' : 'complete' }
    await window.todoApi.tasks.batch([...selected.value], action)
    selected.value = []; confirm.value = false; await loadData()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '批量操作失败' }
  finally { busy.value = false }
}
</script>
<template>
  <details v-if="tasks.length" :inert="busy" class="planning-panel batch-panel" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
    <summary>批量管理 · {{ selected.length }} 项已选</summary>
    <div class="planning-controls">
      <button @click="selected = selected.length === tasks.length ? [] : tasks.map(task => task.id)">全选 / 取消</button>
      <SelectField v-model="operation" aria-label="批量操作" :options="[{ value: 'complete', label: '完成' }, { value: 'move', label: '移动清单' }, { value: 'tags', label: '添加标签' }, { value: 'plan', label: '调整计划' }, { value: 'deadline', label: '调整截止日期' }, { value: 'remove', label: '移入回收站' }]" @update:model-value="confirm = false" />
      <PlanField v-if="operation === 'plan'" v-model="plan" />
      <input v-if="operation === 'deadline'" v-model="date" type="date" aria-label="批量截止日期" />
      <SelectField v-if="operation === 'move'" v-model="list" aria-label="批量清单" :options="[{ value: '', label: '收集箱' }, ...lists.map(item => ({ value: item.id, label: item.name }))]" />
      <template v-if="operation === 'tags'"><label v-for="tag in tags" :key="tag.id"><input v-model="tagIds" type="checkbox" :value="tag.id" />{{ tag.name }}</label></template>
      <button :disabled="busy || !selected.length" @click="apply">{{ confirm ? '确认移入回收站' : '应用' }}</button>
      <span v-if="error" role="alert">{{ error }}</span>
    </div>
    <div v-if="expanded" class="batch-choices"><label v-for="task in tasks" :key="task.id"><input v-model="selected" type="checkbox" :value="task.id" />{{ task.title }}</label></div>
  </details>
</template>
