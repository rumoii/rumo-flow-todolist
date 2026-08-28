<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SelectField from './components/SelectField.vue'
import rumoFlowIcon from './assets/rumo-flow-icon.svg'
import { parseQuickAdd } from './shared/quick-add'
import { ensureTags } from './shared/tag-utils'
import type { AppSettings, CreateTaskInput, DesktopStatus, RecurrenceFrequency, SavedFilter, Tag, Task, TaskList, TaskPriority, UpdateTaskInput } from './shared/contracts'

type View = 'inbox' | 'today' | 'upcoming' | 'week' | 'completed' | `list:${string}` | `filter:${string}`
type Draft = { title: string; listId: string | null; dueDate: string; dueTime: string; reminderMinutesBefore: number | null; tagIds: string[]; priority: TaskPriority; notes: string; recurrence: RecurrenceFrequency | 'none'; recurrenceEnd: string }

const hasApi = () => typeof window !== 'undefined' && !!window.todoApi
const tasks = ref<Task[]>([])
const lists = ref<TaskList[]>([])
const tags = ref<Tag[]>([])
const savedFilters = ref<SavedFilter[]>([])
const settings = ref<AppSettings>({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space' })
const desktopStatus = ref<DesktopStatus>({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: false })
const activeView = ref<View>('today')
const selectedTaskId = ref<string | null>(null)
const quickTitle = ref('')
const quickInput = ref<HTMLInputElement | null>(null)
const search = ref('')
const groupBy = ref<'none' | 'list' | 'priority' | 'tag'>('none')
const temporaryTagId = ref<string | null>(null)
const detailOpen = ref(false)
const detailDraft = ref<Draft | null>(null)
const pendingDelete = ref<Task | null>(null)
const pendingListDelete = ref<TaskList | null>(null)
const listDeletePolicy = ref<'keep' | 'delete'>('keep')
const settingsOpen = ref(false)
const shortcutsOpen = ref(false)
const tagQuery = ref('')
const settingsTagName = ref('')
const managedTagDrafts = ref<Record<string, { name: string; color: string }>>({})
const filterComposerOpen = ref(false)
const newFilterName = ref('')
const newFilterStatus = ref<'active' | 'completed' | 'all'>('active')
const newFilterListId = ref<string>('any')
const newFilterPriority = ref<TaskPriority | 'any'>('any')
const newFilterTagId = ref('any')
const newFilterDue = ref<'any' | 'today' | 'overdue' | 'next7' | 'none'>('any')
const listComposerOpen = ref(false)
const newListName = ref('')
const newSubtaskTitle = ref('')
const openListMenuId = ref<string | null>(null)
const openTaskMenuId = ref<string | null>(null)
const recurrenceDrafts = new Map<string, { frequency: RecurrenceFrequency; endDate: string }>()
const toast = ref('')
const toastAction = ref<{ label: string; run: () => Promise<void> } | null>(null)
const loading = ref(true)
const draggedTaskId = ref<string | null>(null)
const draggedListId = ref<string | null>(null)
const taskDropTargetId = ref<string | null>(null)
const listDropTargetId = ref<string | null>(null)
let toastTimer: number | undefined

const today = new Date()
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayIso = isoDate(today)
const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)

const fallbackLists: TaskList[] = [{ id: 'inbox', name: '收集箱', color: '#856AF9', sortOrder: 0, isPinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
const fallbackTasks: Task[] = []
const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 }

function notify(message: string, action: { label: string; run: () => Promise<void> } | null = null) {
  toast.value = message
  toastAction.value = action
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = ''; toastAction.value = null }, action ? 6000 : 2800)
}

async function loadData() {
  loading.value = true
  try {
    if (hasApi()) {
      const api = window.todoApi
      const loaded = await Promise.all([api.lists.list(), api.tasks.list({}), api.tags?.list?.() ?? Promise.resolve([]), api.filters?.list?.() ?? Promise.resolve([]), api.settings?.get?.() ?? Promise.resolve(settings.value), api.desktop?.status?.() ?? Promise.resolve(desktopStatus.value)])
      lists.value = loaded[0].map(list => ({ ...list, isPinned: list.isPinned ?? false })); tasks.value = loaded[1].map(task => ({ ...task, isPinned: task.isPinned ?? false, dueTime: task.dueTime ?? null, reminderMinutesBefore: task.reminderMinutesBefore ?? null, deletedAt: task.deletedAt ?? null, tags: task.tags ?? [] })); tags.value = loaded[2]; managedTagDrafts.value = Object.fromEntries(tags.value.map(tag => [tag.id, { name: tag.name, color: tag.color || '#856AF9' }])); savedFilters.value = loaded[3]; settings.value = loaded[4]; desktopStatus.value = loaded[5]; applySettings()
    } else {
      lists.value = fallbackLists
      tasks.value = fallbackTasks
    }
  } catch { notify('数据加载失败，请稍后重试') } finally { loading.value = false }
}

const activeListId = computed(() => activeView.value.startsWith('list:') ? activeView.value.slice(5) : null)
const activeFilter = computed(() => activeView.value.startsWith('filter:') ? savedFilters.value.find(filter => filter.id === activeView.value.slice(7)) : null)
const viewTitle = computed(() => ({ inbox: '收集箱', today: '今天', upcoming: '即将到期', week: '本周', completed: '已完成' }[activeView.value as string] || activeFilter.value?.name || lists.value.find(list => list.id === activeListId.value)?.name || '待办'))
const viewHint = computed(() => activeView.value === 'today' ? `${today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 把注意力放在最重要的事上` : activeView.value === 'upcoming' ? '未来 30 天的安排' : activeView.value === 'week' ? '接下来七天的轻量排程' : activeView.value === 'completed' ? '已经完成的任务' : '这个清单中的任务')
const taskReorderEnabled = computed(() => !search.value.trim() && (activeView.value === 'today' || Boolean(activeListId.value)))

function compareTasks(a: Task, b: Task) {
  return Number(b.isPinned) - Number(a.isPinned) || priorityRank[a.priority] - priorityRank[b.priority] || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
}

