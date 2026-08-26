<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CreateTaskInput, RecurrenceFrequency, Task, TaskList, TaskPriority, TaskQuery, UpdateTaskInput } from './shared/contracts'

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
const settingsOpen = ref(false)
const listComposerOpen = ref(false)
const newListName = ref('')
const newSubtaskTitle = ref('')
const recurrenceDrafts = new Map<string, { frequency: RecurrenceFrequency; endDate: string }>()
const toast = ref('')
const loading = ref(true)
const draggedTaskId = ref<string | null>(null)
let toastTimer: number | undefined

const today = new Date()
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayIso = isoDate(today)
const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)

const fallbackLists: TaskList[] = [{ id: 'inbox', name: '收集箱', color: '#856AF9', sortOrder: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
const fallbackTasks: Task[] = []

function notify(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2800)
}

async function loadData() {
  loading.value = true
  try {
    if (hasApi()) {
      lists.value = await window.todoApi.lists.list()
      tasks.value = await window.todoApi.tasks.list({})
    } else {
      lists.value = fallbackLists
      tasks.value = fallbackTasks
    }
  } catch { notify('数据加载失败，请稍后重试') } finally { loading.value = false }
}

const activeListId = computed(() => activeView.value.startsWith('list:') ? activeView.value.slice(5) : null)
const viewTitle = computed(() => ({ today: '今天', upcoming: '即将到期', week: '本周', completed: '已完成' }[activeView.value as string] || lists.value.find(l => l.id === activeListId.value)?.name || '待办'))
const viewHint = computed(() => activeView.value === 'today' ? `${today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 把注意力放在最重要的事上` : activeView.value === 'upcoming' ? '未来 30 天的安排' : activeView.value === 'week' ? '接下来七天的轻量排程' : activeView.value === 'completed' ? '已经完成的任务' : '这个清单中的任务')

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
  }).sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.sortOrder - b.sortOrder)
})
const activeTask = computed(() => tasks.value.find(t => t.id === selectedTaskId.value) || null)
const subtasks = computed(() => activeTask.value ? tasks.value.filter(t => t.parentTaskId === activeTask.value!.id) : [])
const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length)
const pendingCount = computed(() => tasks.value.filter(t => t.status === 'active').length)
const listCount = (id: string) => tasks.value.filter(t => t.listId === id && t.status === 'active').length

