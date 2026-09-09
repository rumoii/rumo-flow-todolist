<script setup lang="ts">
import type { Task } from '../../shared/contracts'
import TaskMenu from './TaskMenu.vue'
import TaskPlanButton from './TaskPlanButton.vue'
import { useWorkspaceContext } from './context'
import TaskSelection from './TaskSelection.vue'
import { injectBatchSelection } from './useBatchSelection'
const batch = injectBatchSelection()
defineProps<{
  task: Task
  reminder?: boolean
}>()
const { arrangement, lists, activeView, todayIso, selectTask, taskReorderEnabled, taskDropTargetId, startTaskDrag, endTaskDrag, dropTaskBefore, dateLabel, priorityLabel, priorityCode, priorityClass, filterByTag, toggleTask } = useWorkspaceContext()
</script>
<template>
<div :data-task-id="task.id" :class="['task-row', { 'drag-target': taskDropTargetId === task.id }]" :draggable="taskReorderEnabled && !batch?.active.value" @dragstart="!batch?.active.value && startTaskDrag($event, task)" @dragend="endTaskDrag" @dragover.prevent="!batch?.active.value && (taskDropTargetId = task.id)" @drop.stop="!batch?.active.value && dropTaskBefore(task)">
<TaskSelection :task="task" />
              <button :disabled="batch?.active.value" :aria-label="task.status === 'completed' ? '恢复任务' : '完成任务'" class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button>
<div class="task-main" @click="selectTask(task)">
<div class="task-title-line" role="button" tabindex="0" :aria-label="`打开任务 ${task.title}`" @keydown.enter.prevent.stop="selectTask(task)" @keydown.space.prevent.stop="selectTask(task)">
<span :class="{ done: task.status === 'completed' }">{{ task.title }}</span>
<span v-if="task.isPinned" class="pinned-task-mark">置顶</span>
<span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]" :title="`重要程度：${priorityLabel(task.priority)}`">{{ priorityCode(task.priority) }}</span>
</div>
<div class="task-meta">
<TaskPlanButton :task="task" /><span v-if="task.focusDate && activeView !== 'today'">★ 当日重点</span>
<span v-if="task.dueDate" :class="{ overdue: task.status === 'active' && task.dueDate < todayIso }">◷ {{ dateLabel(task.dueDate) }}</span>
<span v-if="lists.find(list => list.id === task.listId)" class="list-meta">
<i class="list-dot" :style="{ background: lists.find(list => list.id === task.listId)?.color || '#856AF9' }">
</i>{{ lists.find(list => list.id === task.listId)?.name }}</span>
<span v-if="task.notes">▤ 有备注</span>
<button v-for="tag in task.tags.slice(0, 3)" :key="tag.id" class="task-tag" @click.stop="filterByTag(tag)">#{{ tag.name }}</button>
<span v-if="task.tags.length > 3" class="task-tag-more">+{{ task.tags.length - 3 }}</span>
</div>
</div>
<button v-if="reminder" class="reminder-arrange" :disabled="arrangement.state.busy" @click.stop="arrangement.open(task, $event, { kind: 'plan', target: 'today' })">安排到今天</button>
<button v-else-if="activeView === 'today' && task.status === 'active' && !task.parentTaskId" class="task-focus-button" title="今日重点：今天优先处理，不改变重要程度" :class="{ focused: task.focusDate === todayIso }" :aria-label="task.focusDate === todayIso ? `取消今日重点 ${task.title}` : `设为今日重点 ${task.title}`" :aria-pressed="task.focusDate === todayIso" :disabled="arrangement.state.busy" @click.stop="arrangement.open(task, $event, { kind: 'focus', enabled: task.focusDate !== todayIso })">{{ task.focusDate === todayIso ? '★' : '☆' }}</button>
<TaskMenu :task="task" />
            </div>
</template>