const filteredTasks = computed(() => {
  const q = search.value.trim().toLowerCase()
  return tasks.value.filter(task => {
    if (task.parentTaskId) return false
    if (activeView.value === 'completed' && task.status !== 'completed') return false
    if (activeView.value !== 'completed' && task.status === 'completed') return false
    if (activeListId.value && task.listId !== activeListId.value) return false
    if (activeView.value === 'inbox' && task.listId !== null) return false
    if (activeView.value === 'today' && (!task.dueDate || task.dueDate > todayIso)) return false
    if (activeView.value === 'upcoming' && (!task.dueDate || task.dueDate < todayIso || task.dueDate > isoDate(new Date(today.getTime() + 30 * 86400000)))) return false
    if (activeView.value === 'week' && (!task.dueDate || task.dueDate < todayIso || task.dueDate > isoDate(weekEnd))) return false
    if (temporaryTagId.value && !task.tags.some(tag => tag.id === temporaryTagId.value)) return false
    if (activeFilter.value) { const f = activeFilter.value.criteria; if (f.status && f.status !== 'all' && task.status !== f.status) return false; if (f.listId !== undefined && task.listId !== f.listId) return false; if (f.priorities?.length && !f.priorities.includes(task.priority)) return false; if (f.tagIds?.length && !task.tags.some(tag => f.tagIds!.includes(tag.id))) return false; if (f.due === 'today' && task.dueDate !== todayIso) return false; if (f.due === 'overdue' && (!task.dueDate || task.dueDate >= todayIso)) return false; if (f.due === 'next7' && (!task.dueDate || task.dueDate <= todayIso || task.dueDate > isoDate(new Date(today.getTime() + 7 * 86400000)))) return false; if (f.due === 'none' && task.dueDate) return false; if (f.search && !`${task.title} ${task.notes} ${task.tags.map(tag => tag.name).join(' ')}`.toLowerCase().includes(f.search.toLowerCase())) return false }
    return !q || task.title.toLowerCase().includes(q) || task.notes.toLowerCase().includes(q) || task.tags.some(tag => tag.name.toLowerCase().includes(q))
  }).sort(compareTasks)
})
const pinnedTasks = computed(() => filteredTasks.value.filter(task => task.isPinned))
const regularTasks = computed(() => filteredTasks.value.filter(task => !task.isPinned))
function taskGroupLabel(task: Task): string { if (groupBy.value === 'list') return lists.value.find(list => list.id === task.listId)?.name ?? '收集箱'; if (groupBy.value === 'priority') return priorityLabel(task.priority); if (groupBy.value === 'tag') return task.tags[0]?.name ? `#${task.tags[0].name}` : '无标签'; return '' }
const groupedRegularTasks = computed(() => groupBy.value === 'none' ? regularTasks.value : [...regularTasks.value].sort((a, b) => taskGroupLabel(a).localeCompare(taskGroupLabel(b), 'zh-CN') || compareTasks(a, b)))
const sortedLists = computed(() => [...lists.value].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
const pinnedLists = computed(() => sortedLists.value.filter(list => list.isPinned))
const regularLists = computed(() => sortedLists.value.filter(list => !list.isPinned))
const activeTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) || null)
const subtasks = computed(() => activeTask.value ? tasks.value.filter(task => task.parentTaskId === activeTask.value!.id).sort((a, b) => a.sortOrder - b.sortOrder) : [])
const completedCount = computed(() => tasks.value.filter(task => task.status === 'completed').length)
const pendingCount = computed(() => tasks.value.filter(task => task.status === 'active').length)
const listCount = (id: string) => tasks.value.filter(task => task.listId === id && task.status === 'active').length
const temporaryTag = computed(() => tags.value.find(tag => tag.id === temporaryTagId.value) ?? null)
const visibleDetailTags = computed(() => { const query = tagQuery.value.trim().toLocaleLowerCase(); return query ? tags.value.filter(tag => tag.name.toLocaleLowerCase().includes(query)) : tags.value })
const canCreateDetailTag = computed(() => { const query = tagQuery.value.trim(); return Boolean(query) && !tags.value.some(tag => tag.name.toLocaleLowerCase() === query.toLocaleLowerCase()) })

function selectTask(task: Task) {
  closeMenus()
  tagQuery.value = ''
  selectedTaskId.value = task.id
  detailOpen.value = true
  const savedRecurrence = recurrenceDrafts.get(task.id)
  detailDraft.value = { title: task.title, listId: task.listId, dueDate: task.dueDate || '', dueTime: task.dueTime || '', reminderMinutesBefore: task.reminderMinutesBefore, tagIds: task.tags.map(tag => tag.id), priority: task.priority, notes: task.notes, recurrence: savedRecurrence?.frequency || (task.recurrenceRuleId ? 'daily' : 'none'), recurrenceEnd: savedRecurrence?.endDate || '' }
}
function dateLabel(value: string | null) {
  if (!value) return '无日期'
  if (value === todayIso) return '今天'
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (value === isoDate(tomorrow)) return '明天'
  return new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
function priorityLabel(priority: TaskPriority) { return ({ none: '无优先级', low: '低优先级', medium: '中优先级', high: '高优先级' }[priority]) }
function priorityCode(priority: TaskPriority) { return ({ none: '', low: 'P3', medium: 'P2', high: 'P1' }[priority]) }
function priorityClass(priority: TaskPriority) { return priority === 'high' ? 'priority-high' : priority === 'medium' ? 'priority-medium' : priority === 'low' ? 'priority-low' : '' }

async function createTask(title = quickTitle.value) {
  const parsed = parseQuickAdd(title, lists.value, tags.value, today); const clean = parsed.input.title.trim(); if (!clean) return
  try {
    const resolved = hasApi() ? await ensureTags(window.todoApi, tags.value, parsed.tagNames) : { tags: [], failed: [] }
    const input: CreateTaskInput = { ...parsed.input, title: clean, tagIds: resolved.tags.map(tag => tag.id), listId: parsed.recognized.some(token => token.startsWith('~')) ? parsed.input.listId : activeListId.value, dueDate: parsed.recognized.some(token => token.startsWith('@')) ? parsed.input.dueDate : activeView.value === 'today' ? todayIso : null, notes: '', isPinned: false }
    const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, isPinned: false, parentTaskId: null, recurrenceRuleId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task)
    tasks.value.push({ ...task, isPinned: task.isPinned ?? false }); quickTitle.value = ''; notify(resolved.failed.length ? `任务已添加，标签创建失败：${resolved.failed.join('、')}` : parsed.recognized.length ? `已识别 ${parsed.recognized.join(' ')}` : '任务已添加')
  } catch { notify('添加失败') }
}

