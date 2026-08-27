<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CreateTaskInput, RecurrenceFrequency, Task, TaskList, TaskPriority, UpdateTaskInput } from './shared/contracts'

type View = 'today' | 'upcoming' | 'week' | 'completed' | `list:${string}`
type Draft = { title: string; listId: string | null; dueDate: string; priority: TaskPriority; notes: string; recurrence: RecurrenceFrequency | 'none'; recurrenceEnd: string }

const hasApi = () => typeof window !== 'undefined' && !!window.todoApi
const tasks = ref<Task[]>([])
const lists = ref<TaskList[]>([])
const activeView = ref<View>('today')
const selectedTaskId = ref<string | null>(null)
const quickTitle = ref('')
const quickInput = ref<HTMLInputElement | null>(null)
const search = ref('')
const detailOpen = ref(false)
const detailDraft = ref<Draft | null>(null)
const pendingDelete = ref<Task | null>(null)
const pendingListDelete = ref<TaskList | null>(null)
const listDeletePolicy = ref<'keep' | 'delete'>('keep')
const settingsOpen = ref(false)
const listComposerOpen = ref(false)
const newListName = ref('')
const newSubtaskTitle = ref('')
const openListMenuId = ref<string | null>(null)
const openTaskMenuId = ref<string | null>(null)
const recurrenceDrafts = new Map<string, { frequency: RecurrenceFrequency; endDate: string }>()
const toast = ref('')
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

function notify(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2800)
}

async function loadData() {
  loading.value = true
  try {
    if (hasApi()) {
      lists.value = (await window.todoApi.lists.list()).map(list => ({ ...list, isPinned: list.isPinned ?? false }))
      tasks.value = (await window.todoApi.tasks.list({})).map(task => ({ ...task, isPinned: task.isPinned ?? false }))
    } else {
      lists.value = fallbackLists
      tasks.value = fallbackTasks
    }
  } catch { notify('数据加载失败，请稍后重试') } finally { loading.value = false }
}

const activeListId = computed(() => activeView.value.startsWith('list:') ? activeView.value.slice(5) : null)
const viewTitle = computed(() => ({ today: '今天', upcoming: '即将到期', week: '本周', completed: '已完成' }[activeView.value as string] || lists.value.find(list => list.id === activeListId.value)?.name || '待办'))
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
    if (activeView.value === 'today' && (!task.dueDate || task.dueDate > todayIso)) return false
    if (activeView.value === 'upcoming' && (!task.dueDate || task.dueDate < todayIso || task.dueDate > isoDate(new Date(today.getTime() + 30 * 86400000)))) return false
    if (activeView.value === 'week' && (!task.dueDate || task.dueDate < todayIso || task.dueDate > isoDate(weekEnd))) return false
    return !q || task.title.toLowerCase().includes(q) || task.notes.toLowerCase().includes(q)
  }).sort(compareTasks)
})
const pinnedTasks = computed(() => filteredTasks.value.filter(task => task.isPinned))
const regularTasks = computed(() => filteredTasks.value.filter(task => !task.isPinned))
const sortedLists = computed(() => [...lists.value].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
const pinnedLists = computed(() => sortedLists.value.filter(list => list.isPinned))
const regularLists = computed(() => sortedLists.value.filter(list => !list.isPinned))
const activeTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) || null)
const subtasks = computed(() => activeTask.value ? tasks.value.filter(task => task.parentTaskId === activeTask.value!.id).sort((a, b) => a.sortOrder - b.sortOrder) : [])
const completedCount = computed(() => tasks.value.filter(task => task.status === 'completed').length)
const pendingCount = computed(() => tasks.value.filter(task => task.status === 'active').length)
const listCount = (id: string) => tasks.value.filter(task => task.listId === id && task.status === 'active').length

