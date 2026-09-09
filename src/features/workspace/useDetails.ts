import { computed, inject, onBeforeUnmount, ref, watch, type InjectionKey, type Ref } from 'vue'
import type { Task, Tag } from '../../shared/contracts'
import { taskToDraft, type TaskEditorDraft } from '../../shared/drafts'
import type { DraftCoordinator } from '../../composables/draft-coordinator'
import { ensureTags } from '../../shared/tag-utils'

interface Dependencies {
  tasks: Ref<Task[]>
  tags: Ref<Tag[]>
  drafts: DraftCoordinator
  notify(message: string): void
  closeMenus(): void
}
export function useDetails({ tasks, tags, drafts, notify, closeMenus }: Dependencies) {
  const detailLoading = ref(false)
  const selectedTaskId = ref<string | null>(null)
  const detailOpen = ref(false)
  const detailDraft = ref<TaskEditorDraft | null>(null)
  const tagQuery = ref('')
  const newSubtaskTitle = ref('')
  const saveState = ref('')
  const saveError = ref('')
  const recovered = ref(false)
  const subtaskBusy = ref(false)
  let hydrating = false
  let sequence = 0
  let opening = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingSave: Promise<void> | undefined
  const activeTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) ?? null)
  const subtasks = computed(() => tasks.value.filter(task => task.parentTaskId === selectedTaskId.value).sort((first, second) => first.sortOrder - second.sortOrder))
  const selectedTags = computed(() => tags.value.filter(tag => detailDraft.value?.tagIds.includes(tag.id)))
  const visibleDetailTags = computed(() => tags.value.filter(tag => tag.name.toLocaleLowerCase().includes(tagQuery.value.trim().toLocaleLowerCase())))
  const canCreateDetailTag = computed(() => Boolean(tagQuery.value.trim()) && !tags.value.some(tag => tag.name.toLocaleLowerCase() === tagQuery.value.trim().toLocaleLowerCase()))
  const validation = computed(() => {
    const draft = detailDraft.value
    if (!draft) return ''
    if (!draft.title.trim()) return '请填写任务标题，当前内容仅保留为草稿。'
    if (draft.dueTime && !draft.dueDate) return '请先设置截止日期。'
    if (draft.reminderMinutesBefore !== null && (!draft.dueDate || !draft.dueTime)) return '到期提醒需要截止日期和时间。'
    if (draft.recurrence !== 'none' && !draft.dueDate) return '重复任务需要截止日期作为首次发生日期。'
    return ''
  })
  async function saveDetail(acceptChanges = false, expectedBaseUpdatedAt?: string | null): Promise<void> {
    clearTimeout(timer)
    if (pendingSave) {
      await pendingSave
      if (selectedTaskId.value && drafts.hasPending('task', selectedTaskId.value)) return saveDetail(acceptChanges, expectedBaseUpdatedAt)
      return
    }
    const id = selectedTaskId.value
    if (!id || !detailDraft.value || !drafts.hasPending('task', id)) return
    if (recovered.value) throw new Error('请先应用或放弃恢复的任务草稿')
    if (validation.value) { await drafts.retain('task', id); throw new Error(validation.value) }
    const submitted = sequence
    saveState.value = '正在保存…'
    saveError.value = ''
    pendingSave = (async () => {
      const updated = await drafts.commitTask(id, acceptChanges, expectedBaseUpdatedAt)
      const task = tasks.value.find(item => item.id === id)
      if (task) Object.assign(task, updated)
      if (selectedTaskId.value === id) saveState.value = submitted === sequence ? '已保存' : '等待保存…'
    })()
    try { await pendingSave }
    catch (error) {
      saveState.value = '保存失败'
      saveError.value = error instanceof Error ? error.message : '保存失败，请重试'
      throw error
    } finally { pendingSave = undefined }
  }
  function scheduleSave(delay = 700) {
    clearTimeout(timer)
    if (hydrating || recovered.value || saveError.value.includes('已变化')) return
    timer = setTimeout(() => { void saveDetail().catch(() => undefined) }, delay)
  }
  function flushOnBlur() { if (!recovered.value) void saveDetail().catch(() => undefined) }
  async function applyRecovered() { recovered.value = false; await saveDetail().catch(() => undefined) }
  watch(detailDraft, value => {
    if (hydrating || !value || !selectedTaskId.value) return
    if (!drafts.update('task', selectedTaskId.value, value)) return
    sequence++
    saveState.value = '等待保存…'
    scheduleSave()
  }, { deep: true, flush: 'sync' })
  watch(newSubtaskTitle, title => {
    if (!hydrating && selectedTaskId.value) drafts.update('subtask', selectedTaskId.value, { title })
  }, { flush: 'sync' })
  async function selectTask(task: Task, checked = false) {
    if (detailOpen.value && task.id === selectedTaskId.value) return
    if (!checked && !await drafts.leave.request(detailOpen.value ? ['detail'] : ['quickTask'])) return
    const request = ++opening
    closeMenus()
    detailLoading.value = true
    hydrating = true
    try {
      const payload = await drafts.open('task', task.id, taskToDraft(task))
      const subtask = await drafts.open('subtask', task.id, { title: '' })
      if (request !== opening) return
      selectedTaskId.value = task.id
      detailDraft.value = payload
      newSubtaskTitle.value = subtask.title
      recovered.value = drafts.hasPending('task', task.id)
      tagQuery.value = ''
      saveState.value = recovered.value ? '草稿已恢复，尚未应用' : ''
      saveError.value = ''
      detailOpen.value = true
    } catch (error) { notify(error instanceof Error ? error.message : '任务加载失败') }
    finally { if (request === opening) { hydrating = false; detailLoading.value = false } }
  }
  async function closeDetail() {
    if (!detailOpen.value || !await drafts.leave.request(['detail'])) return
    clearTimeout(timer)
    ++opening
    detailOpen.value = false
  }
  async function discardTaskDraft() {
    const task = activeTask.value
    if (!task) return
    clearTimeout(timer)
    try {
      await pendingSave
      await drafts.discard('task', task.id)
      const latest = (await window.todoApi.tasks.list()).find(item => item.id === task.id)
      if (!latest) throw new Error('任务已删除')
      Object.assign(task, latest)
      hydrating = true
      detailDraft.value = await drafts.open('task', task.id, taskToDraft(task))
      recovered.value = false
      saveState.value = ''
      saveError.value = ''
    } catch (error) { saveError.value = error instanceof Error ? error.message : '放弃草稿失败' }
    finally { hydrating = false }
  }
  async function resolveConflict() {
    if (!selectedTaskId.value) return
    try {
      const latest = await window.todoApi.drafts.get('task', selectedTaskId.value)
      if (!window.confirm('正式任务已变化。确认使用当前编辑内容覆盖对应字段？')) return
      await saveDetail(true, latest.baseUpdatedAt)
    } catch (error) { saveError.value = error instanceof Error ? error.message : '冲突处理失败，请重试' }
  }
  async function createTagFromDetail() {
    const id = selectedTaskId.value
    const name = tagQuery.value.trim()
    if (!name || !detailDraft.value) return
    try {
      const result = await ensureTags(window.todoApi, tags.value, [name])
      if (id !== selectedTaskId.value) return
      const tag = result.tags[0]
      if (!tag) throw new Error('标签创建失败，请重试')
      if (!detailDraft.value.tagIds.includes(tag.id)) detailDraft.value.tagIds.push(tag.id)
      tagQuery.value = ''
      scheduleSave(0)
    } catch (error) { saveError.value = error instanceof Error ? error.message : '标签创建失败' }
  }
  async function addSubtask() {
    if (!activeTask.value || !newSubtaskTitle.value.trim() || subtaskBusy.value) return
    const id = activeTask.value.id
    subtaskBusy.value = true
    try {
      await saveDetail()
      const created = await drafts.commit('subtask', id) as Task
      tasks.value = [...tasks.value.filter(task => task.id !== created.id), created]
      newSubtaskTitle.value = ''
      await drafts.open('subtask', id, { title: '' })
    } catch (error) { saveError.value = error instanceof Error ? error.message : '添加子任务失败'; throw error }
    finally { subtaskBusy.value = false }
  }
  function submitSubtask() { void addSubtask().catch(() => undefined) }
  const unregister = drafts.leave.register({
    scope: 'detail', active: () => detailOpen.value,
    settle: async () => { clearTimeout(timer); if (!recovered.value && !validation.value && !saveError.value) await saveDetail().catch(() => undefined) },
    pending: () => {
      const id = selectedTaskId.value
      if (!id) return []
      return [
        ...(drafts.hasPending('task', id) ? [{ id: 'task:' + id, label: '任务详情', save: async () => { recovered.value = false; await saveDetail() }, retain: () => drafts.retain('task', id) }] : []),
        ...(newSubtaskTitle.value.trim() ? [{ id: 'subtask:' + id, label: '待添加的子任务', save: addSubtask, retain: () => drafts.retain('subtask', id) }] : []),
      ]
    },
  })
  watch(drafts.synchronizedTasks, values => {
    for (const sync of values) {
      const task = tasks.value.find(item => item.id === sync.task.id)
      if (task) Object.assign(task, sync.task)
      if (selectedTaskId.value === sync.task.id && !drafts.hasPending('task', sync.task.id)) {
        hydrating = true
        detailDraft.value = taskToDraft(sync.task)
        hydrating = false
      }
    }
  }, { flush: 'sync' })
  watch(drafts.epoch, () => { clearTimeout(timer); ++opening; detailOpen.value = false; selectedTaskId.value = null; detailDraft.value = null })
  onBeforeUnmount(() => { clearTimeout(timer); ++opening; unregister() })
  return { detailLoading, selectedTaskId, detailOpen, detailDraft, tagQuery, newSubtaskTitle, activeTask, subtasks, selectedTags, visibleDetailTags, canCreateDetailTag, selectTask, closeDetail, discardTaskDraft, createTagFromDetail, saveDetail, addSubtask, submitSubtask, subtaskBusy, scheduleSave, flushOnBlur, saveState, saveError, validation, recovered, applyRecovered, resolveConflict }
}
export const detailsKey: InjectionKey<ReturnType<typeof useDetails>> = Symbol('task-details')
export function useTaskDetails() {
  const details = inject(detailsKey)
  if (!details) throw new Error('任务编辑器尚未初始化')
  return details
}
