<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import PlanField from './PlanField.vue'
import { planLabel } from '../../shared/planning'
import { useWorkspaceContext } from './context'
const { arrangement, todayIso } = useWorkspaceContext()
const { state } = arrangement
const dialog = ref<HTMLElement>()
function applyCustom() {
  const input = dialog.value?.querySelector<HTMLInputElement>('input[type="date"]')
  if (input && (!input.value || !input.validity.valid)) { state.error = '请选择有效的计划日期'; input.focus(); return }
  void arrangement.submit({ kind: 'plan', target: state.custom })
}
watch(() => state.task?.id, async taskId => {
  if (!taskId) return
  await nextTick()
  dialog.value?.focus()
})
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void arrangement.close() }
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')]
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first) { event.preventDefault(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) { event.preventDefault(); first.focus() }
}
</script>

<template>
  <div v-if="state.task" class="arrangement-overlay" @click.self="arrangement.close" @keydown="onKeydown" @click.stop>
    <section ref="dialog" class="arrangement-dialog" role="dialog" aria-modal="true" aria-labelledby="arrangement-title" aria-describedby="arrangement-hint" :aria-busy="state.busy" tabindex="-1">
      <header><h2 id="arrangement-title">安排任务</h2><button class="icon-button" aria-label="关闭安排" :disabled="state.busy" @click="arrangement.close">×</button></header>
      <p class="arrangement-task">{{ state.task.title }}</p>
      <p id="arrangement-hint">只修改执行计划，不改变截止日期和提醒。</p>
      <fieldset :disabled="state.busy">
        <legend>快捷安排</legend>
        <div class="arrangement-options">
          <button v-for="option in ([['today','今天'],['tomorrow','明天'],['week','本周'],['month','本月']] as const)" :key="option[0]" @click="arrangement.submit({ kind: 'plan', target: option[0] })">{{ option[1] }}</button>
          <button @click="arrangement.submit({ kind: 'plan', target: null })">未安排</button>
        </div>
        <PlanField v-model="state.custom" />
        <p class="arrangement-preview">将安排为：{{ planLabel(state.custom) }}</p>
        <button class="save-button arrangement-apply" @click="applyCustom">应用自定义安排</button>
        <button class="arrangement-focus" @click="arrangement.submit({ kind: 'focus', enabled: state.task.focusDate !== todayIso })">{{ state.task.focusDate === todayIso ? '☆ 取消今日重点' : '★ 安排到今天并设为重点' }}</button>
      </fieldset>
      <p v-if="state.busy" role="status">正在确认任务和保留窗口输入…</p>
      <div v-if="state.error" class="arrangement-error" role="alert"><p>{{ state.error }}</p><p>未改变你的输入。可重试安排，或打开详情检查修改。</p><button @click="arrangement.openDetails">打开详情</button></div>
    </section>
  </div>
</template>

<style scoped>
.arrangement-overlay { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; padding: 20px; background: var(--overlay); }
.arrangement-dialog { width: min(460px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 24px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); box-shadow: var(--panel-shadow); }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
h2 { margin: 0; font-size: 20px; }
.arrangement-task { font-weight: 600; overflow-wrap: anywhere; }
#arrangement-hint, .arrangement-preview, [role="status"] { color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
fieldset { min-width: 0; margin: 20px 0 0; padding: 0; border: 0; }
legend { margin-bottom: 10px; font-size: 13px; color: var(--text-secondary); }
.arrangement-options { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.arrangement-options button, .arrangement-focus, .arrangement-error button { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); color: var(--text); }
.arrangement-options button:hover, .arrangement-focus:hover { border-color: #856af9; color: #856af9; }
.arrangement-apply { width: 100%; margin-top: 12px; }
.arrangement-focus { width: 100%; margin-top: 16px; color: #856af9; }
.arrangement-error { margin-top: 16px; color: #e84848; font-size: 13px; overflow-wrap: anywhere; }
</style>