function selectTask(task: Task) {
  closeMenus()
  selectedTaskId.value = task.id
  detailOpen.value = true
  const savedRecurrence = recurrenceDrafts.get(task.id)
  detailDraft.value = { title: task.title, listId: task.listId, dueDate: task.dueDate || '', priority: task.priority, notes: task.notes, recurrence: savedRecurrence?.frequency || (task.recurrenceRuleId ? 'daily' : 'none'), recurrenceEnd: savedRecurrence?.endDate || '' }
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
  const clean = title.trim(); if (!clean) return
  const input: CreateTaskInput = { title: clean, listId: activeListId.value, dueDate: activeView.value === 'today' ? todayIso : null, priority: 'none', notes: '', isPinned: false }
  try {
    const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, isPinned: false, parentTaskId: null, recurrenceRuleId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task)
    tasks.value.push({ ...task, isPinned: task.isPinned ?? false }); quickTitle.value = ''; notify('任务已添加')
  } catch { notify('添加失败') }
}
async function toggleTask(task: Task) {
  try { if (hasApi()) task.status === 'completed' ? await window.todoApi.tasks.restore(task.id) : await window.todoApi.tasks.complete(task.id); task.status = task.status === 'completed' ? 'active' : 'completed'; task.completedAt = task.status === 'active' ? null : new Date().toISOString(); notify(task.status === 'completed' ? '已完成' : '已恢复') } catch { notify('更新失败') }
}
async function saveDetail() {
  if (!activeTask.value || !detailDraft.value || !detailDraft.value.title.trim()) return
  const task = activeTask.value
  const oldPriority = task.priority
  const draft = detailDraft.value
  const input: UpdateTaskInput = { title: draft.title.trim(), listId: draft.listId, dueDate: draft.dueDate || null, priority: draft.priority, notes: draft.notes, recurrence: draft.recurrence === 'none' ? null : { frequency: draft.recurrence, interval: 1, endDate: draft.recurrenceEnd || null } }
  try {
    const updated = hasApi() ? await window.todoApi.tasks.update(task.id, input) : ({ ...task, ...input, recurrenceRuleId: draft.recurrence === 'none' ? null : (task.recurrenceRuleId || 'preview-rule'), updatedAt: new Date().toISOString() } as Task)
    Object.assign(task, updated, { isPinned: updated.isPinned ?? task.isPinned })
    if (draft.recurrence === 'none') recurrenceDrafts.delete(task.id); else recurrenceDrafts.set(task.id, { frequency: draft.recurrence, endDate: draft.recurrenceEnd })
    if (oldPriority !== task.priority) await moveTaskToGroupEnd(task)
    notify('已保存')
  } catch { notify('保存失败') }
}
async function removeTask(task: Task) {
  try { if (hasApi()) await window.todoApi.tasks.remove(task.id); tasks.value = tasks.value.filter(item => item.id !== task.id && item.parentTaskId !== task.id); detailOpen.value = false; selectedTaskId.value = null; notify('任务已删除') } catch { notify('删除失败') }
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
function handleShortcut(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); focusQuickAdd() }
  if (event.key === 'Escape') { closeMenus(); pendingDelete.value = null; pendingListDelete.value = null; settingsOpen.value = false; detailOpen.value = false }
}

onMounted(() => { loadData(); window.addEventListener('keydown', handleShortcut) })
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))
</script>

