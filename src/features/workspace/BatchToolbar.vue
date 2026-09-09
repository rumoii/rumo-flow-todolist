<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TaskBatchAction, TaskPlan } from '../../shared/contracts'
import { useWorkspaceContext } from './context'
import PlanField from './PlanField.vue'
import SelectField from '../../components/SelectField.vue'
const props = defineProps<{ count: number; selection: string; available: number; busy: boolean; saved: boolean; error: string }>()
const emit = defineEmits<{ apply: [action: TaskBatchAction]; all: []; clear: []; exit: []; refresh: [] }>()
const { lists, tags } = useWorkspaceContext()
const operation = ref('complete')
const plan = ref<TaskPlan | null>(null)
const date = ref('')
const list = ref('')
const tagIds = ref<string[]>([])
const confirm = ref(false)
const fields = ref<HTMLFieldSetElement>()
watch(() => [props.selection, operation.value], () => { confirm.value = false })
const valid = computed(() => operation.value !== 'tags' || tagIds.value.length > 0)
function apply() {
  if (props.busy || props.saved || !props.count || !valid.value) return
  if (fields.value && ![...fields.value.querySelectorAll('input')].every(input => input.reportValidity())) return
  if (operation.value === 'remove' && !confirm.value) { confirm.value = true; return }
  const action: TaskBatchAction = operation.value === 'plan' ? { kind: 'plan', plan: plan.value ? { ...plan.value } : null } : operation.value === 'deadline' ? { kind: 'deadline', date: date.value || null } : operation.value === 'move' ? { kind: 'move', listId: list.value || null } : operation.value === 'tags' ? { kind: 'tags', tagIds: [...tagIds.value] } : { kind: operation.value === 'remove' ? 'remove' : 'complete' }
  emit('apply', action)
}
</script>
<template>
  <section class="batch-toolbar planning-panel" aria-label="批量操作">
    <div class="planning-controls"><strong role="status">已选 {{ count }} 项</strong><button :disabled="busy || saved || available > 500" @click="emit('all')">选择当前范围</button><button :disabled="busy || saved || !count" @click="emit('clear')">清空</button><button :disabled="busy" @click="emit('exit')">退出选择</button></div>
    <p v-if="available > 500">当前范围超过 500 项，请缩小筛选范围。</p>
    <fieldset ref="fields" class="batch-fields" :disabled="busy || saved" :inert="busy || saved">
      <div class="planning-controls">
        <SelectField v-model="operation" aria-label="批量操作" :options="[{ value: 'complete', label: '完成' }, { value: 'move', label: '移动清单' }, { value: 'tags', label: '添加标签' }, { value: 'plan', label: '调整计划' }, { value: 'deadline', label: '调整截止日期' }, { value: 'remove', label: '移入回收站' }]" />
        <PlanField v-if="operation === 'plan'" v-model="plan" />
        <input v-if="operation === 'deadline'" v-model="date" type="date" aria-label="批量截止日期" />
        <SelectField v-if="operation === 'move'" v-model="list" aria-label="批量清单" :options="[{ value: '', label: '收集箱' }, ...lists.map(item => ({ value: item.id, label: item.name }))]" />
        <div v-if="operation === 'tags'" class="batch-tags"><label v-for="tag in tags" :key="tag.id" :title="tag.name"><input v-model="tagIds" type="checkbox" :value="tag.id" /><span>{{ tag.name }}</span></label><span v-if="!tags.length">请先创建标签</span></div>
        <button :disabled="!count || !valid" @click="apply">{{ confirm ? `确认移入回收站（${count} 项）` : '应用' }}</button>
        <button v-if="confirm" @click="confirm = false">取消删除</button>
      </div>
    </fieldset>
    <p v-if="error" role="alert">{{ error }}</p><button v-if="saved" class="secondary-button" @click="emit('refresh')">重试刷新</button>
  </section>
</template>