async function createTagFromDetail() { const name = tagQuery.value.trim(); if (!name || !detailDraft.value || !hasApi() || !window.todoApi.tags?.create) return; const result = await ensureTags(window.todoApi, tags.value, [name]); const tag = result.tags[0]; if (tag && !detailDraft.value.tagIds.includes(tag.id)) detailDraft.value.tagIds.push(tag.id); if (tag) managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }; tagQuery.value = ''; notify(result.failed.length ? '标签创建失败' : '标签已添加') }
async function createTagFromSettings() { const name = settingsTagName.value.trim(); if (!name || !hasApi() || !window.todoApi.tags?.create) return; const result = await ensureTags(window.todoApi, tags.value, [name]); const tag = result.tags[0]; if (tag) managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }; settingsTagName.value = ''; notify(result.failed.length ? '标签创建失败，请检查名称是否重复' : result.tags.length ? '标签已创建' : '标签未创建') }
async function updateManagedTag(tag: Tag) { if (!hasApi() || !window.todoApi.tags?.update) return; const draft = managedTagDrafts.value[tag.id]; if (!draft?.name.trim()) { notify('标签名称不能为空'); return } try { const updated = await window.todoApi.tags.update(tag.id, { name: draft.name.trim(), color: draft.color }); Object.assign(tag, updated); managedTagDrafts.value[tag.id] = { name: updated.name, color: updated.color || '#856AF9' }; tasks.value.forEach(task => task.tags.filter(item => item.id === tag.id).forEach(item => Object.assign(item, updated))); notify('标签已更新') } catch { managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }; notify('标签更新失败，请检查名称是否重复') } }
async function deleteManagedTag(tag: Tag) { if (!hasApi() || !window.todoApi.tags?.remove) return; try { await window.todoApi.tags.remove(tag.id); tags.value = tags.value.filter(item => item.id !== tag.id); delete managedTagDrafts.value[tag.id]; tasks.value.forEach(task => { task.tags = task.tags.filter(item => item.id !== tag.id) }); if (detailDraft.value) detailDraft.value.tagIds = detailDraft.value.tagIds.filter(id => id !== tag.id); if (temporaryTagId.value === tag.id) temporaryTagId.value = null; notify('标签已删除，任务已保留') } catch { notify('标签删除失败') } }
function filterByTag(tag: Tag) { temporaryTagId.value = tag.id; search.value = ''; closeMenus() }
async function toggleTask(task: Task) {
  const wasCompleted = task.status === 'completed'; try { if (hasApi()) wasCompleted ? await window.todoApi.tasks.restore(task.id) : await window.todoApi.tasks.complete(task.id); await loadData(); notify(wasCompleted ? '已恢复' : '已完成', { label: '撤销', run: async () => { if (hasApi()) wasCompleted ? await window.todoApi.tasks.complete(task.id) : await window.todoApi.tasks.restore(task.id); await loadData(); notify('已撤销') } }) } catch { notify('更新失败') }
}
async function saveDetail() {
  if (!activeTask.value || !detailDraft.value || !detailDraft.value.title.trim()) return
  const task = activeTask.value
  const oldPriority = task.priority
  const draft = detailDraft.value
  const input: UpdateTaskInput = { title: draft.title.trim(), listId: draft.listId, dueDate: draft.dueDate || null, dueTime: draft.dueTime || null, reminderMinutesBefore: draft.reminderMinutesBefore, tagIds: draft.tagIds, priority: draft.priority, notes: draft.notes, recurrence: draft.recurrence === 'none' ? null : { frequency: draft.recurrence, interval: 1, endDate: draft.recurrenceEnd || null } }
  try {
    const updated = hasApi() ? await window.todoApi.tasks.update(task.id, input) : ({ ...task, ...input, recurrenceRuleId: draft.recurrence === 'none' ? null : (task.recurrenceRuleId || 'preview-rule'), updatedAt: new Date().toISOString() } as Task)
    Object.assign(task, updated, { isPinned: updated.isPinned ?? task.isPinned })
    if (draft.recurrence === 'none') recurrenceDrafts.delete(task.id); else recurrenceDrafts.set(task.id, { frequency: draft.recurrence, endDate: draft.recurrenceEnd })
    if (oldPriority !== task.priority) await moveTaskToGroupEnd(task)
    notify('已保存')
  } catch { notify('保存失败') }
}
async function removeTask(task: Task) {
  try { if (hasApi()) await window.todoApi.tasks.remove(task.id); tasks.value = tasks.value.filter(item => item.id !== task.id && item.parentTaskId !== task.id); detailOpen.value = false; selectedTaskId.value = null; notify('任务已删除', { label: '撤销', run: async () => { if (hasApi()) await window.todoApi.tasks.restoreRemoved(task.id); await loadData(); notify('已恢复任务') } }) } catch { notify('删除失败') }
}
async function addList() {
  const name = newListName.value.trim(); if (!name) return
  try {
    const list = hasApi() ? await window.todoApi.lists.create({ name, color: '#856AF9', isPinned: false }) : ({ id: crypto.randomUUID(), name, color: '#856AF9', sortOrder: lists.value.length, isPinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as TaskList)
    lists.value.push({ ...list, isPinned: list.isPinned ?? false }); activeView.value = `list:${list.id}`; newListName.value = ''; listComposerOpen.value = false; notify('清单已创建')
  } catch { notify('创建清单失败') }
}
async function addSubtask() { const title = newSubtaskTitle.value.trim(); if (!activeTask.value || !title) return; await createTaskAsSubtask(title); newSubtaskTitle.value = '' }
async function createTaskAsSubtask(title: string) {
  const input: CreateTaskInput = { title, parentTaskId: activeTask.value!.id, listId: activeTask.value!.listId, dueDate: activeTask.value!.dueDate, priority: 'none', isPinned: false }
  const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, isPinned: false, parentTaskId: activeTask.value!.id, recurrenceRuleId: null, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task)
  tasks.value.push({ ...task, isPinned: false }); notify('子任务已添加')
}