<template>
  <div class="app-shell" @click="closeMenus">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">✦</span><span class="brand-copy"><span>Rumo-<b>Flow</b></span><small>Todo List</small></span></div>
      <button class="primary-action" @click="focusQuickAdd"><span>＋</span> 新建任务 <kbd>Ctrl N</kbd></button>
      <nav class="nav-group">
        <button :class="['nav-item', { active: activeView === 'today' }]" @click="activeView = 'today'"><span>☀</span> 今天 <em>{{ tasks.filter(task => task.status === 'active' && (!task.dueDate || task.dueDate <= todayIso)).length }}</em></button>
        <button :class="['nav-item', { active: activeView === 'upcoming' }]" @click="activeView = 'upcoming'"><span>◷</span> 即将到期</button>
        <button :class="['nav-item', { active: activeView === 'week' }]" @click="activeView = 'week'"><span>▦</span> 本周</button>
        <button :class="['nav-item', { active: activeView === 'completed' }]" @click="activeView = 'completed'"><span>✓</span> 已完成 <em>{{ completedCount }}</em></button>
      </nav>
      <div class="sidebar-section">
        <div class="section-title">我的清单 <button class="icon-button" aria-label="新建清单" @click.stop="listComposerOpen = !listComposerOpen">＋</button></div>
        <div v-if="listComposerOpen" class="list-composer" @click.stop><input v-model="newListName" autofocus placeholder="清单名称" @keydown.enter="addList" @keydown.esc="listComposerOpen = false" /><button @click="addList">✓</button></div>
        <div v-if="pinnedLists.length" class="list-group-label">置顶</div>
        <div v-for="list in pinnedLists" :key="list.id" :class="['list-row', { 'drag-target': listDropTargetId === list.id }]" draggable="true" @dragstart="startListDrag($event, list)" @dragend="endListDrag" @dragover.prevent="listDropTargetId = list.id" @drop.stop="dropListBefore(list)">
          <button :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`"><i class="list-dot" :style="{ background: list.color || '#856AF9' }"></i><span class="list-name">{{ list.name }}</span><em>{{ listCount(list.id) }}</em></button>
          <span class="pin-indicator">置顶</span>
          <button class="list-menu-button" aria-label="清单操作" @click.stop="toggleListMenu(list.id)">···</button>
          <div v-if="openListMenuId === list.id" class="popup-menu list-popup" @click.stop><button @click="setListPinned(list, false)">取消置顶</button><button class="menu-danger" @click="requestListDelete(list)">删除清单</button></div>
        </div>
        <div v-if="pinnedLists.length" class="list-group-label">其他清单</div>
        <div v-for="list in regularLists" :key="list.id" :class="['list-row', { 'drag-target': listDropTargetId === list.id }]" draggable="true" @dragstart="startListDrag($event, list)" @dragend="endListDrag" @dragover.prevent="listDropTargetId = list.id" @drop.stop="dropListBefore(list)">
          <button :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`"><i class="list-dot" :style="{ background: list.color || '#856AF9' }"></i><span class="list-name">{{ list.name }}</span><em>{{ listCount(list.id) }}</em></button>
          <button class="list-menu-button" aria-label="清单操作" @click.stop="toggleListMenu(list.id)">···</button>
          <div v-if="openListMenuId === list.id" class="popup-menu list-popup" @click.stop><button @click="setListPinned(list, true)">置顶清单</button><button class="menu-danger" @click="requestListDelete(list)">删除清单</button></div>
        </div>
      </div>
      <div class="sidebar-footer"><div class="mini-progress"><div><span>今日进度</span><strong>{{ pendingCount ? Math.round(completedCount / (completedCount + pendingCount) * 100) : 100 }}%</strong></div><div class="progress-track"><span :style="{ width: `${pendingCount ? completedCount / (completedCount + pendingCount) * 100 : 100}%` }"></span></div></div><button class="nav-item muted" @click="settingsOpen = true"><span>⚙</span> 设置</button></div>
    </aside>
    <main class="main-content">
      <header class="page-header"><div><p class="eyebrow">{{ viewHint }}</p><h1>{{ viewTitle }}</h1></div><div class="header-actions"><label class="search-box"><span>⌕</span><input v-model="search" placeholder="搜索任务" /></label><button class="avatar">R</button></div></header>
      <section class="content-inner">
        <div class="quick-add"><span class="quick-icon">＋</span><input ref="quickInput" v-model="quickTitle" placeholder="添加一个任务，按 Enter 保存…" @keydown.enter="createTask()" /><span class="quick-hint">Enter</span></div>
        <template v-if="activeView === 'week'">
          <div class="week-board"><div v-for="date in weekDates()" :key="date" class="day-column" @dragover.prevent @drop="onWeekDrop($event, date)"><div class="day-heading" :class="{ today: date === todayIso }"><span>{{ new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span><b>{{ new Date(`${date}T00:00:00`).getDate() }}</b></div><div v-if="!tasksForDate(date).length" class="day-empty">拖放任务到这里</div><article v-for="task in tasksForDate(date)" :key="task.id" class="task-card" draggable="true" @dragstart="draggedTaskId = task.id" @click="selectTask(task)"><button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><span class="task-title">{{ task.title }}</span><span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]">♨ {{ priorityCode(task.priority) }}</span></article></div></div>
        </template>
        <template v-else-if="loading"><div class="loading-state"><span class="spinner"></span> 正在加载任务…</div></template>
        <template v-else-if="!filteredTasks.length"><div class="empty-state"><div class="empty-orbit">✦</div><h2>{{ search ? '没有匹配的任务' : activeView === 'completed' ? '还没有完成的任务' : '今天没有待办' }}</h2><p>{{ search ? '换一个关键词试试' : '清空思绪，开始做一件小事吧' }}</p><button v-if="!search" class="text-action" @click="createTask('整理我的下一步')">＋ 添加第一项任务</button></div></template>
        <div v-else class="task-list">
          <section v-if="taskReorderEnabled || pinnedTasks.length" class="task-zone pinned-zone" :class="{ empty: !pinnedTasks.length }" @dragover.prevent @drop.stop="dropTaskInZone(true)">
            <div class="task-zone-heading"><span>置顶</span><small v-if="taskReorderEnabled">拖到这里置顶</small></div>
            <div v-if="!pinnedTasks.length" class="pin-drop-hint">暂无置顶任务</div>
            <div v-for="task in pinnedTasks" :key="task.id" :class="['task-row', { 'drag-target': taskDropTargetId === task.id }]" :draggable="taskReorderEnabled" @dragstart="startTaskDrag($event, task)" @dragend="endTaskDrag" @dragover.prevent="taskDropTargetId = task.id" @drop.stop="dropTaskBefore(task)" @click="selectTask(task)">
              <button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><div class="task-main"><div class="task-title-line"><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span><span class="pinned-task-mark">置顶</span><span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]" :title="priorityLabel(task.priority)">♨ {{ priorityCode(task.priority) }}</span></div><div class="task-meta"><span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span><span v-if="lists.find(list => list.id === task.listId)" class="list-meta"><i class="list-dot" :style="{ background: lists.find(list => list.id === task.listId)?.color || '#856AF9' }"></i>{{ lists.find(list => list.id === task.listId)?.name }}</span><span v-if="task.notes">▤ 有备注</span></div></div><div class="row-actions"><button class="icon-button" aria-label="任务操作" @click.stop="toggleTaskMenu(task.id)">···</button><div v-if="openTaskMenuId === task.id" class="popup-menu task-popup" @click.stop><button @click="setTaskPinned(task, false); closeMenus()">取消置顶</button><div class="menu-label">优先级</div><button v-for="priority in (['high','medium','low','none'] as TaskPriority[])" :key="priority" :class="{ selected: task.priority === priority }" @click="setTaskPriority(task, priority)">{{ priority === 'none' ? '无优先级' : `${priorityCode(priority)} · ${priorityLabel(priority)}` }}</button></div></div>
            </div>
          </section>
          <section class="task-zone regular-zone" @dragover.prevent @drop.stop="dropTaskInZone(false)">
            <div v-if="pinnedTasks.length" class="task-zone-heading"><span>其他任务</span></div>
            <div v-for="task in regularTasks" :key="task.id" :class="['task-row', { 'drag-target': taskDropTargetId === task.id }]" :draggable="taskReorderEnabled" @dragstart="startTaskDrag($event, task)" @dragend="endTaskDrag" @dragover.prevent="taskDropTargetId = task.id" @drop.stop="dropTaskBefore(task)" @click="selectTask(task)">
              <button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><div class="task-main"><div class="task-title-line"><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span><span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]" :title="priorityLabel(task.priority)">♨ {{ priorityCode(task.priority) }}</span></div><div class="task-meta"><span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span><span v-if="lists.find(list => list.id === task.listId)" class="list-meta"><i class="list-dot" :style="{ background: lists.find(list => list.id === task.listId)?.color || '#856AF9' }"></i>{{ lists.find(list => list.id === task.listId)?.name }}</span><span v-if="task.notes">▤ 有备注</span></div></div><div class="row-actions"><button class="icon-button" aria-label="任务操作" @click.stop="toggleTaskMenu(task.id)">···</button><div v-if="openTaskMenuId === task.id" class="popup-menu task-popup" @click.stop><button @click="setTaskPinned(task, true); closeMenus()">置顶任务</button><div class="menu-label">优先级</div><button v-for="priority in (['high','medium','low','none'] as TaskPriority[])" :key="priority" :class="{ selected: task.priority === priority }" @click="setTaskPriority(task, priority)">{{ priority === 'none' ? '无优先级' : `${priorityCode(priority)} · ${priorityLabel(priority)}` }}</button></div></div>
            </div>
          </section>
        </div>
      </section>
    </main>
    <transition name="slide"><aside v-if="detailOpen && activeTask" class="detail-drawer"><header class="drawer-header"><span>任务详情</span><button class="icon-button" aria-label="关闭" @click="detailOpen = false">×</button></header><div class="drawer-body"><input v-if="detailDraft" v-model="detailDraft.title" class="title-input" placeholder="任务标题" /><div class="detail-status" @click="toggleTask(activeTask)"><button class="check" :class="{ checked: activeTask.status === 'completed' }">{{ activeTask.status === 'completed' ? '✓' : '' }}</button><span>{{ activeTask.status === 'completed' ? '已完成' : '标记为完成' }}</span></div><div class="subtasks"><div class="subtask-heading"><span>子任务 <small>{{ subtasks.filter(task => task.status === 'completed').length }}/{{ subtasks.length }}</small></span></div><div class="subtask-composer"><input v-model="newSubtaskTitle" placeholder="添加子任务…" @keydown.enter="addSubtask" /><button @click="addSubtask">＋</button></div><div v-for="subtask in subtasks" :key="subtask.id" class="subtask-row"><button class="check mini" :class="{ checked: subtask.status === 'completed' }" @click="toggleTask(subtask)">{{ subtask.status === 'completed' ? '✓' : '' }}</button><span :class="{ done: subtask.status === 'completed' }">{{ subtask.title }}</span></div></div><label class="field"><span>清单</span><select v-if="detailDraft" v-model="detailDraft.listId"><option :value="null">无清单</option><option v-for="list in sortedLists" :key="list.id" :value="list.id">{{ list.name }}</option></select></label><label class="field"><span>截止日期</span><input v-if="detailDraft" v-model="detailDraft.dueDate" type="date" /></label><label class="field"><span>优先级</span><select v-if="detailDraft" v-model="detailDraft.priority"><option value="none">无优先级</option><option value="low">P3 · 低</option><option value="medium">P2 · 中</option><option value="high">P1 · 高</option></select></label><label class="field"><span>重复</span><select v-if="detailDraft" v-model="detailDraft.recurrence"><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label v-if="detailDraft?.recurrence !== 'none'" class="field"><span>结束重复</span><input v-model="detailDraft.recurrenceEnd" type="date" /></label><label class="field notes-field"><span>备注</span><textarea v-if="detailDraft" v-model="detailDraft.notes" rows="5" placeholder="记录一些想法…"></textarea></label></div><footer class="drawer-footer"><button class="danger-link" @click="pendingDelete = activeTask">删除任务</button><button class="save-button" @click="saveDetail">保存更改</button></footer></aside></transition>
    <div v-if="pendingDelete" class="dialog-backdrop" @click.self="pendingDelete = null"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div class="dialog-icon">!</div><h2 id="delete-title">删除这个任务？</h2><p>“{{ pendingDelete.title }}”及其子任务将被永久删除，此操作无法撤销。</p><div class="dialog-actions"><button class="cancel-button" @click="pendingDelete = null">取消</button><button class="delete-button" @click="removeTask(pendingDelete); pendingDelete = null">确认删除</button></div></section></div>
    <div v-if="pendingListDelete" class="dialog-backdrop" @click.self="pendingListDelete = null"><section class="confirm-dialog list-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-list-title"><div class="dialog-icon">!</div><h2 id="delete-list-title">删除清单“{{ pendingListDelete.name }}”？</h2><p>请选择如何处理清单中的任务。</p><label class="delete-policy"><input v-model="listDeletePolicy" type="radio" value="keep" /><span><strong>保留任务</strong><small>任务将转为“无清单”</small></span></label><label class="delete-policy danger-policy"><input v-model="listDeletePolicy" type="radio" value="delete" /><span><strong>同时删除任务</strong><small>清单中的任务和子任务将永久删除</small></span></label><div class="dialog-actions"><button class="cancel-button" @click="pendingListDelete = null">取消</button><button class="delete-button" @click="confirmListDelete">确认删除</button></div></section></div>
    <div v-if="settingsOpen" class="dialog-backdrop" @click.self="settingsOpen = false"><section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><p>Rumo-Flow</p><h2 id="settings-title">设置与数据</h2></div><button class="icon-button" aria-label="关闭设置" @click="settingsOpen = false">×</button></header><div class="settings-section"><div><strong>导出数据备份</strong><p>将清单、任务、子任务和重复规则保存为 JSON 文件。</p></div><button class="secondary-button" @click="exportBackup">导出备份</button></div><div class="settings-section"><div><strong>从备份恢复</strong><p>恢复前会自动保存当前数据；导入失败不会修改现有任务。</p></div><button class="secondary-button" @click="importBackup">选择文件</button></div><footer>数据仅保存在当前设备 · Rumo-Flow 0.2.0</footer></section></div>
    <div v-if="toast" class="toast">✓ {{ toast }}</div>
  </div>
</template>
