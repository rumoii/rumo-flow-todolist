import { ref } from 'vue'
import { planFor } from '../../shared/planning'
import type { Ref, ComputedRef } from 'vue'
import type { Task, TaskList, TaskPriority } from '../../shared/contracts'
import type { TaskEditorDraft } from '../../shared/drafts'
interface Dependencies {
  hasApi: () => boolean
  tasks: Ref<Task[]>
  selectedTaskId: Ref<string | null>
  detailDraft: Ref<TaskEditorDraft | null>
  notify: (message: string) => void
  closeMenus: () => void
  priorityLabel: (value: TaskPriority) => string
  taskReorderEnabled: ComputedRef<boolean>
  lists: Ref<TaskList[]>
  dateLabel: (value: string | null) => string
}
export function useOrdering({ hasApi, tasks, selectedTaskId, detailDraft, notify, closeMenus, priorityLabel, taskReorderEnabled, lists, dateLabel }: Dependencies) {
  const draggedTaskId = ref<string | null>(null)
  const draggedListId = ref<string | null>(null)
  const taskDropTargetId = ref<string | null>(null)
  const listDropTargetId = ref<string | null>(null)
  async function persistTaskOrder(ordered: Task[]) {
    if (hasApi())
      await window.todoApi.tasks.reorder(ordered.map(task => task.id))
    ordered.forEach((task, index) => { task.sortOrder = index; })
  }
  function taskGroupFor(task: Task, isPinned: boolean, priority: TaskPriority) { return tasks.value.filter(item => !item.parentTaskId && item.id !== task.id && item.isPinned === isPinned && item.priority === priority).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)); }
  async function organizeTask(task: Task, isPinned: boolean, priority: TaskPriority, ordered: Task[]) {
    const updated = hasApi() ? await window.todoApi.tasks.organize(task.id, { isPinned, priority, orderedIds: ordered.map(item => item.id) }) : { ...task, isPinned, priority }
    Object.assign(task, updated, { isPinned, priority })
    ordered.forEach((item, index) => { item.sortOrder = index; })
    if (selectedTaskId.value === task.id && detailDraft.value)
      detailDraft.value.priority = priority
  }
  async function moveTaskToGroupEnd(task: Task, isPinned = task.isPinned, priority = task.priority) {
    const ordered = taskGroupFor(task, isPinned, priority)
    ordered.push(task)
    await organizeTask(task, isPinned, priority, ordered)
  }
  async function setTaskPinned(task: Task, isPinned: boolean) {
    try {
      if (task.isPinned === isPinned) {
        await moveTaskToGroupEnd(task)
        return
      }
      await moveTaskToGroupEnd(task, isPinned, task.priority)
      notify(isPinned ? '任务已置顶' : '已取消任务置顶')
    }
    catch {
      notify('置顶状态更新失败')
    }
  }
  async function setTaskPriority(task: Task, priority: TaskPriority) {
    closeMenus()
    if (task.priority === priority)
      return
    try {
      await moveTaskToGroupEnd(task, task.isPinned, priority)
      notify(`已设为${priorityLabel(priority)}`)
    }
    catch {
      notify('优先级更新失败')
    }
  }
  function startTaskDrag(event: DragEvent, task: Task) {
    if (!taskReorderEnabled.value)
      return
    draggedTaskId.value = task.id
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', task.id)
    }
  }
  function endTaskDrag() { draggedTaskId.value = null; taskDropTargetId.value = null; }
  async function dropTaskBefore(target: Task) {
    const dragged = tasks.value.find(task => task.id === draggedTaskId.value)
    if (!dragged || dragged.id === target.id)
      return
    try {
      if (dragged.priority !== target.priority) {
        notify('跨优先级拖动不会改变优先级')
        return
      }
      const ordered = taskGroupFor(dragged, target.isPinned, target.priority)
      const targetIndex = ordered.findIndex(task => task.id === target.id)
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, dragged)
      if (dragged.isPinned === target.isPinned)
        await persistTaskOrder(ordered)
      else
        await organizeTask(dragged, target.isPinned, target.priority, ordered)
    }
    catch {
      notify('任务排序失败')
    }
    finally {
      endTaskDrag()
    }
  }
  async function dropTaskInZone(isPinned: boolean) {
    const task = tasks.value.find(item => item.id === draggedTaskId.value)
    if (!task)
      return
    try {
      await setTaskPinned(task, isPinned)
    }
    finally {
      endTaskDrag()
    }
  }
  async function persistListOrder(ordered: TaskList[]) {
    if (hasApi())
      await window.todoApi.lists.reorder(ordered.map(list => list.id))
    ordered.forEach((list, index) => { list.sortOrder = index; })
  }
  function listGroupFor(list: TaskList, isPinned: boolean) { return lists.value.filter(item => item.id !== list.id && item.isPinned === isPinned).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); }
  async function organizeList(list: TaskList, isPinned: boolean, ordered: TaskList[]) {
    const updated = hasApi() ? await window.todoApi.lists.organize(list.id, { isPinned, orderedIds: ordered.map(item => item.id) }) : { ...list, isPinned }
    Object.assign(list, updated, { isPinned })
    ordered.forEach((item, index) => { item.sortOrder = index; })
  }
  async function moveListToGroupEnd(list: TaskList, isPinned = list.isPinned) {
    const ordered = listGroupFor(list, isPinned)
    ordered.push(list)
    await organizeList(list, isPinned, ordered)
  }
  async function setListPinned(list: TaskList, isPinned: boolean) {
    closeMenus()
    if (list.isPinned === isPinned)
      return
    try {
      await moveListToGroupEnd(list, isPinned)
      notify(isPinned ? '清单已置顶' : '已取消清单置顶')
    }
    catch {
      notify('清单置顶状态更新失败')
    }
  }
  function startListDrag(event: DragEvent, list: TaskList) {
    draggedListId.value = list.id
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', list.id)
    }
  }
  function endListDrag() { draggedListId.value = null; listDropTargetId.value = null; }
  async function dropListBefore(target: TaskList) {
    const dragged = lists.value.find(list => list.id === draggedListId.value)
    if (!dragged || dragged.id === target.id)
      return
    try {
      const ordered = listGroupFor(dragged, target.isPinned)
      const targetIndex = ordered.findIndex(list => list.id === target.id)
      ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, dragged)
      if (dragged.isPinned === target.isPinned)
        await persistListOrder(ordered)
      else
        await organizeList(dragged, target.isPinned, ordered)
    }
    catch {
      notify('清单排序失败')
    }
    finally {
      endListDrag()
    }
  }
  async function onWeekDrop(event: DragEvent, targetDate: string) { event.preventDefault(); const task = tasks.value.find(item => item.id === draggedTaskId.value); endTaskDrag(); if (!task || (task.plan?.kind === 'day' && task.plan.start === targetDate))
    return; try {
    const updated = hasApi() ? await window.todoApi.tasks.update(task.id, { plan: planFor('day', targetDate), focusDate: null }) : { ...task, plan: planFor('day', targetDate), focusDate: null }
    Object.assign(task, updated)
    notify(`已移动到${dateLabel(targetDate)}`)
  }
  catch {
    notify('日期更新失败')
  } }
  return { draggedTaskId, draggedListId, taskDropTargetId, listDropTargetId, persistTaskOrder, taskGroupFor, organizeTask, moveTaskToGroupEnd, setTaskPinned, setTaskPriority, startTaskDrag, endTaskDrag, dropTaskBefore, dropTaskInZone, persistListOrder, listGroupFor, organizeList, moveListToGroupEnd, setListPinned, startListDrag, endListDrag, dropListBefore, onWeekDrop }
}
