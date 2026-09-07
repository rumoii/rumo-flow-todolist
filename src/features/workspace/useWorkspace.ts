import { computed, inject, provide, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createDraftCoordinator, draftCoordinatorKey } from '../../composables/draft-coordinator'
import { useCurrentDate } from '../../composables/useCurrentDate'
import rumoFlowIcon from '../../assets/rumo-flow-icon.svg'
import { isoDate } from '../../shared/date'
import { parseQuickAdd } from '../../shared/quick-add'
import { ensureTags } from '../../shared/tag-utils'
import { matchesTaskFilter } from '../../shared/task-filter'
import type { CreateTaskInput, SavedFilter, Tag, Task, TaskList, TaskPriority } from '../../shared/contracts'
import { useDetails } from './useDetails'
import { useOrdering } from './useOrdering'
import { usePreferences } from './usePreferences'
export function useWorkspace() {
  type View = 'inbox' | 'today' | 'upcoming' | 'week' | 'completed' | 'flow' | `list:${string}` | `filter:${string}`
  const drafts = inject(draftCoordinatorKey, null) ?? createDraftCoordinator(window.todoApi)
  provide(draftCoordinatorKey, drafts)
  const { settings, desktopStatus, settingsOpen, exportBackup, importBackup, applySettings, saveSettings, adoptSettings } = usePreferences({ loadData, notify })
  const hasApi = () => typeof window !== 'undefined' && !!window.todoApi
  const tasks = ref<Task[]>([])
  const lists = ref<TaskList[]>([])
  const tags = ref<Tag[]>([])
  const savedFilters = ref<SavedFilter[]>([])
  const currentView = ref<View>('today')
  let navigationSequence = 0
  const activeView = computed({
    get: () => currentView.value,
    set: (view: View) => {
      if (!drafts.supported) {
        currentView.value = view
        return
      }
      const request = ++navigationSequence
      void drafts.flush().then(() => { if (request === navigationSequence)
        currentView.value = view; }, () => notify('草稿保留失败，请重试后切换页面'))
    },
  })
  const quickTitle = ref('')
  const quickInput = ref<HTMLInputElement | null>(null)
  const search = ref('')
  const groupBy = ref<'none' | 'list' | 'priority' | 'tag'>('none')
  const temporaryTagId = ref<string | null>(null)
  const pendingDelete = ref<Task | null>(null)
  const pendingListDelete = ref<TaskList | null>(null)
  const listDeletePolicy = ref<'keep' | 'delete'>('keep')
  const shortcutsOpen = ref(false)
  const settingsTagName = ref('')
  const managedTagDrafts = ref<Record<string, {
    name: string
    color: string
  }>>({})
  const filterComposerOpen = ref(false)
  const newFilterName = ref('')
  const newFilterStatus = ref<'active' | 'completed' | 'all'>('active')
  const newFilterListId = ref<string>('any')
  const newFilterPriority = ref<TaskPriority | 'any'>('any')
  const newFilterTagId = ref('any')
  const newFilterDue = ref<'any' | 'today' | 'overdue' | 'next7' | 'none'>('any')
  const listComposerOpen = ref(false)
  const newListName = ref('')
  const openListMenuId = ref<string | null>(null)
  const openTaskMenuId = ref<string | null>(null)
  const toast = ref('')
  const toastAction = ref<{
    label: string
    run: () => Promise<void>
  } | null>(null)
  const loading = ref(true)
  let toastTimer: number | undefined
  let lastFocusedElement: HTMLElement | null = null
  const { currentDate, todayIso, weekStart, weekEnd } = useCurrentDate()
  const fallbackLists: TaskList[] = [{ id: 'inbox', name: '收集箱', color: '#856AF9', sortOrder: 0, isPinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  const fallbackTasks: Task[] = []
  const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 }
  const { detailLoading, selectedTaskId, detailOpen, detailDraft, tagQuery, newSubtaskTitle, recurrenceDrafts, activeTask, subtasks, visibleDetailTags, canCreateDetailTag, selectTask, closeDetail, discardTaskDraft, createTagFromDetail, saveDetail, addSubtask, createTaskAsSubtask } = useDetails({ tasks, tags, drafts, notify, closeMenus, hasApi, managedTagDrafts })
  function notify(message: string, action: {
    label: string
    run: () => Promise<void>
  } | null = null) {
    toast.value = message
    toastAction.value = action
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => { toast.value = ''; toastAction.value = null; }, action ? 6000 : 2800)
  }
  let loadSequence = 0
  async function loadData() {
    const request = ++loadSequence
    if (!tasks.value.length)
      loading.value = true
    try {
      if (hasApi()) {
        const api = window.todoApi
        const loaded = await Promise.all([api.lists.list(), api.tasks.list({}), api.tags?.list?.() ?? Promise.resolve([]), api.filters?.list?.() ?? Promise.resolve([]), api.settings?.get?.() ?? Promise.resolve(settings.value), api.desktop?.status?.() ?? Promise.resolve(desktopStatus.value)])
        if (request !== loadSequence)
          return
        lists.value = loaded[0].map(list => ({ ...list, isPinned: list.isPinned ?? false }))
        tasks.value = loaded[1].map(task => ({ ...task, isPinned: task.isPinned ?? false, dueTime: task.dueTime ?? null, reminderMinutesBefore: task.reminderMinutesBefore ?? null, deletedAt: task.deletedAt ?? null, tags: task.tags ?? [] }))
        tags.value = loaded[2]
        managedTagDrafts.value = Object.fromEntries(tags.value.map(tag => [tag.id, { name: tag.name, color: tag.color || '#856AF9' }]))
        savedFilters.value = loaded[3]
        adoptSettings(loaded[4])
        desktopStatus.value = loaded[5]
        drafts.retainTasks(new Set(tasks.value.map(task => task.id)))
        if (selectedTaskId.value && !tasks.value.some(task => task.id === selectedTaskId.value)) {
          detailOpen.value = false
          selectedTaskId.value = null
          detailDraft.value = null
        }
      }
      else {
        lists.value = fallbackLists
        tasks.value = fallbackTasks
      }
    }
    catch {
      notify('数据加载失败，请稍后重试')
    }
    finally {
      if (request === loadSequence)
        loading.value = false
    }
  }
  const activeListId = computed(() => activeView.value.startsWith('list:') ? activeView.value.slice(5) : null)
  const activeFilter = computed(() => activeView.value.startsWith('filter:') ? savedFilters.value.find(filter => filter.id === activeView.value.slice(7)) : null)
  const viewTitle = computed(() => ({ inbox: '收集箱', today: '今天', upcoming: '即将到期', week: '本周', completed: '已完成', flow: '心流' }[activeView.value as string] || activeFilter.value?.name || lists.value.find(list => list.id === activeListId.value)?.name || '待办'))
  const viewHint = computed(() => activeView.value === 'today' ? `${currentDate.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 把注意力放在最重要的事上` : activeView.value === 'flow' ? '让输入慢下来，把思考留下来' : activeView.value === 'upcoming' ? '未来 30 天的安排' : activeView.value === 'week' ? '接下来七天的轻量排程' : activeView.value === 'completed' ? '已经完成的任务' : activeFilter.value ? '按保存的条件自动汇总任务' : '这个清单中的任务')
  const taskReorderEnabled = computed(() => !search.value.trim() && (activeView.value === 'today' || Boolean(activeListId.value)))
  const { draggedTaskId, draggedListId, taskDropTargetId, listDropTargetId, persistTaskOrder, taskGroupFor, organizeTask, moveTaskToGroupEnd, setTaskPinned, setTaskPriority, startTaskDrag, endTaskDrag, dropTaskBefore, dropTaskInZone, persistListOrder, listGroupFor, organizeList, moveListToGroupEnd, setListPinned, startListDrag, endListDrag, dropListBefore, onWeekDrop } = useOrdering({ hasApi, tasks, selectedTaskId, detailDraft, notify, closeMenus, priorityLabel, taskReorderEnabled, lists, dateLabel })
  function isTodayTask(task: Task) {
    return !task.parentTaskId && task.status === 'active' && (!task.dueDate || task.dueDate <= todayIso.value)
  }
  function compareTasks(a: Task, b: Task) {
    return Number(b.isPinned) - Number(a.isPinned) || priorityRank[a.priority] - priorityRank[b.priority] || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
  }
  const filteredTasks = computed(() => {
    const q = search.value.trim().toLowerCase()
    return tasks.value.filter(task => {
      if (task.parentTaskId)
        return false
      if (activeView.value === 'completed' && task.status !== 'completed')
        return false
      if (!activeFilter.value && activeView.value !== 'completed' && task.status === 'completed')
        return false
      if (activeListId.value && task.listId !== activeListId.value)
        return false
      if (activeView.value === 'inbox' && task.listId !== null)
        return false
      if (activeView.value === 'today' && !isTodayTask(task))
        return false
      if (activeView.value === 'upcoming' && (!task.dueDate || task.dueDate < todayIso.value || task.dueDate > isoDate(new Date(currentDate.value.getTime() + 30 * 86400000))))
        return false
      if (activeView.value === 'week' && (!task.dueDate || task.dueDate < todayIso.value || task.dueDate > isoDate(weekEnd.value)))
        return false
      if (temporaryTagId.value && !task.tags.some(tag => tag.id === temporaryTagId.value))
        return false
      if (activeFilter.value && !matchesTaskFilter(task, activeFilter.value.criteria, currentDate.value))
        return false
      return !q || task.title.toLowerCase().includes(q) || task.notes.toLowerCase().includes(q) || task.tags.some(tag => tag.name.toLowerCase().includes(q))
    }).sort(compareTasks)
  })
  const pinnedTasks = computed(() => filteredTasks.value.filter(task => task.isPinned))
  const regularTasks = computed(() => filteredTasks.value.filter(task => !task.isPinned))
  function taskGroupLabel(task: Task): string { if (groupBy.value === 'list')
    return lists.value.find(list => list.id === task.listId)?.name ?? '收集箱'; if (groupBy.value === 'priority')
    return priorityLabel(task.priority); if (groupBy.value === 'tag')
    return task.tags[0]?.name ? `#${task.tags[0].name}` : '无标签'; return ''; }
  const groupedRegularTasks = computed(() => groupBy.value === 'none' ? regularTasks.value : [...regularTasks.value].sort((a, b) => taskGroupLabel(a).localeCompare(taskGroupLabel(b), 'zh-CN') || compareTasks(a, b)))
  const sortedLists = computed(() => [...lists.value].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
  const pinnedLists = computed(() => sortedLists.value.filter(list => list.isPinned))
  const regularLists = computed(() => sortedLists.value.filter(list => !list.isPinned))
  const completedCount = computed(() => tasks.value.filter(task => task.status === 'completed').length)
  const pendingCount = computed(() => tasks.value.filter(task => task.status === 'active').length)
  const completedTodayCount = computed(() => tasks.value.filter(task => task.status === 'completed' && task.completedAt?.slice(0, 10) === todayIso.value).length)
  const listCount = (id: string) => tasks.value.filter(task => task.listId === id && task.status === 'active').length
  const temporaryTag = computed(() => tags.value.find(tag => tag.id === temporaryTagId.value) ?? null)
  const emptyState = computed(() => {
    if (search.value)
      return { title: '没有匹配的任务', hint: '换一个关键词试试', canCreate: false }
    if (activeFilter.value)
      return { title: `“${activeFilter.value.name}”暂无匹配任务`, hint: '可以调整筛选条件，或继续添加符合条件的任务。', canCreate: false }
    if (activeView.value === 'completed')
      return { title: '还没有完成的任务', hint: '完成的任务会集中显示在这里。', canCreate: false }
    if (activeView.value === 'upcoming')
      return { title: '近期没有安排', hint: '未来 30 天内的任务会显示在这里。', canCreate: false }
    if (activeView.value === 'week')
      return { title: '本周还没有安排', hint: '可以从其他视图拖动任务到本周。', canCreate: false }
    return { title: activeView.value === 'today' ? '今天没有待办' : '这个清单还没有任务', hint: '清空思绪，开始做一件小事吧。', canCreate: true }
  })
  function dateLabel(value: string | null) {
    if (!value)
      return '无日期'
    if (value === todayIso.value)
      return '今天'
    const tomorrow = new Date(currentDate.value)
    tomorrow.setDate(currentDate.value.getDate() + 1)
    if (value === isoDate(tomorrow))
      return '明天'
    return new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
  function priorityLabel(priority: TaskPriority) { return ({ none: '无优先级', low: '低优先级', medium: '中优先级', high: '高优先级' }[priority]); }
  function priorityCode(priority: TaskPriority) { return ({ none: '', low: 'P3', medium: 'P2', high: 'P1' }[priority]); }
  function priorityClass(priority: TaskPriority) { return priority === 'high' ? 'priority-high' : priority === 'medium' ? 'priority-medium' : priority === 'low' ? 'priority-low' : ''; }
  async function createTask(title = quickTitle.value) {
    const parsed = parseQuickAdd(title, lists.value, tags.value, currentDate.value)
    const clean = parsed.input.title.trim()
    if (!clean)
      return
    try {
      const resolved = hasApi() ? await ensureTags(window.todoApi, tags.value, parsed.tagNames) : { tags: [], failed: [] }
      const input: CreateTaskInput = { ...parsed.input, title: clean, tagIds: resolved.tags.map(tag => tag.id), listId: parsed.recognized.some(token => token.startsWith('~')) ? parsed.input.listId : activeListId.value, dueDate: parsed.recognized.some(token => token.startsWith('@')) ? parsed.input.dueDate : activeView.value === 'today' ? todayIso.value : null, notes: '', isPinned: false }
      const task = hasApi() ? await window.todoApi.tasks.create(input) : ({ ...input, id: crypto.randomUUID(), status: 'active', sortOrder: tasks.value.length, isPinned: false, parentTaskId: null, recurrenceRuleId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null } as Task)
      tasks.value = [...tasks.value.filter(item => item.id !== task.id), { ...task, isPinned: task.isPinned ?? false }]
      quickTitle.value = ''
      notify(resolved.failed.length ? `任务已添加，标签创建失败：${resolved.failed.join('、')}` : parsed.recognized.length ? `已识别 ${parsed.recognized.join(' ')}` : '任务已添加')
    }
    catch {
      notify('添加失败')
    }
  }
  async function createTagFromSettings() { const name = settingsTagName.value.trim(); if (!name || !hasApi() || !window.todoApi.tags?.create)
    return; const result = await ensureTags(window.todoApi, tags.value, [name]); const tag = result.tags[0]; if (tag)
    managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }; settingsTagName.value = ''; notify(result.failed.length ? '标签创建失败，请检查名称是否重复' : result.tags.length ? '标签已创建' : '标签未创建'); }
  async function updateManagedTag(tag: Tag) { if (!hasApi() || !window.todoApi.tags?.update)
    return; const draft = managedTagDrafts.value[tag.id]; if (!draft?.name.trim()) {
    notify('标签名称不能为空')
    return
  } try {
    const updated = await window.todoApi.tags.update(tag.id, { name: draft.name.trim(), color: draft.color })
    Object.assign(tag, updated)
    managedTagDrafts.value[tag.id] = { name: updated.name, color: updated.color || '#856AF9' }
    tasks.value.forEach(task => task.tags.filter(item => item.id === tag.id).forEach(item => Object.assign(item, updated)))
    notify('标签已更新')
  }
  catch {
    managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }
    notify('标签更新失败，请检查名称是否重复')
  } }
  async function deleteManagedTag(tag: Tag) { if (!hasApi() || !window.todoApi.tags?.remove)
    return; try {
    await window.todoApi.tags.remove(tag.id)
    tags.value = tags.value.filter(item => item.id !== tag.id)
    delete managedTagDrafts.value[tag.id]
    tasks.value.forEach(task => { task.tags = task.tags.filter(item => item.id !== tag.id); })
    if (detailDraft.value)
      detailDraft.value.tagIds = detailDraft.value.tagIds.filter(id => id !== tag.id)
    if (temporaryTagId.value === tag.id)
      temporaryTagId.value = null
    notify('标签已删除，任务已保留')
  }
  catch {
    notify('标签删除失败')
  } }
  function filterByTag(tag: Tag) { temporaryTagId.value = tag.id; search.value = ''; closeMenus(); }
  async function toggleTask(task: Task) {
    const wasCompleted = task.status === 'completed'
    try {
      if (hasApi())
        wasCompleted ? await window.todoApi.tasks.restore(task.id) : await window.todoApi.tasks.complete(task.id)
      await loadData()
      notify(wasCompleted ? '已恢复' : '已完成', { label: '撤销', run: async () => { if (hasApi())
          wasCompleted ? await window.todoApi.tasks.complete(task.id) : await window.todoApi.tasks.restore(task.id); await loadData(); notify('已撤销'); } })
    }
    catch {
      notify('更新失败')
    }
  }
  async function removeTask(task: Task) {
    try {
      if (hasApi())
        await window.todoApi.tasks.remove(task.id)
      drafts.forget('task', task.id)
      tasks.value = tasks.value.filter(item => item.id !== task.id && item.parentTaskId !== task.id)
      detailOpen.value = false
      selectedTaskId.value = null
      notify('任务已删除', { label: '撤销', run: async () => { if (hasApi())
          await window.todoApi.tasks.restoreRemoved(task.id); await loadData(); notify('已恢复任务'); } })
    }
    catch {
      notify('删除失败')
    }
  }
  async function addList() {
    const name = newListName.value.trim()
    if (!name)
      return
    try {
      const list = hasApi() ? await window.todoApi.lists.create({ name, color: '#856AF9', isPinned: false }) : ({ id: crypto.randomUUID(), name, color: '#856AF9', sortOrder: lists.value.length, isPinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as TaskList)
      lists.value.push({ ...list, isPinned: list.isPinned ?? false })
      activeView.value = `list:${list.id}`
      newListName.value = ''
      listComposerOpen.value = false
      notify('清单已创建')
    }
    catch {
      notify('创建清单失败')
    }
  }
  async function confirmListDelete() {
    const list = pendingListDelete.value
    if (!list)
      return
    try {
      if (hasApi())
        await window.todoApi.lists.remove(list.id, { taskPolicy: listDeletePolicy.value })
      const affectedIds = new Set(tasks.value.filter(task => task.listId === list.id).map(task => task.id))
      if (listDeletePolicy.value === 'delete')
        tasks.value = tasks.value.filter(task => !affectedIds.has(task.id) && !affectedIds.has(task.parentTaskId || ''))
      else
        tasks.value.forEach(task => { if (task.listId === list.id)
          task.listId = null; })
      lists.value = lists.value.filter(item => item.id !== list.id)
      if (activeListId.value === list.id)
        activeView.value = 'today'
      if (activeTask.value && affectedIds.has(activeTask.value.id)) {
        if (listDeletePolicy.value === 'delete') {
          detailOpen.value = false
          selectedTaskId.value = null
        }
        else if (detailDraft.value)
          detailDraft.value.listId = null
      }
      pendingListDelete.value = null
      notify(listDeletePolicy.value === 'delete' ? '清单及任务已删除' : '清单已删除，任务已保留')
    }
    catch {
      notify('删除清单失败')
    }
  }
  function weekDates() { return Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart.value); date.setDate(weekStart.value.getDate() + index); return isoDate(date); }); }
  function tasksForDate(date: string) { return filteredTasks.value.filter(task => task.dueDate === date); }
  async function focusQuickAdd() {
    try {
      if (hasApi())
        await window.todoApi.desktop.openQuickCapture()
      else
        quickInput.value?.focus()
    }
    catch {
      notify('快速捕获打开失败，请重试')
    }
  }
  function closeMenus() { openListMenuId.value = null; openTaskMenuId.value = null; }
  function toggleListMenu(listId: string) { openTaskMenuId.value = null; openListMenuId.value = openListMenuId.value === listId ? null : listId; }
  function toggleTaskMenu(taskId: string) { openListMenuId.value = null; openTaskMenuId.value = openTaskMenuId.value === taskId ? null : taskId; }
  function requestListDelete(list: TaskList) { closeMenus(); listDeletePolicy.value = 'keep'; pendingListDelete.value = list; }
  async function createFilter() { const name = newFilterName.value.trim(); if (!name || !hasApi())
    return; const filter = await window.todoApi.filters.create({ name, criteria: { status: newFilterStatus.value, listId: newFilterListId.value === 'any' ? undefined : newFilterListId.value === 'inbox' ? null : newFilterListId.value, priorities: newFilterPriority.value === 'any' ? undefined : [newFilterPriority.value], tagIds: newFilterTagId.value === 'any' ? undefined : [newFilterTagId.value], due: newFilterDue.value, search: search.value.trim() || undefined }, sortOrder: savedFilters.value.length }); savedFilters.value.push(filter); newFilterName.value = ''; filterComposerOpen.value = false; activeView.value = `filter:${filter.id}`; notify('筛选已保存'); }
  async function removeFilter(filter: SavedFilter) { if (hasApi())
    await window.todoApi.filters.remove(filter.id); savedFilters.value = savedFilters.value.filter(item => item.id !== filter.id); if (activeView.value === `filter:${filter.id}`)
    activeView.value = 'today'; notify('筛选已删除'); }
  async function runToastAction() { const action = toastAction.value; if (!action)
    return; toastAction.value = null; await action.run(); }
  function isTypingTarget(target: EventTarget | null) { const element = target as HTMLElement | null; return Boolean(element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName || '')); }
  function handleShortcut(event: KeyboardEvent) {
    if (event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      void focusQuickAdd()
      return
    }
    if (isTypingTarget(event.target) && event.key !== 'Escape')
      return
    if (event.key === '?')
      shortcutsOpen.value = true
    if (event.key === 'Escape') {
      closeMenus()
      if (shortcutsOpen.value)
        shortcutsOpen.value = false
      else if (pendingDelete.value)
        pendingDelete.value = null
      else if (pendingListDelete.value)
        pendingListDelete.value = null
      else if (settingsOpen.value)
        settingsOpen.value = false
      else
        void closeDetail()
    }
  }
  function dialogFocusable(dialog: HTMLElement) { return [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(element => !element.hasAttribute('hidden')); }
  function trapDialogFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab')
      return
    const dialog = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[role="dialog"]')
    if (!dialog)
      return
    const focusable = dialogFocusable(dialog)
    if (!focusable.length) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
    else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  let removeDesktopListener: (() => void) | undefined
  let removeDataListener: (() => void) | undefined
  watch(drafts.epoch, () => { detailOpen.value = false; selectedTaskId.value = null; detailDraft.value = null; void loadData(); })
  let removeFlowListener: (() => void) | undefined
  watch([pendingDelete, pendingListDelete, settingsOpen, shortcutsOpen, detailOpen], async (values, previous) => {
    const isOpen = values.some(Boolean)
    const wasOpen = previous.some(Boolean)
    if (isOpen && !wasOpen)
      lastFocusedElement = document.activeElement as HTMLElement | null
    await nextTick()
    if (isOpen) {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1]
      if (dialog && !dialog.contains(document.activeElement))
        (dialogFocusable(dialog)[0] ?? dialog).focus()
    }
    else if (wasOpen) {
      lastFocusedElement?.focus()
      lastFocusedElement = null
    }
  })
  onMounted(() => { removeDataListener = window.todoApi?.desktop?.onDataChanged?.(() => { void loadData(); }); applySettings(); loadData(); window.addEventListener('keydown', handleShortcut); if (hasApi() && window.todoApi.desktop) {
    removeDesktopListener = window.todoApi.desktop.onFocusQuickAdd((taskId) => { loadData().then(() => { if (taskId) {
      selectedTaskId.value = taskId
      const task = tasks.value.find(item => item.id === taskId)
      if (task)
        selectTask(task)
    } }); })
    removeFlowListener = window.todoApi.desktop.onOpenFlow(() => { activeView.value = 'flow'; detailOpen.value = false; settingsOpen.value = false; })
  } })
  onBeforeUnmount(() => { window.removeEventListener('keydown', handleShortcut); removeDesktopListener?.(); removeFlowListener?.(); removeDataListener?.(); window.clearTimeout(toastTimer); })
  return { drafts, closeMenus, settingsOpen, tasks, tags, savedFilters, activeView, filterComposerOpen, newFilterName, newFilterStatus, newFilterListId, newFilterPriority, newFilterTagId, newFilterDue, listComposerOpen, newListName, openListMenuId, listDropTargetId, setListPinned, startListDrag, endListDrag, dropListBefore, isTodayTask, sortedLists, pinnedLists, regularLists, completedCount, pendingCount, listCount, addList, focusQuickAdd, toggleListMenu, requestListDelete, createFilter, removeFilter, rumoFlowIcon, settings, desktopStatus, exportBackup, importBackup, saveSettings, shortcutsOpen, settingsTagName, managedTagDrafts, createTagFromSettings, updateManagedTag, deleteManagedTag, trapDialogFocus, detailLoading, search, pendingDelete, selectedTaskId, detailOpen, detailDraft, tagQuery, newSubtaskTitle, activeTask, subtasks, visibleDetailTags, canCreateDetailTag, closeDetail, discardTaskDraft, createTagFromDetail, saveDetail, addSubtask, toggleTask, quickTitle, quickInput, groupBy, temporaryTagId, loading, todayIso, selectTask, viewTitle, viewHint, taskReorderEnabled, draggedTaskId, endTaskDrag, dropTaskInZone, onWeekDrop, filteredTasks, pinnedTasks, groupedRegularTasks, completedTodayCount, temporaryTag, emptyState, priorityCode, priorityClass, createTask, weekDates, tasksForDate, lists, openTaskMenuId, taskDropTargetId, setTaskPinned, setTaskPriority, startTaskDrag, dropTaskBefore, dateLabel, priorityLabel, filterByTag, toggleTaskMenu, pendingListDelete, listDeletePolicy, toast, toastAction, removeTask, confirmListDelete, runToastAction }
}