function selectTask(task: Task) {
  selectedTaskId.value = task.id; detailOpen.value = true
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
function priorityLabel(priority: TaskPriority) { return ({ none: '', low: '低', medium: '中', high: '高' }[priority]) }
function priorityClass(priority: TaskPriority) { return priority === 'high' ? 'priority-high' : priority === 'medium' ? 'priority-medium' : priority === 'low' ? 'priority-low' : '' }

async function createTask(title = quickTitle.value) {
  const clean = title.trim(); if (!clean) return
  const input: CreateTaskInput = { title: clean, listId: activeListId.value, dueDate: activeView.value === 'today' ? todayIso : null, priority: 'none', notes: '' }
  try {
    const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, parentTaskId: null, recurrenceRuleId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task)
    tasks.value.push(task); quickTitle.value = ''; notify('任务已添加')
  } catch { notify('添加失败') }
}
async function toggleTask(task: Task) {
  try { if (hasApi()) task.status === 'completed' ? await window.todoApi.tasks.restore(task.id) : await window.todoApi.tasks.complete(task.id); task.status = task.status === 'completed' ? 'active' : 'completed'; if (task.status === 'active') task.completedAt = null; else task.completedAt = new Date().toISOString(); notify(task.status === 'completed' ? '已完成' : '已恢复') } catch { notify('更新失败') }
}
async function saveDetail() {
  if (!activeTask.value || !detailDraft.value || !detailDraft.value.title.trim()) return
  const d = detailDraft.value; const input: UpdateTaskInput = { title: d.title.trim(), listId: d.listId, dueDate: d.dueDate || null, priority: d.priority, notes: d.notes, recurrence: d.recurrence === 'none' ? null : { frequency: d.recurrence, interval: 1, endDate: d.recurrenceEnd || null } }
  try { const updated = hasApi() ? await window.todoApi.tasks.update(activeTask.value.id, input) : ({ ...activeTask.value, ...input, recurrenceRuleId: d.recurrence === 'none' ? null : (activeTask.value.recurrenceRuleId || 'preview-rule'), updatedAt: new Date().toISOString() } as Task); Object.assign(activeTask.value, updated); if (d.recurrence === 'none') recurrenceDrafts.delete(activeTask.value.id); else recurrenceDrafts.set(activeTask.value.id, { frequency: d.recurrence, endDate: d.recurrenceEnd }); notify('已保存') } catch { notify('保存失败') }
}
async function removeTask(task: Task) {
  try { if (hasApi()) await window.todoApi.tasks.remove(task.id); tasks.value = tasks.value.filter(t => t.id !== task.id && t.parentTaskId !== task.id); detailOpen.value = false; selectedTaskId.value = null; notify('任务已删除') } catch { notify('删除失败') }
}
async function addList() {
  const name = newListName.value.trim(); if (!name) return
  try { const list = hasApi() ? await window.todoApi.lists.create({ name, color: '#856AF9' }) : ({ id: crypto.randomUUID(), name, color: '#856AF9', sortOrder: lists.value.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as TaskList); lists.value.push(list); activeView.value = `list:${list.id}`; newListName.value = ''; listComposerOpen.value = false; notify('清单已创建') } catch { notify('创建清单失败') }
}
async function addSubtask() { const title = newSubtaskTitle.value.trim(); if (!activeTask.value || !title) return; await createTaskAsSubtask(title); newSubtaskTitle.value = '' }
async function createTaskAsSubtask(title: string) { const input: CreateTaskInput = { title, parentTaskId: activeTask.value!.id, listId: activeTask.value!.listId, dueDate: activeTask.value!.dueDate, priority: 'none' }; const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, parentTaskId: activeTask.value!.id, recurrenceRuleId: null, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task); tasks.value.push(task); notify('子任务已添加') }
function onDrop(event: DragEvent, targetDate: string) { event.preventDefault(); const task = tasks.value.find(t => t.id === draggedTaskId.value); if (!task || task.dueDate === targetDate) return; task.dueDate = targetDate; if (hasApi()) window.todoApi.tasks.update(task.id, { dueDate: targetDate }).catch(() => notify('日期更新失败')); notify(`已移动到${dateLabel(targetDate)}`) }
function weekDates() { return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return isoDate(d) }) }
function tasksForDate(date: string) { return filteredTasks.value.filter(t => t.dueDate === date) }
function focusQuickAdd() { quickInput.value?.focus() }
async function exportBackup() {
  if (!hasApi()) { notify('请在桌面应用中导出备份'); return }
  try { const filePath = await window.todoApi.backup.export(); if (filePath) notify('备份已导出') } catch { notify('备份导出失败') }
}
async function importBackup() {
  if (!hasApi()) { notify('请在桌面应用中恢复备份'); return }
  try { const result = await window.todoApi.backup.import(); if (result) { await loadData(); settingsOpen.value = false; notify(`已恢复 ${result.importedTasks} 个任务`) } } catch { notify('备份恢复失败，现有数据未改变') }
}
function handleShortcut(event: KeyboardEvent) { if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); focusQuickAdd() } if (event.key === 'Escape') { pendingDelete.value = null; settingsOpen.value = false; detailOpen.value = false } }

