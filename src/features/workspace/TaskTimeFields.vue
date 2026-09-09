<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TaskEditorDraft } from '../../shared/drafts'
import SelectField from '../../components/SelectField.vue'
import PlanField from './PlanField.vue'
const draft = defineModel<TaskEditorDraft>({ required: true })
const emit = defineEmits<{ change: [] }>()
const editingDeadline = ref(false)
const reminderAt = computed(() => {
  if (!draft.value.dueDate || !draft.value.dueTime || draft.value.reminderMinutesBefore === null) return ''
  const time = new Date(`${draft.value.dueDate}T${draft.value.dueTime}:00`)
  time.setMinutes(time.getMinutes() - draft.value.reminderMinutesBefore)
  return time.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
})
function clearDeadline() {
  if ((draft.value.dueTime || draft.value.reminderMinutesBefore !== null) && !window.confirm('清除截止日期，也会清除截止时间和到期提醒。确定清除？')) return
  draft.value = { ...draft.value, dueDate: '', dueTime: '', reminderMinutesBefore: null }
  editingDeadline.value = false
  emit('change')
}
function setDate(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value) { clearDeadline(); (event.target as HTMLInputElement).value = draft.value.dueDate; return }
  draft.value.dueDate = value
  emit('change')
}
</script>
<template>
  <section class="task-time" aria-label="安排与重要程度">
    <div class="task-plan-heading"><h3>什么时候做</h3><label><span>重要程度</span><SelectField v-model="draft.priority" aria-label="任务重要程度" :options="[{ value: 'none', label: '未设置' }, { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]" @update:model-value="emit('change')" /></label></div>
    <PlanField v-model="draft.plan" @update:model-value="draft.focusDate = null; emit('change')" />
    <button v-if="draft.plan?.kind === 'day'" class="focus-control" :aria-pressed="draft.focusDate === draft.plan.start" @click="draft.focusDate = draft.focusDate === draft.plan.start ? null : draft.plan.start; emit('change')">{{ draft.focusDate === draft.plan.start ? '★ 已设为当日重点' : '☆ 设为当日重点' }}</button>
    <div class="deadline-line">
      <button class="text-button" :aria-expanded="editingDeadline" @click="editingDeadline = !editingDeadline">{{ draft.dueDate ? `最晚 ${draft.dueDate}${draft.dueTime ? ' ' + draft.dueTime : ''} 完成` : '＋ 添加截止时间' }}</button>
      <span v-if="reminderAt">{{ reminderAt }} 提醒</span>
    </div>
    <div v-if="editingDeadline" class="deadline-fields">
      <p>截止时间表示最晚何时完成，不会改变执行安排。</p>
      <label>截止日期<input :value="draft.dueDate" type="date" @change="setDate" /></label>
      <label>截止时间<input v-model="draft.dueTime" type="time" :disabled="!draft.dueDate" @change="!draft.dueTime && (draft.reminderMinutesBefore = null); emit('change')" /></label>
      <label class="reminder-field">到期提醒<SelectField v-model="draft.reminderMinutesBefore" aria-label="任务提醒" :disabled="!draft.dueDate || !draft.dueTime" :options="[{ value: null, label: '不提醒' }, { value: 5, label: '提前 5 分钟' }, { value: 15, label: '提前 15 分钟' }, { value: 60, label: '提前 1 小时' }, { value: 1440, label: '提前 1 天' }]" @update:model-value="emit('change')" /><small v-if="!draft.dueDate || !draft.dueTime">设置截止日期和时间后，可以启用提醒。</small></label>
      <button v-if="draft.dueDate" class="text-button" @click="clearDeadline">清除截止时间与提醒</button>
    </div>
  </section>
</template>
<style scoped>
.task-time { padding: 22px 0; border-bottom: 1px solid var(--border); }
.task-plan-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
h3 { margin: 0; font-size: 14px; font-weight: 600; }
.task-plan-heading label { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
.task-plan-heading :deep(.select-field) { width: 100px; }
.deadline-line { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-top: 16px; }
.deadline-line span, small { color: var(--muted); font-size: 12px; }
.focus-control { margin-top: 12px; color: var(--muted); font-size: 12px; }
.focus-control[aria-pressed=true] { color: var(--accent); }
.deadline-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 16px; padding: 16px; border-radius: 10px; background: var(--surface-soft); }
.deadline-fields p { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--muted); line-height: 1.6; }
.deadline-fields label { display: grid; min-width: 0; gap: 7px; font-size: 12px; color: var(--text-secondary); }
.deadline-fields input { width: 100%; min-width: 0; padding: 8px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 7px; }
.reminder-field { grid-column: 1 / -1; }
</style>
