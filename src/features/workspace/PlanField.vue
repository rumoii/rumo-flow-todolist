<script setup lang="ts">
import { computed } from 'vue'
import SelectField from '../../components/SelectField.vue'
import { localDay, planFor, type PlanKind, type TaskPlan } from '../../shared/planning'
const model = defineModel<TaskPlan | null>({ required: true })
const kind = computed({ get: () => model.value?.kind ?? '', set: (value: string) => { model.value = value ? planFor(value as PlanKind, model.value?.start ?? localDay()) : null } })
function changeDate(event: Event) {
  const date = (event.target as HTMLInputElement).value
  if (date && model.value) model.value = planFor(model.value.kind, date)
}
</script>
<template>
  <div class="plan-field">
    <SelectField v-model="kind" aria-label="计划精度" :options="[{ value: '', label: '未安排' }, { value: 'month', label: '月计划' }, { value: 'week', label: '周计划' }, { value: 'day', label: '日计划' }]" />
    <input v-if="model" type="date" aria-label="计划日期" :value="model.start" @change="changeDate" />
  </div>
</template>