onMounted(() => { loadData(); window.addEventListener('keydown', handleShortcut) })
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">✦</span><span class="brand-copy"><span>Rumo-<b>Flow</b></span><small>Todo List</small></span></div>
      <button class="primary-action" @click="focusQuickAdd"><span>＋</span> 新建任务 <kbd>Ctrl N</kbd></button>
      <nav class="nav-group">
        <button :class="['nav-item', { active: activeView === 'today' }]" @click="activeView = 'today'"><span>☀</span> 今天 <em>{{ tasks.filter(t => t.status === 'active' && (!t.dueDate || t.dueDate <= todayIso)).length }}</em></button>
        <button :class="['nav-item', { active: activeView === 'upcoming' }]" @click="activeView = 'upcoming'"><span>◷</span> 即将到期</button>
        <button :class="['nav-item', { active: activeView === 'week' }]" @click="activeView = 'week'"><span>▦</span> 本周</button>
        <button :class="['nav-item', { active: activeView === 'completed' }]" @click="activeView = 'completed'"><span>✓</span> 已完成 <em>{{ completedCount }}</em></button>
      </nav>
      <div class="sidebar-section"><div class="section-title">我的清单 <button class="icon-button" aria-label="新建清单" @click="listComposerOpen = !listComposerOpen">＋</button></div>
        <div v-if="listComposerOpen" class="list-composer"><input v-model="newListName" autofocus placeholder="清单名称" @keydown.enter="addList" @keydown.esc="listComposerOpen = false" /><button @click="addList">✓</button></div>
        <button v-for="list in lists" :key="list.id" :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`"><i class="list-dot" :style="{ background: list.color || '#856AF9' }"></i>{{ list.name }} <em>{{ listCount(list.id) }}</em></button>
      </div>
      <div class="sidebar-footer"><div class="mini-progress"><div><span>今日进度</span><strong>{{ pendingCount ? Math.round(completedCount / (completedCount + pendingCount) * 100) : 100 }}%</strong></div><div class="progress-track"><span :style="{ width: `${pendingCount ? completedCount / (completedCount + pendingCount) * 100 : 100}%` }"></span></div></div><button class="nav-item muted" @click="settingsOpen = true"><span>⚙</span> 设置</button></div>
    </aside>
    <main class="main-content">
      <header class="page-header"><div><p class="eyebrow">{{ viewHint }}</p><h1>{{ viewTitle }}</h1></div><div class="header-actions"><label class="search-box"><span>⌕</span><input v-model="search" placeholder="搜索任务" /></label><button class="avatar">R</button></div></header>
      <section class="content-inner">
        <div class="quick-add"><span class="quick-icon">＋</span><input ref="quickInput" v-model="quickTitle" placeholder="添加一个任务，按 Enter 保存…" @keydown.enter="createTask()" /><span class="quick-hint">Enter</span></div>
        <template v-if="activeView === 'week'">
          <div class="week-board"><div v-for="date in weekDates()" :key="date" class="day-column" @dragover.prevent @drop="onDrop($event, date)"><div class="day-heading" :class="{ today: date === todayIso }"><span>{{ new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span><b>{{ new Date(`${date}T00:00:00`).getDate() }}</b></div><div v-if="!tasksForDate(date).length" class="day-empty">拖放任务到这里</div><article v-for="task in tasksForDate(date)" :key="task.id" class="task-card" draggable="true" @dragstart="draggedTaskId = task.id" @click="selectTask(task)"><button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><span class="task-title">{{ task.title }}</span><i v-if="task.priority !== 'none'" :class="['priority-dot', priorityClass(task.priority)]"></i></article></div></div>
        </template>
        <template v-else-if="loading"><div class="loading-state"><span class="spinner"></span> 正在加载任务…</div></template>
        <template v-else-if="!filteredTasks.length"><div class="empty-state"><div class="empty-orbit">✦</div><h2>{{ search ? '没有匹配的任务' : activeView === 'completed' ? '还没有完成的任务' : '今天没有待办' }}</h2><p>{{ search ? '换一个关键词试试' : '清空思绪，开始做一件小事吧' }}</p><button v-if="!search" class="text-action" @click="createTask('整理我的下一步')">＋ 添加第一项任务</button></div></template>
        <div v-else class="task-list"><div v-for="task in filteredTasks" :key="task.id" class="task-row" draggable="true" @dragstart="draggedTaskId = task.id" @click="selectTask(task)"><button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button><div class="task-main"><div class="task-title-line"><span :class="{ done: task.status === 'completed' }">{{ task.title }}</span><i v-if="task.priority !== 'none'" :class="['priority-dot', priorityClass(task.priority)]" :title="`${priorityLabel(task.priority)}优先级`"></i></div><div class="task-meta"><span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span><span v-if="lists.find(l => l.id === task.listId)" class="list-meta"><i class="list-dot" :style="{ background: lists.find(l => l.id === task.listId)?.color || '#856AF9' }"></i>{{ lists.find(l => l.id === task.listId)?.name }}</span><span v-if="task.notes">▤ 有备注</span></div></div><div class="row-actions"><button class="icon-button" aria-label="打开详情" @click.stop="selectTask(task)">···</button></div></div></div>
      </section>
    </main>
    <transition name="slide"><aside v-if="detailOpen && activeTask" class="detail-drawer"><header class="drawer-header"><span>任务详情</span><button class="icon-button" aria-label="关闭" @click="detailOpen = false">×</button></header><div class="drawer-body"><input v-if="detailDraft" v-model="detailDraft.title" class="title-input" placeholder="任务标题" /><div class="detail-status" @click="toggleTask(activeTask)"><button class="check" :class="{ checked: activeTask.status === 'completed' }">{{ activeTask.status === 'completed' ? '✓' : '' }}</button><span>{{ activeTask.status === 'completed' ? '已完成' : '标记为完成' }}</span></div><label class="field"><span>清单</span><select v-if="detailDraft" v-model="detailDraft.listId"><option :value="null">无清单</option><option v-for="list in lists" :key="list.id" :value="list.id">{{ list.name }}</option></select></label><label class="field"><span>截止日期</span><input v-if="detailDraft" v-model="detailDraft.dueDate" type="date" /></label><label class="field"><span>优先级</span><select v-if="detailDraft" v-model="detailDraft.priority"><option value="none">无优先级</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label class="field"><span>重复</span><select v-if="detailDraft" v-model="detailDraft.recurrence"><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><label v-if="detailDraft?.recurrence !== 'none'" class="field"><span>结束重复</span><input v-model="detailDraft.recurrenceEnd" type="date" /></label><label class="field notes-field"><span>备注</span><textarea v-if="detailDraft" v-model="detailDraft.notes" rows="5" placeholder="记录一些想法…"></textarea></label><div class="subtasks"><div class="subtask-heading"><span>子任务 <small>{{ subtasks.filter(t => t.status === 'completed').length }}/{{ subtasks.length }}</small></span></div><div class="subtask-composer"><input v-model="newSubtaskTitle" placeholder="添加子任务…" @keydown.enter="addSubtask" /><button @click="addSubtask">＋</button></div><div v-for="subtask in subtasks" :key="subtask.id" class="subtask-row"><button class="check mini" :class="{ checked: subtask.status === 'completed' }" @click="toggleTask(subtask)">{{ subtask.status === 'completed' ? '✓' : '' }}</button><span :class="{ done: subtask.status === 'completed' }">{{ subtask.title }}</span></div></div></div><footer class="drawer-footer"><button class="danger-link" @click="pendingDelete = activeTask">删除任务</button><button class="save-button" @click="saveDetail">保存更改</button></footer></aside></transition>
    <div v-if="pendingDelete" class="dialog-backdrop" @click.self="pendingDelete = null"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div class="dialog-icon">!</div><h2 id="delete-title">删除这个任务？</h2><p>“{{ pendingDelete.title }}”及其子任务将被永久删除，此操作无法撤销。</p><div class="dialog-actions"><button class="cancel-button" @click="pendingDelete = null">取消</button><button class="delete-button" @click="removeTask(pendingDelete); pendingDelete = null">确认删除</button></div></section></div>
    <div v-if="settingsOpen" class="dialog-backdrop" @click.self="settingsOpen = false"><section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><p>Rumo-Flow</p><h2 id="settings-title">设置与数据</h2></div><button class="icon-button" aria-label="关闭设置" @click="settingsOpen = false">×</button></header><div class="settings-section"><div><strong>导出数据备份</strong><p>将清单、任务、子任务和重复规则保存为 JSON 文件。</p></div><button class="secondary-button" @click="exportBackup">导出备份</button></div><div class="settings-section"><div><strong>从备份恢复</strong><p>恢复前会自动保存当前数据；导入失败不会修改现有任务。</p></div><button class="secondary-button" @click="importBackup">选择文件</button></div><footer>数据仅保存在当前设备 · Rumo-Flow 0.1.0</footer></section></div>
    <div v-if="toast" class="toast">✓ {{ toast }}</div>
  </div>
</template>
