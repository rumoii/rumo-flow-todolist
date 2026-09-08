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
    <label class="plan-kind"><span>安排方式</span><SelectField v-model="kind" aria-label="安排方式" :options="[{ value: '', label: '未安排' }, { value: 'month', label: '按月安排' }, { value: 'week', label: '按周安排' }, { value: 'day', label: '按日安排' }]" /></label>
    <input v-if="model" type="date" aria-label="计划日期" :value="model.start" required @change="changeDate" />
  </div>
</template>
<style scoped>
.plan-kind { display: flex; flex-direction: column; gap: 6px; min-width: 130px; }
.plan-kind > span { color: var(--text-secondary); font-size: 11px; }
.plan-field { align-items: flex-end; }
</style>
