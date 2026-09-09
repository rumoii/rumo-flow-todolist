import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { Task } from '../../shared/contracts'
import type { DraftPayloads } from '../../shared/drafts'
import type { DraftCoordinator } from '../../composables/draft-coordinator'
import { planLabel } from '../../shared/planning'

export function useQuickTask(drafts: DraftCoordinator, context: () => DraftPayloads['quickTask'], active: () => boolean, tasks: Ref<Task[]>, notify: (message: string) => void, refresh: () => Promise<void>) {
  const quickTitle = ref('')
  const quickBusy = ref(false)
  const quickReady = ref(false)
  const payload = ref<DraftPayloads['quickTask']>({ title: '', contextDate: '', listId: null, plan: null })
  let hydrating = false
  const quickContextHint = computed(() => quickTitle.value.trim() ? `此输入保留原安排：${planLabel(payload.value.plan)} · ${payload.value.contextDate}` : '')
  async function restore() {
    hydrating = true
    quickReady.value = false
    try {
      payload.value = await drafts.open('quickTask', 'global', context())
      quickTitle.value = payload.value.title
      quickReady.value = true
    } catch (error) { notify(error instanceof Error ? error.message : '新建任务草稿加载失败') }
    finally { hydrating = false }
  }
  watch(quickTitle, (title, previous) => {
    if (hydrating || !quickReady.value) return
    if (!previous.trim()) payload.value = context()
    payload.value = { ...payload.value, title }
    drafts.update('quickTask', 'global', payload.value)
  }, { flush: 'sync' })
  async function save() {
    if (quickBusy.value || !quickReady.value) throw new Error('编辑器尚未准备好')
    if (!quickTitle.value.trim()) return
    quickBusy.value = true
    try {
      const task = await drafts.commit('quickTask', 'global') as Task
      tasks.value = [...tasks.value.filter(item => item.id !== task.id), task]
      quickTitle.value = ''
      await restore()
      await refresh()
      notify('任务已添加')
    } finally { quickBusy.value = false }
  }
  function createTask() { void save().catch(error => notify(error instanceof Error ? error.message : '添加失败')) }
  const unregister = drafts.leave.register({ scope: 'quickTask', active, pending: () => quickTitle.value.trim() ? [{ id: 'quickTask:global', label: '待添加的任务', save, retain: () => drafts.retain('quickTask', 'global') }] : [] })
  onMounted(restore)
  watch(drafts.epoch, restore)
  onBeforeUnmount(unregister)
  return { quickTitle, quickBusy, quickReady, quickContextHint, createTask }
}
