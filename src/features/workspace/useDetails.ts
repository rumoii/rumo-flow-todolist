import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Task, Tag, CreateTaskInput, RecurrenceFrequency } from '../../shared/contracts'
import type { TaskEditorDraft } from '../../shared/drafts'
import { taskToDraft, draftToTask } from '../../shared/drafts'
import type { DraftCoordinator } from '../../composables/draft-coordinator'
import { ensureTags } from '../../shared/tag-utils'
interface Dependencies {
  tasks: Ref<Task[]>
  tags: Ref<Tag[]>
  drafts: DraftCoordinator
  notify: (message: string) => void
  closeMenus: () => void
  hasApi: () => boolean
  managedTagDrafts: Ref<Record<string, {
    name: string
    color: string
  }>>
}
export function useDetails({ tasks, tags, drafts, notify, closeMenus, hasApi, managedTagDrafts }: Dependencies) {
  type Draft = TaskEditorDraft
  let hydratingDetail = false
  const detailLoading = ref(false)
  let openingTask = 0
  const selectedTaskId = ref<string | null>(null)
  const detailOpen = ref(false)
  const detailDraft = ref<Draft | null>(null)
  const tagQuery = ref('')
  const newSubtaskTitle = ref('')
  const recurrenceDrafts = new Map<string, {
    frequency: RecurrenceFrequency
    endDate: string
  }>()
  const activeTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) || null)
  watch(drafts.synchronizedTask, sync => {
    if (!sync) return
    const task = tasks.value.find(item => item.id === sync.task.id)
    if (task) Object.assign(task, sync.task)
    if (selectedTaskId.value === sync.task.id) {
      hydratingDetail = true
      detailDraft.value = taskToDraft(sync.task)
      hydratingDetail = false
    }
  }, { flush: 'sync' })
  const subtasks = computed(() => activeTask.value ? tasks.value.filter(task => task.parentTaskId === activeTask.value!.id).sort((a, b) => a.sortOrder - b.sortOrder) : [])
  const visibleDetailTags = computed(() => { const query = tagQuery.value.trim().toLocaleLowerCase(); return query ? tags.value.filter(tag => tag.name.toLocaleLowerCase().includes(query)) : tags.value; })
  const canCreateDetailTag = computed(() => { const query = tagQuery.value.trim(); return Boolean(query) && !tags.value.some(tag => tag.name.toLocaleLowerCase() === query.toLocaleLowerCase()); })
  async function selectTask(task: Task) {
    const request = ++openingTask
    try {
      await drafts.flush()
    }
    catch {
      notify('草稿保留失败，请重试后切换任务')
      return
    }
    if (request !== openingTask)
      return
    closeMenus()
    tagQuery.value = ''
    selectedTaskId.value = task.id
    detailOpen.value = true
    hydratingDetail = true
    detailLoading.value = true
    detailDraft.value = taskToDraft(task)
    try {
      const restored = await drafts.open('task', task.id, detailDraft.value)
      if (request === openingTask)
        detailDraft.value = restored
    }
    catch {
      notify('草稿加载失败，请重新打开任务')
      detailOpen.value = false
    }
    finally {
      if (request === openingTask) {
        hydratingDetail = false
        detailLoading.value = false
      }
    }
  }
  watch(detailDraft, value => { if (!hydratingDetail && value && selectedTaskId.value)
    drafts.update('task', selectedTaskId.value, value); }, { deep: true, flush: 'sync' })
  async function closeDetail() {
    ++openingTask
    hydratingDetail = false
    detailLoading.value = false
    try {
      await drafts.flush()
      detailOpen.value = false
    }
    catch {
      notify('草稿保留失败，请重试后关闭')
    }
  }
  async function discardTaskDraft() {
    if (!activeTask.value || !window.confirm('放弃未正式保存的任务修改？'))
      return
    try {
      await drafts.discard('task', activeTask.value.id)
      await selectTask(activeTask.value)
    }
    catch {
      notify('放弃草稿失败')
    }
  }
  async function createTagFromDetail() { const name = tagQuery.value.trim(); if (!name || !detailDraft.value || !hasApi() || !window.todoApi.tags?.create)
    return; const result = await ensureTags(window.todoApi, tags.value, [name]); const tag = result.tags[0]; if (tag && !detailDraft.value.tagIds.includes(tag.id))
    detailDraft.value.tagIds.push(tag.id); if (tag)
    managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }; tagQuery.value = ''; notify(result.failed.length ? '标签创建失败' : '标签已添加'); }
  async function saveDetail() {
    if (!activeTask.value || !detailDraft.value || !detailDraft.value.title.trim())
      return
    const task = activeTask.value
    const draft = detailDraft.value
    const input = draftToTask(draft)
    try {
      const updated = drafts.supported ? await drafts.commit('task', task.id) as Task : hasApi() ? await window.todoApi.tasks.update(task.id, input) : ({ ...task, ...input, recurrenceRuleId: draft.recurrence === 'none' ? null : (task.recurrenceRuleId || 'preview-rule'), updatedAt: new Date().toISOString() } as Task)
      Object.assign(task, updated, { isPinned: updated.isPinned ?? task.isPinned })
      await drafts.open('task', task.id, detailDraft.value!)
      if (draft.recurrence === 'none')
        recurrenceDrafts.delete(task.id)
      else
        recurrenceDrafts.set(task.id, { frequency: draft.recurrence, endDate: draft.recurrenceEnd })
      notify('已保存')
    }
    catch {
      notify('保存失败')
    }
  }
  async function addSubtask() { const title = newSubtaskTitle.value.trim(); if (!activeTask.value || !title)
    return; await createTaskAsSubtask(title); newSubtaskTitle.value = ''; }
  async function createTaskAsSubtask(title: string) {
    const input: CreateTaskInput = { title, parentTaskId: activeTask.value!.id, listId: activeTask.value!.listId, dueDate: activeTask.value!.dueDate, priority: 'none', isPinned: false }
    const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, isPinned: false, parentTaskId: activeTask.value!.id, recurrenceRuleId: null, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task)
    tasks.value.push({ ...task, isPinned: false })
    notify('子任务已添加')
  }
  return { detailLoading, selectedTaskId, detailOpen, detailDraft, tagQuery, newSubtaskTitle, recurrenceDrafts, activeTask, subtasks, visibleDetailTags, canCreateDetailTag, selectTask, closeDetail, discardTaskDraft, createTagFromDetail, saveDetail, addSubtask, createTaskAsSubtask }
}