function taskGroup(task: Task) { return tasks.value.filter(item => !item.parentTaskId && item.isPinned === task.isPinned && item.priority === task.priority).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)) }
async function persistTaskOrder(ordered: Task[]) {
  ordered.forEach((task, index) => { task.sortOrder = index })
  if (hasApi()) await window.todoApi.tasks.reorder(ordered.map(task => task.id))
}
async function moveTaskToGroupEnd(task: Task) {
  const ordered = taskGroup(task).filter(item => item.id !== task.id)
  ordered.push(task)
  await persistTaskOrder(ordered)
}
async function setTaskPinned(task: Task, isPinned: boolean) {
  if (task.isPinned === isPinned) { await moveTaskToGroupEnd(task); return }
  try {
    if (hasApi()) await window.todoApi.tasks.update(task.id, { isPinned })
    task.isPinned = isPinned
    await moveTaskToGroupEnd(task)
    notify(isPinned ? '任务已置顶' : '已取消任务置顶')
  } catch { notify('置顶状态更新失败') }
}
async function setTaskPriority(task: Task, priority: TaskPriority) {
  closeMenus()
  if (task.priority === priority) return
  try {
    if (hasApi()) await window.todoApi.tasks.update(task.id, { priority })
    task.priority = priority
    if (selectedTaskId.value === task.id && detailDraft.value) detailDraft.value.priority = priority
    await moveTaskToGroupEnd(task)
    notify(`已设为${priorityLabel(priority)}`)
  } catch { notify('优先级更新失败') }
}
function startTaskDrag(event: DragEvent, task: Task) {
  if (!taskReorderEnabled.value) return
  draggedTaskId.value = task.id
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id) }
}
function endTaskDrag() { draggedTaskId.value = null; taskDropTargetId.value = null }
async function dropTaskBefore(target: Task) {
  const dragged = tasks.value.find(task => task.id === draggedTaskId.value)
  if (!dragged || dragged.id === target.id) return
  try {
    if (dragged.isPinned !== target.isPinned) await setTaskPinned(dragged, target.isPinned)
    if (dragged.priority !== target.priority) { notify('跨优先级拖动不会改变优先级'); return }
    const ordered = taskGroup(dragged).filter(task => task.id !== dragged.id)
    const targetIndex = ordered.findIndex(task => task.id === target.id)
    ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, dragged)
    await persistTaskOrder(ordered)
  } catch { notify('任务排序失败') } finally { endTaskDrag() }
}
async function dropTaskInZone(isPinned: boolean) {
  const task = tasks.value.find(item => item.id === draggedTaskId.value)
  if (!task) return
  try { await setTaskPinned(task, isPinned) } finally { endTaskDrag() }
}

function listGroup(list: TaskList) { return lists.value.filter(item => item.isPinned === list.isPinned).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) }
async function persistListOrder(ordered: TaskList[]) {
  ordered.forEach((list, index) => { list.sortOrder = index })
  if (hasApi()) await window.todoApi.lists.reorder(ordered.map(list => list.id))
}
async function moveListToGroupEnd(list: TaskList) {
  const ordered = listGroup(list).filter(item => item.id !== list.id)
  ordered.push(list)
  await persistListOrder(ordered)
}
async function setListPinned(list: TaskList, isPinned: boolean) {
  closeMenus()
  if (list.isPinned === isPinned) return
  try {
    if (hasApi()) await window.todoApi.lists.update(list.id, { isPinned })
    list.isPinned = isPinned
    await moveListToGroupEnd(list)
    notify(isPinned ? '清单已置顶' : '已取消清单置顶')
  } catch { notify('清单置顶状态更新失败') }
}
function startListDrag(event: DragEvent, list: TaskList) {
  draggedListId.value = list.id
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', list.id) }
}
function endListDrag() { draggedListId.value = null; listDropTargetId.value = null }
async function dropListBefore(target: TaskList) {
  const dragged = lists.value.find(list => list.id === draggedListId.value)
  if (!dragged || dragged.id === target.id) return
  try {
    const ordered = listGroup(dragged).filter(list => list.id !== dragged.id)
    if (dragged.isPinned !== target.isPinned) ordered.splice(target.isPinned ? 0 : ordered.length, 0, dragged)
    else {
      const targetIndex = ordered.findIndex(list => list.id === target.id)
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, dragged)
    }
    await persistListOrder(ordered)
  } catch { notify('清单排序失败') } finally { endListDrag() }
}
async function confirmListDelete() {
  const list = pendingListDelete.value
  if (!list) return
  try {
    if (hasApi()) await window.todoApi.lists.remove(list.id, { taskPolicy: listDeletePolicy.value })
    const affectedIds = new Set(tasks.value.filter(task => task.listId === list.id).map(task => task.id))
    if (listDeletePolicy.value === 'delete') tasks.value = tasks.value.filter(task => !affectedIds.has(task.id) && !affectedIds.has(task.parentTaskId || ''))
    else tasks.value.forEach(task => { if (task.listId === list.id) task.listId = null })
    lists.value = lists.value.filter(item => item.id !== list.id)
    if (activeListId.value === list.id) activeView.value = 'today'
    if (activeTask.value && affectedIds.has(activeTask.value.id)) {
      if (listDeletePolicy.value === 'delete') { detailOpen.value = false; selectedTaskId.value = null }
      else if (detailDraft.value) detailDraft.value.listId = null
    }
    pendingListDelete.value = null
    notify(listDeletePolicy.value === 'delete' ? '清单及任务已删除' : '清单已删除，任务已保留')
  } catch { notify('删除清单失败') }
}

function onWeekDrop(event: DragEvent, targetDate: string) { event.preventDefault(); const task = tasks.value.find(item => item.id === draggedTaskId.value); if (!task || task.dueDate === targetDate) return; task.dueDate = targetDate; if (hasApi()) window.todoApi.tasks.update(task.id, { dueDate: targetDate }).catch(() => notify('日期更新失败')); notify(`已移动到${dateLabel(targetDate)}`) }
function weekDates() { return Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return isoDate(date) }) }
function tasksForDate(date: string) { return filteredTasks.value.filter(task => task.dueDate === date) }
function focusQuickAdd() { quickInput.value?.focus() }
function closeMenus() { openListMenuId.value = null; openTaskMenuId.value = null }
function toggleListMenu(listId: string) { openTaskMenuId.value = null; openListMenuId.value = openListMenuId.value === listId ? null : listId }
function toggleTaskMenu(taskId: string) { openListMenuId.value = null; openTaskMenuId.value = openTaskMenuId.value === taskId ? null : taskId }
function requestListDelete(list: TaskList) { closeMenus(); listDeletePolicy.value = 'keep'; pendingListDelete.value = list }
async function exportBackup() { if (!hasApi()) { notify('请在桌面应用中导出备份'); return } try { const filePath = await window.todoApi.backup.export(); if (filePath) notify('备份已导出') } catch { notify('备份导出失败') } }
async function importBackup() { if (!hasApi()) { notify('请在桌面应用中恢复备份'); return } try { const result = await window.todoApi.backup.import(); if (result) { await loadData(); settingsOpen.value = false; notify(`已恢复 ${result.importedTasks} 个任务`) } } catch { notify('备份恢复失败，现有数据未改变') } }
function applySettings() { document.documentElement.dataset.theme = settings.value.theme; document.documentElement.dataset.density = settings.value.density }
async function saveSettings() { if (hasApi()) { settings.value = await window.todoApi.settings.update(settings.value); desktopStatus.value = await window.todoApi.desktop.status() } applySettings(); notify('偏好已保存') }
async function createFilter() { const name = newFilterName.value.trim(); if (!name || !hasApi()) return; const filter = await window.todoApi.filters.create({ name, criteria: { status: newFilterStatus.value, listId: newFilterListId.value === 'any' ? undefined : newFilterListId.value === 'inbox' ? null : newFilterListId.value, priorities: newFilterPriority.value === 'any' ? undefined : [newFilterPriority.value], tagIds: newFilterTagId.value === 'any' ? undefined : [newFilterTagId.value], due: newFilterDue.value, search: search.value.trim() || undefined }, sortOrder: savedFilters.value.length }); savedFilters.value.push(filter); newFilterName.value = ''; filterComposerOpen.value = false; activeView.value = `filter:${filter.id}`; notify('筛选已保存') }
async function removeFilter(filter: SavedFilter) { if (hasApi()) await window.todoApi.filters.remove(filter.id); savedFilters.value = savedFilters.value.filter(item => item.id !== filter.id); if (activeView.value === `filter:${filter.id}`) activeView.value = 'today'; notify('筛选已删除') }
async function runToastAction() { const action = toastAction.value; if (!action) return; toastAction.value = null; await action.run() }
function handleShortcut(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); focusQuickAdd() }
  if (event.key === '?') shortcutsOpen.value = true
  if (event.key === 'Escape') { closeMenus(); pendingDelete.value = null; pendingListDelete.value = null; settingsOpen.value = false; shortcutsOpen.value = false; detailOpen.value = false }
}

