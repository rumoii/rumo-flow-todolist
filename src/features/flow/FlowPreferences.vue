<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { preferencesKey } from '../workspace/preferences-context'
const props = defineProps<{ kind: 'quota' | 'reminder' }>()
const workspace = inject(preferencesKey, null)
const editing = ref(false)
const limit = ref(3)
const enabled = ref(true)
const time = ref('22:00')
const error = ref('')
const saving = computed(() => workspace?.settingsSaving.value ?? false)
function edit() {
  if (!workspace) return
  limit.value = workspace.settings.value.dailyVideoLimit
  enabled.value = workspace.settings.value.reviewReminderEnabled
  time.value = workspace.settings.value.reviewReminderTime
  error.value = ''
  editing.value = true
}
async function save() {
  if (!workspace) return
  if (props.kind === 'quota' && (!Number.isInteger(limit.value) || limit.value < 0 || limit.value > 10)) { error.value = '请输入 0 至 10 的整数'; return }
  if (props.kind === 'reminder' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)) { error.value = '请输入有效的提醒时间'; return }
  const patch = props.kind === 'quota' ? { dailyVideoLimit: limit.value } : { reviewReminderEnabled: enabled.value, reviewReminderTime: time.value }
  if (await workspace.saveSettings(patch, props.kind === 'quota' ? '视频额度' : '复盘提醒')) editing.value = false
}
</script>

<template>
  <div v-if="workspace" class="flow-preferences">
    <div class="flow-preferences-heading"><div><strong>{{ kind === 'quota' ? '每日视频额度' : '复盘提醒' }}</strong><small>{{ kind === 'quota' ? '调整今天及后续日期的额度，历史记录不变。' : workspace.settings.value.reviewReminderEnabled ? `每天 ${workspace.settings.value.reviewReminderTime} · 应用或托盘运行时提醒` : '提醒已关闭' }}</small></div><button v-if="!editing" class="secondary-button" :disabled="saving" @click="edit">{{ kind === 'quota' ? '调整额度' : '调整提醒' }}</button></div>
    <form v-if="editing" class="flow-preferences-form" @submit.prevent="save">
      <label v-if="kind === 'quota'">每日额度<input v-model.number="limit" aria-label="每日视频额度" type="number" min="0" max="10" step="1" required :disabled="saving" /></label>
      <template v-else><label><input v-model="enabled" type="checkbox" :disabled="saving" />启用提醒</label><input v-model="time" aria-label="复盘提醒时间" type="time" required :disabled="saving || !enabled" /></template>
      <button class="primary-button" :disabled="saving">保存{{ kind === 'quota' ? '额度' : '提醒' }}</button><button type="button" class="secondary-button" :disabled="saving" @click="editing = false">取消</button><p v-if="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
