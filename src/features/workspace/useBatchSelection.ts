import { computed, inject, ref, watch } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import type { Task, TaskBatchAction } from '../../shared/contracts'
export function useBatchSelection(candidates: Ref<Task[]>, scope: Ref<string>, refresh: () => Promise<void>) {
  const active = ref(false)
  const busy = ref(false)
  const selected = ref<{ id: string; updatedAt: string }[]>([])
  const error = ref('')
  const saved = ref(false)
  const generation = ref('')
  let sequence = 0
  const chosen = computed(() => new Set(selected.value.map(task => task.id)))
  const available = computed(() => [...new Map(candidates.value.filter(task => !task.parentTaskId && !task.deletedAt).map(task => [task.id, task])).values()])
  watch(scope, () => { sequence++; selected.value = []; active.value = false; generation.value = ''; error.value = '页面或筛选已改变，已清空选择' }, { flush: 'sync' })
  watch([available, busy], ([tasks, pending]) => {
    if (pending) return
    const ids = new Set(tasks.map(task => task.id))
    selected.value = selected.value.filter(task => ids.has(task.id))
  })
  async function enter() {
    if (busy.value || !available.value.length) return
    const request = ++sequence
    busy.value = true
    error.value = ''
    saved.value = false
    try {
      const snapshot = await window.todoApi.drafts.get('task', available.value[0].id)
      if (request !== sequence) return
      generation.value = snapshot.generation
      selected.value = []
      active.value = true
    } catch { error.value = '无法读取任务状态，请重试' }
    finally { busy.value = false }
  }
  function exit() {
    if (busy.value) return
    sequence++
    active.value = false
    selected.value = []
    error.value = ''
    saved.value = false
  }
  function toggle(task: Task) {
    if (!active.value || busy.value || saved.value || !available.value.some(item => item.id === task.id)) return
    if (chosen.value.has(task.id)) selected.value = selected.value.filter(item => item.id !== task.id)
    else if (selected.value.length < 500) selected.value.push({ id: task.id, updatedAt: task.updatedAt })
    else error.value = '最多选择 500 项，请缩小筛选范围'
  }
  function selectAll() {
    if (busy.value || saved.value || available.value.length > 500) return
    selected.value = available.value.map(task => ({ id: task.id, updatedAt: task.updatedAt }))
  }
  async function reload() {
    const request = sequence
    try { await refresh(); if (request === sequence) { saved.value = false; error.value = '' } }
    catch { if (request === sequence) error.value = '操作已保存，列表刷新失败，请重试刷新' }
  }
  async function apply(action: TaskBatchAction) {
    if (busy.value || saved.value || !selected.value.length || !generation.value) return
    busy.value = true
    const request = sequence
    error.value = ''
    try {
      await window.todoApi.tasks.batch({ targets: selected.value.map(task => ({ ...task })), generation: generation.value, action: JSON.parse(JSON.stringify(action)) })
      if (request === sequence) { selected.value = []; saved.value = true }
    } catch (cause) { if (request === sequence) error.value = cause instanceof Error ? cause.message : '批量操作失败' }
    finally { busy.value = false }
    if (saved.value) await reload()
  }
  return { active, busy, selected, chosen, available, error, saved, enter, exit, toggle, selectAll, apply, reload }
}
export type BatchSelection = ReturnType<typeof useBatchSelection>
export const batchSelectionKey: InjectionKey<BatchSelection> = Symbol('batch-selection')
export const injectBatchSelection = () => inject(batchSelectionKey, undefined)
