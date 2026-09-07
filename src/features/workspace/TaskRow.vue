<script setup lang="ts">
import type { Task, TaskPriority } from '../../shared/contracts'
import { planLabel } from '../../shared/planning'
import { useWorkspaceContext } from './context'
defineProps<{
  task: Task
}>()
const { lists, tags, activeView, openTaskMenuId, todayIso, selectTask, taskReorderEnabled, taskDropTargetId, setTaskPinned, setTaskPriority, startTaskDrag, endTaskDrag, dropTaskBefore, dateLabel, priorityLabel, priorityCode, priorityClass, filterByTag, toggleTask, closeMenus, toggleTaskMenu } = useWorkspaceContext()
</script>
<template>
<div :class="['task-row', { 'drag-target': taskDropTargetId === task.id }]" :draggable="taskReorderEnabled" @dragstart="startTaskDrag($event, task)" @dragend="endTaskDrag" @dragover.prevent="taskDropTargetId = task.id" @drop.stop="dropTaskBefore(task)">
              <button :aria-label="task.status === 'completed' ? '恢复任务' : '完成任务'" class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button>
<div class="task-main" @click="selectTask(task)">
<div class="task-title-line" role="button" tabindex="0" :aria-label="`打开任务 ${task.title}`" @keydown.enter.prevent.stop="selectTask(task)" @keydown.space.prevent.stop="selectTask(task)">
<span :class="{ done: task.status === 'completed' }">{{ task.title }}</span>
<span v-if="task.isPinned" class="pinned-task-mark">置顶</span>
<span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]" :title="priorityLabel(task.priority)">♨ {{ priorityCode(task.priority) }}</span>
</div>
<div class="task-meta">
<span>▦ {{ planLabel(task.plan) }}</span><span v-if="task.focusDate">★ 当日重点</span>
<span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span>
<span v-if="lists.find(list => list.id === task.listId)" class="list-meta">
<i class="list-dot" :style="{ background: lists.find(list => list.id === task.listId)?.color || '#856AF9' }">
</i>{{ lists.find(list => list.id === task.listId)?.name }}</span>
<span v-if="task.notes">▤ 有备注</span>
<button v-for="tag in task.tags.slice(0, 3)" :key="tag.id" class="task-tag" @click.stop="filterByTag(tag)">#{{ tag.name }}</button>
<span v-if="task.tags.length > 3" class="task-tag-more">+{{ task.tags.length - 3 }}</span>
</div>
</div>
<div class="row-actions">
<button class="icon-button" aria-label="任务操作" @click.stop="toggleTaskMenu(task.id)">···</button>
<div v-if="openTaskMenuId === task.id" class="popup-menu task-popup" @click.stop>
<button @click="setTaskPinned(task, !task.isPinned); closeMenus()">{{ task.isPinned ? '取消置顶' : '置顶任务' }}</button>
<div class="menu-label">优先级</div>
<button v-for="priority in (['high','medium','low','none'] as TaskPriority[])" :key="priority" :class="{ selected: task.priority === priority }" @click="setTaskPriority(task, priority)">{{ priority === 'none' ? '无优先级' : `${priorityCode(priority)} · ${priorityLabel(priority)}` }}</button>
</div>
</div>
            </div>
</template>