let removeDesktopListener: (() => void) | undefined
onMounted(() => { loadData(); window.addEventListener('keydown', handleShortcut); if (hasApi() && window.todoApi.desktop) removeDesktopListener = window.todoApi.desktop.onFocusQuickAdd((taskId) => { focusQuickAdd(); loadData().then(() => { if (taskId) { selectedTaskId.value = taskId; const task = tasks.value.find(item => item.id === taskId); if (task) selectTask(task) } }) }) })
onBeforeUnmount(() => { window.removeEventListener('keydown', handleShortcut); removeDesktopListener?.() })
</script>

<template>
  <div class="app-shell" @click="closeMenus">
    <aside class="sidebar">
      <div class="brand"><img class="brand-mark" :src="rumoFlowIcon" alt="Rumo-Flow" /><span class="brand-copy"><span>Rumo-<b>Flow</b></span><small>Todo List</small></span></div>
      <button class="primary-action" @click="focusQuickAdd"><span>＋</span> 新建任务 <kbd>Ctrl N</kbd></button>
      <nav class="nav-group">
        <button :class="['nav-item', { active: activeView === 'inbox' }]" @click="activeView = 'inbox'"><span>✦</span> 收集箱 <em>{{ tasks.filter(task => task.status === 'active' && task.listId === null).length }}</em></button>
        <button :class="['nav-item', { active: activeView === 'today' }]" @click="activeView = 'today'"><span>☀</span> 今天 <em>{{ tasks.filter(task => task.status === 'active' && (!task.dueDate || task.dueDate <= todayIso)).length }}</em></button>
        <button :class="['nav-item', { active: activeView === 'upcoming' }]" @click="activeView = 'upcoming'"><span>◷</span> 即将到期</button>
        <button :class="['nav-item', { active: activeView === 'week' }]" @click="activeView = 'week'"><span>▦</span> 本周</button>
        <button :class="['nav-item', { active: activeView === 'completed' }]" @click="activeView = 'completed'"><span>✓</span> 已完成 <em>{{ completedCount }}</em></button>
      </nav>
      <div class="sidebar-section saved-filter-section"><div class="section-title">保存的筛选 <button class="icon-button" aria-label="新建筛选" @click.stop="filterComposerOpen = !filterComposerOpen">＋</button></div><div v-if="filterComposerOpen" class="list-composer" @click.stop><input v-model="newFilterName" autofocus placeholder="筛选名称" @keydown.enter="createFilter" /><SelectField v-model="newFilterStatus" aria-label="筛选状态" :options="[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'all', label: '全部' }]" /><SelectField v-model="newFilterListId" aria-label="筛选清单" :options="[{ value: 'any', label: '任意清单' }, { value: 'inbox', label: '收集箱' }, ...sortedLists.map(list => ({ value: list.id, label: list.name }))]" /><SelectField v-model="newFilterPriority" aria-label="筛选优先级" :options="[{ value: 'any', label: '任意优先级' }, { value: 'high', label: 'P1' }, { value: 'medium', label: 'P2' }, { value: 'low', label: 'P3' }, { value: 'none', label: '无' }]" /><SelectField v-model="newFilterTagId" aria-label="筛选标签" :options="[{ value: 'any', label: '任意标签' }, ...tags.map(tag => ({ value: tag.id, label: `#${tag.name}` }))]" /><SelectField v-model="newFilterDue" aria-label="筛选日期" :options="[{ value: 'any', label: '任意日期' }, { value: 'today', label: '今天' }, { value: 'overdue', label: '已逾期' }, { value: 'next7', label: '未来 7 天' }, { value: 'none', label: '无日期' }]" /><button @click="createFilter">✓</button></div><div v-for="filter in savedFilters" :key="filter.id" :class="['nav-item', { active: activeView === `filter:${filter.id}` }]" role="button" tabindex="0" @click="activeView = `filter:${filter.id}`"><span>⌕</span><span class="list-name">{{ filter.name }}</span><button class="inline-remove" aria-label="删除筛选" @click.stop="removeFilter(filter)">×</button></div></div>
      <div class="sidebar-section">
        <div class="section-title">我的清单 <button class="icon-button" aria-label="新建清单" @click.stop="listComposerOpen = !listComposerOpen">＋</button></div>
        <Transition name="composer"><div v-if="listComposerOpen" class="list-composer" @click.stop><input v-model="newListName" autofocus placeholder="清单名称" @keydown.enter="addList" @keydown.esc="listComposerOpen = false" /><button @click="addList">✓</button></div></Transition>
        <div v-if="pinnedLists.length" class="list-group-label">置顶</div>
        <TransitionGroup name="list-row" tag="div" class="list-items">
        <div v-for="list in pinnedLists" :key="list.id" :class="['list-row', { 'drag-target': listDropTargetId === list.id }]" draggable="true" @dragstart="startListDrag($event, list)" @dragend="endListDrag" @dragover.prevent="listDropTargetId = list.id" @drop.stop="dropListBefore(list)">
          <button :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`"><i class="list-dot" :style="{ background: list.color || '#856AF9' }"></i><span class="list-name">{{ list.name }}</span><em>{{ listCount(list.id) }}</em></button>
          <span class="pin-indicator">置顶</span>
          <button class="list-menu-button" aria-label="清单操作" @click.stop="toggleListMenu(list.id)">···</button>
          <Transition name="popup"><div v-if="openListMenuId === list.id" class="popup-menu list-popup" @click.stop><button @click="setListPinned(list, false)">取消置顶</button><button class="menu-danger" @click="requestListDelete(list)">删除清单</button></div></Transition>
        </div>
        </TransitionGroup>
        <div v-if="pinnedLists.length" class="list-group-label">其他清单</div>
        <TransitionGroup name="list-row" tag="div" class="list-items">
        <div v-for="list in regularLists" :key="list.id" :class="['list-row', { 'drag-target': listDropTargetId === list.id }]" draggable="true" @dragstart="startListDrag($event, list)" @dragend="endListDrag" @dragover.prevent="listDropTargetId = list.id" @drop.stop="dropListBefore(list)">
          <button :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`"><i class="list-dot" :style="{ background: list.color || '#856AF9' }"></i><span class="list-name">{{ list.name }}</span><em>{{ listCount(list.id) }}</em></button>
          <button class="list-menu-button" aria-label="清单操作" @click.stop="toggleListMenu(list.id)">···</button>
          <Transition name="popup"><div v-if="openListMenuId === list.id" class="popup-menu list-popup" @click.stop><button @click="setListPinned(list, true)">置顶清单</button><button class="menu-danger" @click="requestListDelete(list)">删除清单</button></div></Transition>
        </div>
        </TransitionGroup>
      </div>
      <div class="sidebar-footer"><div class="mini-progress"><div><span>今日进度</span><strong>{{ pendingCount ? Math.round(completedCount / (completedCount + pendingCount) * 100) : 100 }}%</strong></div><div class="progress-track"><span :style="{ width: `${pendingCount ? completedCount / (completedCount + pendingCount) * 100 : 100}%` }"></span></div></div><button class="nav-item muted" @click="settingsOpen = true"><span>⚙</span> 设置</button></div>
    </aside>
    <main class="main-content">
      <header class="page-header"><Transition name="title" mode="out-in"><div :key="activeView"><p class="eyebrow">{{ viewHint }}</p><h1>{{ viewTitle }}</h1></div></Transition><div class="header-actions"><label class="group-select"><span>分组</span><SelectField v-model="groupBy" aria-label="任务分组" :options="[{ value: 'none', label: '不分组' }, { value: 'list', label: '按清单' }, { value: 'priority', label: '按优先级' }, { value: 'tag', label: '按标签' }]" /></label><label class="search-box"><span>⌕</span><input v-model="search" placeholder="搜索任务" /></label></div></header>
      <section class="content-inner">
        <div class="quick-add"><span class="quick-icon">＋</span><input ref="quickInput" v-model="quickTitle" placeholder="添加一个任务，按 Enter 保存…" @keydown.enter="createTask()" /><span class="quick-hint">Enter</span></div>
        <div v-if="temporaryTag" class="temporary-filter"><span>当前标签：<strong>#{{ temporaryTag.name }}</strong></span><button @click="temporaryTagId = null">清除</button></div>
        <Transition name="view" mode="out-in">
          <div :key="activeView" class="view-content">
            <template v-if="activeView === 'week'">
              <div class="week-board"><div v-for="date in weekDates()" :key="date" class="day-column" @dragover.prevent @drop="onWeekDrop($event, date)"><div class="day-heading" :class="{ today: date === todayIso }"><span>{{ new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span><b>{{ new Date(`${date}T00:00:00`).getDate() }}</b></div><div v-if="!tasksForDate(date).length" class="day-empty">拖放任务到这里</div><TransitionGroup name="task-card" tag="div" class="day-task-items"><article v-for="task in tasksForDate(date)" :key="task.id" class="task-card" draggable="true" @dragstart="draggedTaskId = task.id" @click="selectTask(task)"><button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><span class="task-card-body"><span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]">♨ {{ priorityCode(task.priority) }}</span><span class="task-title">{{ task.title }}</span></span></article></TransitionGroup></div></div>
            </template>
            <template v-else-if="loading"><div class="loading-state"><span class="spinner"></span> 正在加载任务…</div></template>
            <template v-else-if="!filteredTasks.length"><div class="empty-state"><img class="empty-orbit" :src="rumoFlowIcon" alt="" aria-hidden="true" /><h2>{{ search ? '没有匹配的任务' : activeView === 'completed' ? '还没有完成的任务' : '今天没有待办' }}</h2><p>{{ search ? '换一个关键词试试' : '清空思绪，开始做一件小事吧' }}</p><button v-if="!search" class="text-action" @click="createTask('整理我的下一步')">＋ 添加第一项任务</button></div></template>
            <div v-else class="task-list">
          <section v-if="taskReorderEnabled || pinnedTasks.length" class="task-zone pinned-zone" :class="{ empty: !pinnedTasks.length }" @dragover.prevent @drop.stop="dropTaskInZone(true)">
            <div class="task-zone-heading"><span>置顶</span><small v-if="taskReorderEnabled">拖到这里置顶</small></div>
            <div v-if="!pinnedTasks.length" class="pin-drop-hint">暂无置顶任务</div>
            <TransitionGroup name="task-row" tag="div" class="task-items">
            <div v-for="task in pinnedTasks" :key="task.id" :class="['task-row', { 'drag-target': taskDropTargetId === task.id }]" :draggable="taskReorderEnabled" @dragstart="startTaskDrag($event, task)" @dragend="endTaskDrag" @dragover.prevent="taskDropTargetId = task.id" @drop.stop="dropTaskBefore(task)">
              <button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><div class="task-main" @click="selectTask(task)"><div class="task-title-line"><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span><span class="pinned-task-mark">置顶</span><span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]" :title="priorityLabel(task.priority)">♨ {{ priorityCode(task.priority) }}</span></div><div class="task-meta"><span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span><span v-if="lists.find(list => list.id === task.listId)" class="list-meta"><i class="list-dot" :style="{ background: lists.find(list => list.id === task.listId)?.color || '#856AF9' }"></i>{{ lists.find(list => list.id === task.listId)?.name }}</span><span v-if="task.notes">▤ 有备注</span><button v-for="tag in task.tags.slice(0, 3)" :key="tag.id" class="task-tag" @click.stop="filterByTag(tag)">#{{ tag.name }}</button><span v-if="task.tags.length > 3" class="task-tag-more">+{{ task.tags.length - 3 }}</span></div></div><div class="row-actions"><button class="icon-button" aria-label="任务操作" @click.stop="toggleTaskMenu(task.id)">···</button><div v-if="openTaskMenuId === task.id" class="popup-menu task-popup" @click.stop><button @click="setTaskPinned(task, false); closeMenus()">取消置顶</button><div class="menu-label">优先级</div><button v-for="priority in (['high','medium','low','none'] as TaskPriority[])" :key="priority" :class="{ selected: task.priority === priority }" @click="setTaskPriority(task, priority)">{{ priority === 'none' ? '无优先级' : `${priorityCode(priority)} · ${priorityLabel(priority)}` }}</button></div></div>
            </div>
            </TransitionGroup>
          </section>
          <section class="task-zone regular-zone" @dragover.prevent @drop.stop="dropTaskInZone(false)">
            <div v-if="pinnedTasks.length" class="task-zone-heading"><span>其他任务</span></div>
            <TransitionGroup name="task-row" tag="div" class="task-items">
            <div v-for="task in groupedRegularTasks" :key="task.id" :class="['task-row', { 'drag-target': taskDropTargetId === task.id }]" :draggable="taskReorderEnabled && groupBy === 'none'" @dragstart="startTaskDrag($event, task)" @dragend="endTaskDrag" @dragover.prevent="taskDropTargetId = task.id" @drop.stop="dropTaskBefore(task)">
              <button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><div class="task-main" @click="selectTask(task)"><div class="task-title-line"><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span><span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]" :title="priorityLabel(task.priority)">♨ {{ priorityCode(task.priority) }}</span></div><div class="task-meta"><span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span><span v-if="lists.find(list => list.id === task.listId)" class="list-meta"><i class="list-dot" :style="{ background: lists.find(list => list.id === task.listId)?.color || '#856AF9' }"></i>{{ lists.find(list => list.id === task.listId)?.name }}</span><span v-if="task.notes">▤ 有备注</span><button v-for="tag in task.tags.slice(0, 3)" :key="tag.id" class="task-tag" @click.stop="filterByTag(tag)">#{{ tag.name }}</button><span v-if="task.tags.length > 3" class="task-tag-more">+{{ task.tags.length - 3 }}</span></div></div><div class="row-actions"><button class="icon-button" aria-label="任务操作" @click.stop="toggleTaskMenu(task.id)">···</button><div v-if="openTaskMenuId === task.id" class="popup-menu task-popup" @click.stop><button @click="setTaskPinned(task, true); closeMenus()">置顶任务</button><div class="menu-label">优先级</div><button v-for="priority in (['high','medium','low','none'] as TaskPriority[])" :key="priority" :class="{ selected: task.priority === priority }" @click="setTaskPriority(task, priority)">{{ priority === 'none' ? '无优先级' : `${priorityCode(priority)} · ${priorityLabel(priority)}` }}</button></div></div>
            </div>
            </TransitionGroup>
              </section>
            </div>
          </div>
        </Transition>
      </section>
    </main>
    <Transition name="drawer"><div v-if="detailOpen && activeTask" class="drawer-layer"><div class="drawer-scrim" aria-hidden="true" @click="detailOpen = false"></div><aside class="detail-drawer"><header class="drawer-header"><span>任务详情</span><button class="icon-button" aria-label="关闭" @click="detailOpen = false">×</button></header><div class="drawer-body"><div class="detail-hero"><input v-if="detailDraft" v-model="detailDraft.title" class="title-input" placeholder="任务标题" /><button class="detail-status" type="button" @click="toggleTask(activeTask)"><span class="check" :class="{ checked: activeTask.status === 'completed' }">{{ activeTask.status === 'completed' ? '✓' : '' }}</span><span>{{ activeTask.status === 'completed' ? '已完成' : '标记为完成' }}</span></button></div><section class="detail-card subtasks"><div class="detail-card__header"><div><span class="detail-card__eyebrow">进度</span><h3>子任务</h3></div><small>{{ subtasks.filter(task => task.status === 'completed').length }}/{{ subtasks.length }}</small></div><div class="subtask-composer"><input v-model="newSubtaskTitle" placeholder="添加子任务…" @keydown.enter="addSubtask" /><button aria-label="添加子任务" @click="addSubtask">＋</button></div><TransitionGroup name="subtask" tag="div" class="subtask-items"><div v-for="subtask in subtasks" :key="subtask.id" class="subtask-row"><button class="check mini" :class="{ checked: subtask.status === 'completed' }" @click="toggleTask(subtask)">{{ subtask.status === 'completed' ? '✓' : '' }}</button><span :class="{ done: subtask.status === 'completed' }">{{ subtask.title }}</span></div></TransitionGroup></section><section v-if="detailDraft" class="detail-card"><div class="detail-card__header"><div><span class="detail-card__eyebrow">时间与归属</span><h3>计划信息</h3></div></div><div class="field"><span>清单</span><SelectField v-model="detailDraft.listId" aria-label="任务清单" :options="[{ value: null, label: '无清单' }, ...sortedLists.map(list => ({ value: list.id, label: list.name }))]" /></div><label class="field"><span>截止日期</span><input v-model="detailDraft.dueDate" type="date" /></label><label class="field"><span>截止时间</span><input v-model="detailDraft.dueTime" type="time" /></label><div class="field"><span>提醒</span><SelectField v-model="detailDraft.reminderMinutesBefore" aria-label="任务提醒" :options="[{ value: null, label: '不提醒' }, { value: 5, label: '提前 5 分钟' }, { value: 15, label: '提前 15 分钟' }, { value: 60, label: '提前 1 小时' }, { value: 1440, label: '提前 1 天' }]" /></div></section><section v-if="detailDraft" class="detail-card"><div class="detail-card__header"><div><span class="detail-card__eyebrow">分类与重要程度</span><h3>组织信息</h3></div></div><fieldset class="field tag-picker"><legend>标签</legend><div class="tag-picker__content"><div class="tag-search-row"><input v-model="tagQuery" placeholder="搜索或输入新标签" @keydown.enter="createTagFromDetail" /></div><div class="tag-options"><label v-for="tag in visibleDetailTags" :key="tag.id"><input v-model="detailDraft.tagIds" type="checkbox" :value="tag.id"><span>#{{ tag.name }}</span></label><button v-if="canCreateDetailTag" type="button" class="tag-create-button" @click="createTagFromDetail">＋ 创建并添加“{{ tagQuery.trim() }}”</button><span v-if="!visibleDetailTags.length && !canCreateDetailTag" class="tag-empty">暂无标签</span></div></div></fieldset><div class="field"><span>优先级</span><SelectField v-model="detailDraft.priority" aria-label="任务优先级" :options="[{ value: 'none', label: '无优先级' }, { value: 'low', label: 'P3 · 低' }, { value: 'medium', label: 'P2 · 中' }, { value: 'high', label: 'P1 · 高' }]" /></div></section><section v-if="detailDraft" class="detail-card"><div class="detail-card__header"><div><span class="detail-card__eyebrow">自动计划</span><h3>重复</h3></div></div><div class="field"><span>频率</span><SelectField v-model="detailDraft.recurrence" aria-label="任务重复频率" :options="[{ value: 'none', label: '不重复' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]" /></div><label v-if="detailDraft.recurrence !== 'none'" class="field"><span>结束重复</span><input v-model="detailDraft.recurrenceEnd" type="date" /></label></section><section v-if="detailDraft" class="detail-card notes-card"><div class="detail-card__header"><div><span class="detail-card__eyebrow">补充内容</span><h3>备注</h3></div></div><textarea v-model="detailDraft.notes" rows="5" placeholder="记录一些想法…"></textarea></section></div><footer class="drawer-footer"><button class="danger-link" @click="pendingDelete = activeTask">删除任务</button><button class="save-button" @click="saveDetail">保存更改</button></footer></aside></div></Transition>
    <Transition name="dialog"><div v-if="pendingDelete" class="dialog-backdrop" @click.self="pendingDelete = null"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div class="dialog-icon">!</div><h2 id="delete-title">删除这个任务？</h2><p>“{{ pendingDelete.title }}”及其子任务将被永久删除，此操作无法撤销。</p><div class="dialog-actions"><button class="cancel-button" @click="pendingDelete = null">取消</button><button class="delete-button" @click="removeTask(pendingDelete); pendingDelete = null">确认删除</button></div></section></div></Transition>
    <Transition name="dialog"><div v-if="pendingListDelete" class="dialog-backdrop" @click.self="pendingListDelete = null"><section class="confirm-dialog list-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-list-title"><div class="dialog-icon">!</div><h2 id="delete-list-title">删除清单“{{ pendingListDelete.name }}”？</h2><p>请选择如何处理清单中的任务。</p><label class="delete-policy"><input v-model="listDeletePolicy" type="radio" value="keep" /><span><strong>保留任务</strong><small>任务将转为“无清单”</small></span></label><label class="delete-policy danger-policy"><input v-model="listDeletePolicy" type="radio" value="delete" /><span><strong>同时删除任务</strong><small>清单中的任务和子任务将永久删除</small></span></label><div class="dialog-actions"><button class="cancel-button" @click="pendingListDelete = null">取消</button><button class="delete-button" @click="confirmListDelete">确认删除</button></div></section></div></Transition>
    <Transition name="dialog"><div v-if="settingsOpen" class="dialog-backdrop" @click.self="settingsOpen = false"><section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><p>Rumo-Flow</p><h2 id="settings-title">设置与数据</h2></div><button class="icon-button" aria-label="关闭设置" @click="settingsOpen = false">×</button></header><div class="settings-section"><div><strong>界面主题</strong><p>选择适合当前环境的明暗外观。</p></div><SelectField v-model="settings.theme" aria-label="界面主题" :options="[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]" @change="saveSettings" /></div><div class="settings-section"><div><strong>内容密度</strong><p>舒适模式留白更多，紧凑模式显示更多任务。</p></div><SelectField v-model="settings.density" aria-label="内容密度" :options="[{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }]" @change="saveSettings" /></div><div class="settings-section"><div><strong>全局快捷键</strong><p>{{ desktopStatus.globalShortcutRegistered ? `已启用 ${desktopStatus.globalShortcut}` : `${desktopStatus.globalShortcut} 注册失败，请检查快捷键冲突` }}</p></div><button class="secondary-button" @click="shortcutsOpen = true">快捷键帮助</button></div><div class="settings-section tag-management"><div class="tag-management-heading"><strong>标签管理</strong><p>创建、改名和调整颜色；删除只解除任务关联。</p></div><div class="tag-create-row"><input v-model="settingsTagName" placeholder="新标签名称" @keydown.enter="createTagFromSettings" /><button class="secondary-button" @click="createTagFromSettings">创建</button></div><div v-if="tags.length" class="managed-tag-list"><div v-for="tag in tags" :key="tag.id" class="managed-tag-row"><input v-model="managedTagDrafts[tag.id].name" class="managed-tag-name" :aria-label="`标签名称 ${tag.name}`" /><input v-model="managedTagDrafts[tag.id].color" type="color" :aria-label="`标签颜色 ${tag.name}`" /><button class="secondary-button" @click="updateManagedTag(tag)">保存</button><button class="danger-link" @click="deleteManagedTag(tag)">删除</button></div></div><p v-else class="tag-empty">还没有标签</p></div><div class="settings-section"><div><strong>导出数据备份</strong><p>将清单、任务、标签、筛选和重复规则保存为 JSON。</p></div><button class="secondary-button" @click="exportBackup">导出备份</button></div><div class="settings-section"><div><strong>从备份恢复</strong><p>恢复前自动保存当前数据；v1/v2 备份均可导入。</p></div><button class="secondary-button" @click="importBackup">选择文件</button></div><footer>数据仅保存在当前设备 · Rumo-Flow</footer></section></div></Transition>
    <Transition name="dialog"><div v-if="shortcutsOpen" class="dialog-backdrop" @click.self="shortcutsOpen = false"><section class="confirm-dialog shortcut-dialog"><h2>键盘快捷键</h2><div class="shortcut-row"><span>聚焦新任务</span><kbd>Ctrl N</kbd></div><div class="shortcut-row"><span>全局快速捕获</span><kbd>Ctrl Alt Space</kbd></div><div class="shortcut-row"><span>关闭浮层</span><kbd>Esc</kbd></div><div class="shortcut-row"><span>打开帮助</span><kbd>?</kbd></div><button class="save-button" @click="shortcutsOpen = false">知道了</button></section></div></Transition>
    <Transition name="toast"><div v-if="toast" class="toast">✓ {{ toast }}<button v-if="toastAction" @click="runToastAction">{{ toastAction.label }}</button></div></Transition>
  </div>
</template>
