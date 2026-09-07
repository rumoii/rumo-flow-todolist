<script setup lang="ts">
import { useWorkspaceContext } from './context'
import SelectField from '../../components/SelectField.vue'
import TaskRow from './TaskRow.vue'
import FlowView from '../../components/FlowView.vue'
const { tasks, activeView, quickTitle, quickInput, search, groupBy, temporaryTagId, loading, todayIso, selectTask, viewTitle, viewHint, taskReorderEnabled, draggedTaskId, endTaskDrag, dropTaskInZone, onWeekDrop, isTodayTask, filteredTasks, pinnedTasks, groupedRegularTasks, completedTodayCount, temporaryTag, emptyState, priorityCode, priorityClass, createTask, toggleTask, weekDates, tasksForDate, rumoFlowIcon } = useWorkspaceContext()
</script>

<template>
<main :class="['main-content', { 'flow-view-active': activeView === 'flow' }]">
      <header class="page-header">
<Transition name="title" mode="out-in">
<div :key="activeView">
<p class="eyebrow">{{ viewHint }}</p>
<h1>{{ viewTitle }}</h1>
</div>
</Transition>
<div v-if="activeView !== 'flow'" class="header-actions">
<label class="group-select">
<span>分组</span>
<SelectField v-model="groupBy" aria-label="任务分组" :options="[{ value: 'none', label: '不分组' }, { value: 'list', label: '按清单' }, { value: 'priority', label: '按优先级' }, { value: 'tag', label: '按标签' }]" />
</label>
<label class="search-box">
<span>⌕</span>
<input v-model="search" placeholder="搜索任务" />
</label>
</div>
</header>
      <section :class="['content-inner', { 'flow-content-inner': activeView === 'flow' }]">
        <KeepAlive>
<FlowView v-if="activeView === 'flow'" :today-completed-count="completedTodayCount" :today-pending-count="tasks.filter(isTodayTask).length" />
</KeepAlive>
        <template v-if="activeView !== 'flow'">
        <div class="quick-add">
<span class="quick-icon">＋</span>
<input ref="quickInput" v-model="quickTitle" placeholder="添加一个任务，按 Enter 保存…" @keydown.enter="createTask()" />
<span class="quick-hint">Enter</span>
</div>
        <div v-if="temporaryTag" class="temporary-filter">
<span>当前标签：<strong>#{{ temporaryTag.name }}</strong>
</span>
<button @click="temporaryTagId = null">清除</button>
</div>
        <Transition name="view" mode="out-in">
          <div :key="activeView" class="view-content">
            <template v-if="activeView === 'week'">
              <div class="week-board">
<div v-for="date in weekDates()" :key="date" class="day-column" @dragover.prevent @drop="onWeekDrop($event, date)">
<div class="day-heading" :class="{ today: date === todayIso }">
<span>{{ new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span>
<b>{{ new Date(`${date}T00:00:00`).getDate() }}</b>
</div>
<div v-if="!tasksForDate(date).length" class="day-empty">拖放任务到这里</div>
<TransitionGroup name="task-card" tag="div" class="day-task-items">
<article v-for="task in tasksForDate(date)" :key="task.id" class="task-card" draggable="true" @dragstart="draggedTaskId = task.id" @dragend="endTaskDrag" @click="selectTask(task)">
<button class="check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button>
<span class="task-card-body">
<span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]">♨ {{ priorityCode(task.priority) }}</span>
<span class="task-title">{{ task.title }}</span>
</span>
</article>
</TransitionGroup>
</div>
</div>
            </template>
            <template v-else-if="loading">
<div class="loading-state">
<span class="spinner">
</span> 正在加载任务…</div>
</template>
            <template v-else-if="!filteredTasks.length">
<div class="empty-state">
<img class="empty-orbit" :src="rumoFlowIcon" alt="" aria-hidden="true" />
<h2>{{ emptyState.title }}</h2>
<p>{{ emptyState.hint }}</p>
<button v-if="emptyState.canCreate" class="text-action" @click="createTask('整理我的下一步')">＋ 添加第一项任务</button>
</div>
</template>
            <div v-else class="task-list">
          <section v-if="taskReorderEnabled || pinnedTasks.length" class="task-zone pinned-zone" :class="{ empty: !pinnedTasks.length }" @dragover.prevent @drop.stop="dropTaskInZone(true)">
            <div class="task-zone-heading">
<span>置顶</span>
<small v-if="taskReorderEnabled">拖到这里置顶</small>
</div>
            <div v-if="!pinnedTasks.length" class="pin-drop-hint">暂无置顶任务</div>
            <TransitionGroup name="task-row" tag="div" class="task-items">
            <TaskRow v-for="task in pinnedTasks" :key="task.id" :task="task" />
            </TransitionGroup>
          </section>
          <section class="task-zone regular-zone" @dragover.prevent @drop.stop="dropTaskInZone(false)">
            <div v-if="pinnedTasks.length" class="task-zone-heading">
<span>其他任务</span>
</div>
            <TransitionGroup name="task-row" tag="div" class="task-items">
            <TaskRow v-for="task in groupedRegularTasks" :key="task.id" :task="task" />
            </TransitionGroup>
              </section>
            </div>
          </div>
        </Transition>
        </template>
      </section>
    </main>
</template>
