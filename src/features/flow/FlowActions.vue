<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import type { ActionLinkView, ActionSource, CreateActionInput, TaskList, TaskPlan } from '../../shared/contracts'
import { localDay, planFor, shiftDay } from '../../shared/planning'
import { draftCoordinatorKey } from '../../composables/draft-coordinator'
import { navigationKey } from '../workspace/navigation'
import PlanField from '../workspace/PlanField.vue'
import SelectField from '../../components/SelectField.vue'
const props = defineProps<{ source: ActionSource; updatedAt: string; date: string; saved: boolean; dirty: boolean; suggestion: string }>()
const navigation = inject(navigationKey)!
const drafts = inject(draftCoordinatorKey)!
const links = ref<ActionLinkView[]>([])
const editing = ref(false)
const title = ref('')
const plan = ref<TaskPlan | null>(null)
const dueDate = ref('')
const lists = ref<TaskList[]>([])
const listId = ref('')
const submitted = ref<CreateActionInput | null>(null)
const busy = ref(false)
const error = ref('')
let requestId = ''
let sequence = 0
let unsubscribe: (() => void) | undefined
async function load() {
  const request = ++sequence
  try { const result = await window.todoApi.flow.actionLinks({ ...props.source }); if (request === sequence) links.value = result }
  catch { if (request === sequence) error.value = '行动链接加载失败' }
}
async function start() {
  try { lists.value = await window.todoApi.lists.list() } catch { error.value = '清单加载失败，请重试'; return }
  requestId = crypto.randomUUID(); submitted.value = null; listId.value = ''; title.value = props.suggestion.slice(0, 200); dueDate.value = ''; plan.value = props.source.kind === 'review' ? planFor('day', shiftDay(localDay(), 1)) : null; editing.value = true; error.value = ''
}
async function create() {
  if (busy.value || props.dirty || !props.saved || !title.value.trim()) return
  busy.value = true; error.value = ''
  try {
    await drafts.flush()
    submitted.value ??= { requestId, source: { ...props.source }, sourceUpdatedAt: props.updatedAt, task: { title: title.value.trim(), listId: listId.value || null, plan: plan.value ? { ...plan.value } : null, dueDate: dueDate.value || null } }
    await window.todoApi.flow.createAction(JSON.parse(JSON.stringify(submitted.value)))
    editing.value = false; await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建失败，请重试' }
  finally { busy.value = false }
}
async function open(id: string) { try { await navigation.openTask(id) } catch { error.value = '草稿保留失败，未切换页面' } }
function linkedTask(link: ActionLinkView) { return link.task }
watch(() => `${props.source.kind}:${props.source.key}`, () => { editing.value = false; void load() }, { immediate: true })
unsubscribe = window.todoApi.desktop.onDataChanged(() => { void load() })
onBeforeUnmount(() => { sequence++; unsubscribe?.() })
</script>
<template><section class="planning-panel">
  <strong>下一步行动</strong><p v-if="!saved || dirty">请先保存正文，再创建关联任务。</p>
  <button v-if="!editing" class="text-button" :disabled="!saved || dirty" @click="start">＋ 创建关联任务</button>
  <form v-else class="action-form" @submit.prevent="create"><fieldset :disabled="busy || !!submitted"><input v-model="title" aria-label="行动任务标题" placeholder="下一步做什么？" maxlength="200" /><PlanField v-model="plan" /><label>清单<SelectField v-model="listId" aria-label="行动任务清单" :options="[{ value: '', label: '收集箱' }, ...lists.map(list => ({ value: list.id, label: list.name }))]" /></label><label>截止日期（可选）<input v-model="dueDate" type="date" /></label></fieldset><div class="planning-controls"><button :disabled="busy || dirty || !saved || !title.trim()">{{ submitted ? '重试创建' : '创建任务' }}</button><button type="button" :disabled="busy" @click="editing = false">取消</button></div></form>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-for="link in links" :key="link.requestId"><button v-if="linkedTask(link) && !linkedTask(link)?.deletedAt" class="source-link" @click="open(link.taskId!)">{{ linkedTask(link)?.status === 'completed' ? '✓' : '○' }} {{ linkedTask(link)?.title }}</button><small v-else>关联任务{{ link.taskId ? '在回收站中' : '已永久删除' }}</small></template>
</section></template>
