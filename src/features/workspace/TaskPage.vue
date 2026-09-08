<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue'
import { batchSelectionKey, useBatchSelection } from './useBatchSelection'
import TaskSelection from './TaskSelection.vue'
import BatchToolbar from './BatchToolbar.vue'
import TrashPage from './TrashPage.vue'
import HistorySearch from './HistorySearch.vue'
import QuickAddHints from '../../components/QuickAddHints.vue'
import { useWorkspaceContext } from './context'
import SelectField from '../../components/SelectField.vue'
import TaskRow from './TaskRow.vue'
import TaskPlanButton from './TaskPlanButton.vue'
import TaskArrangementDialog from './TaskArrangementDialog.vue'
import FlowView from '../../components/FlowView.vue'
import TagPage from './TagPage.vue'
const { totalStatus, totalDeadline, unplannedOnly, dueToday, pastPlanned, tags, lists, tasks, activeView, quickTitle, quickInput, search, groupBy, temporaryTagId, loading, todayIso, selectTask, viewTitle, viewHint, taskReorderEnabled, draggedTaskId, endTaskDrag, dropTaskInZone, onWeekDrop, isTodayTask, filteredTasks, pinnedTasks, groupedRegularTasks, completedTodayCount, temporaryTag, emptyState, priorityCode, priorityClass, createTask, toggleTask, weekDates, tasksForDate, rumoFlowIcon } = useWorkspaceContext()
const { quickPlanHint } = useWorkspaceContext()
const { drafts, closeMenus } = useWorkspaceContext()
const dueExpanded = ref(false)
const pastExpanded = ref(false)
const selectionTrigger = ref<HTMLButtonElement>()
const candidates = computed(() => activeView.value === 'today' ? [...pinnedTasks.value, ...groupedRegularTasks.value, ...(dueExpanded.value ? dueToday.value : []), ...(pastExpanded.value ? pastPlanned.value : [])] : filteredTasks.value)
const scope = computed(() => JSON.stringify([activeView.value, search.value, temporaryTagId.value, totalStatus.value, totalDeadline.value, unplannedOnly.value, drafts.epoch.value]))
const batch = useBatchSelection(candidates, scope, async () => { tasks.value = await window.todoApi.tasks.list({}) })
provide(batchSelectionKey, batch)
watch(batch.active, () => { closeMenus(); endTaskDrag() })
watch(activeView, () => { dueExpanded.value = false; pastExpanded.value = false })
async function exitSelection() { batch.exit(); await nextTick(); selectionTrigger.value?.focus() }
</script>

<template>
<main :class="['main-content', { 'flow-view-active': activeView === 'flow', 'batch-active': batch.active.value }]" @keydown.esc="batch.active.value && exitSelection()">
      <header class="page-header" :inert="batch.busy.value">
<Transition name="title" mode="out-in">
<div :key="activeView">
<p class="eyebrow">{{ viewHint }}</p>
<h1 tabindex="-1">{{ viewTitle }}</h1>
</div>
</Transition>
<div v-if="!['flow', 'tags', 'trash', 'history'].includes(activeView)" class="header-actions">
<button v-if="!batch.active.value" ref="selectionTrigger" class="secondary-button" :disabled="batch.busy.value || !batch.available.value.length" @click="batch.enter">选择任务</button>
<label v-if="activeView !== 'week' && activeView !== 'month'" class="group-select">
<span>分组</span>
<SelectField v-model="groupBy" aria-label="任务分组" :options="[{ value: 'none', label: '不分组' }, { value: 'list', label: '按清单' }, { value: 'priority', label: '按重要程度' }, { value: 'tag', label: '按标签' }]" />
</label>
<label class="search-box">
<span>⌕</span>
<input v-model="search" placeholder="搜索任务" />
</label>
</div>
</header>
      <section :class="['content-inner', { 'flow-content-inner': activeView === 'flow' }]" :inert="batch.busy.value">
        <TagPage v-if="activeView === 'tags'" />
        <TrashPage v-if="activeView === 'trash'" />
        <HistorySearch v-if="activeView === 'history'" />
        <KeepAlive>
<FlowView v-if="activeView === 'flow'" :today-completed-count="completedTodayCount" :today-pending-count="tasks.filter(isTodayTask).length" />
</KeepAlive>
        <template v-if="!['flow', 'tags', 'trash', 'history'].includes(activeView)">
        <div class="quick-add">
<span class="quick-icon">＋</span>
<input ref="quickInput" v-model="quickTitle" placeholder="添加一个任务，按 Enter 保存…" @keydown.enter="createTask()" />
<span class="quick-hint">Enter</span>
</div>
        <QuickAddHints v-model="quickTitle" :tags="tags" :lists="lists" />
        <p class="quick-plan-hint">{{ quickPlanHint }}</p>
        <div v-if="activeView === 'all'" class="planning-controls">
          <SelectField v-model="totalStatus" aria-label="总计划状态" :options="[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'all', label: '全部状态' }]" />
          <SelectField v-model="totalDeadline" aria-label="截止日期筛选" :options="[{ value: 'any', label: '任意截止日期' }, { value: 'today', label: '今天到期' }, { value: 'overdue', label: '已逾期' }, { value: 'next7', label: '未来七天到期' }, { value: 'none', label: '无截止日期' }]" />
          <label><input v-model="unplannedOnly" type="checkbox" />仅未安排</label>
        </div>
        <p v-if="!batch.active.value && batch.error.value" role="status">{{ batch.error.value }}</p>
        <div v-if="temporaryTag" class="temporary-filter">
<span>当前标签：<strong>#{{ temporaryTag.name }}</strong>
</span>
<button @click="temporaryTagId = null">清除</button>
</div>
        <Transition name="view" mode="out-in">
          <div :key="activeView" class="view-content" :class="{ 'today-view': activeView === 'today' }">
            <template v-if="activeView === 'week'">
              <section v-if="filteredTasks.some(task => task.plan?.kind === 'week')" class="planning-panel"><h3>本周待细化</h3><div v-for="task in filteredTasks.filter(task => task.plan?.kind === 'week')" :key="task.id" :draggable="!batch.active.value" @dragstart="!batch.active.value && (draggedTaskId = task.id)" @dragend="endTaskDrag"><TaskRow :task="task" /></div></section>
              <div class="week-board">
<div v-for="date in weekDates()" :key="date" class="day-column" @dragover.prevent @drop="!batch.active.value && onWeekDrop($event, date)">
<div class="day-heading" :class="{ today: date === todayIso }">
<span>{{ new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }) }}</span>
<b>{{ new Date(`${date}T00:00:00`).getDate() }}</b>
</div>
<div v-if="!tasksForDate(date).length" class="day-empty">拖放任务到这里</div>
<TransitionGroup name="task-card" tag="div" class="day-task-items">
<article v-for="task in tasksForDate(date)" :key="task.id" :data-task-id="task.id" class="task-card" :draggable="!batch.active.value" @dragstart="!batch.active.value && (draggedTaskId = task.id)" @dragend="endTaskDrag" @click="selectTask(task)">
<TaskSelection :task="task" />
<button :disabled="batch?.active.value" class="check" :aria-label="task.status === 'completed' ? '恢复任务' : '完成任务'" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTask(task)">{{ task.status === 'completed' ? '✓' : '' }}</button>
<span class="task-card-body">
<span v-if="task.priority !== 'none'" :class="['priority-badge', priorityClass(task.priority)]">{{ priorityCode(task.priority) }}</span>
<span class="task-title" role="button" tabindex="0" :aria-label="`打开任务 ${task.title}`" @keydown.enter.prevent.stop="selectTask(task)" @keydown.space.prevent.stop="selectTask(task)">{{ task.title }}</span>
<TaskPlanButton :task="task" />
<small v-if="task.focusDate">★ 当日重点</small>
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
            <template v-else-if="activeView === 'month' && filteredTasks.length"><section v-for="kind in (['month', 'week', 'day'] as const)" :key="kind" class="planning-panel"><h3>{{ { month: '月内待细化', week: '已安排到周', day: '已安排到日' }[kind] }}</h3><TaskRow v-for="task in filteredTasks.filter(task => task.plan?.kind === kind)" :key="task.id" :task="task" /><p v-if="!filteredTasks.some(task => task.plan?.kind === kind)">暂无任务</p></section></template>
            <div v-else-if="activeView === 'today'" class="today-execution">
              <section class="task-zone today-focus" aria-labelledby="today-focus-title">
                <div class="task-zone-heading"><h2 id="today-focus-title">今日重点 <small>{{ pinnedTasks.length }}</small></h2></div>
                <p v-if="!pinnedTasks.length" class="today-empty">{{ search || temporaryTag ? '没有匹配的今日重点' : '还没有今日重点，点击任务旁的 ☆ 标记重要的事。' }}</p>
                <TaskRow v-for="task in pinnedTasks" :key="task.id" :task="task" />
              </section>
              <section class="task-zone today-other" aria-labelledby="today-other-title">
                <div class="task-zone-heading"><h2 id="today-other-title">今天其他任务 <small>{{ groupedRegularTasks.length }}</small></h2></div>
                <p v-if="!groupedRegularTasks.length" class="today-empty">{{ search || temporaryTag ? '没有匹配的其他任务' : '暂无其他安排，可以添加任务，或将待处理提醒安排到今天。' }}</p>
                <TaskRow v-for="task in groupedRegularTasks" :key="task.id" :task="task" />
              </section>
            </div>
            <template v-else-if="!filteredTasks.length">
<div class="empty-state">
<img class="empty-orbit" :src="rumoFlowIcon" alt="" aria-hidden="true" />
<h2>{{ emptyState.title }}</h2>
<p>{{ emptyState.hint }}</p>
<button v-if="emptyState.canCreate" class="text-action" @click="createTask('整理我的下一步')">＋ 添加第一项任务</button>
</div>
</template>
            <div v-else class="task-list">
          <section v-if="taskReorderEnabled || pinnedTasks.length" class="task-zone pinned-zone" :class="{ empty: !pinnedTasks.length }" @dragover.prevent @drop.stop="!batch.active.value && dropTaskInZone(true)">
            <div class="task-zone-heading">
<span>置顶</span>
<small v-if="taskReorderEnabled">拖到这里置顶</small>
</div>
            <div v-if="!pinnedTasks.length" class="pin-drop-hint">暂无置顶任务</div>
            <TransitionGroup name="task-row" tag="div" class="task-items">
            <TaskRow v-for="task in pinnedTasks" :key="task.id" :task="task" />
            </TransitionGroup>
          </section>
          <section class="task-zone regular-zone" @dragover.prevent @drop.stop="!batch.active.value && dropTaskInZone(false)">
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
        <section v-if="activeView === 'today' && (dueToday.length || pastPlanned.length)" class="today-reminders" aria-label="待处理提醒">
          <h2>待处理提醒</h2>
          <details v-if="dueToday.length" class="planning-panel" @toggle="dueExpanded = ($event.target as HTMLDetailsElement).open"><summary>今日到期 · {{ dueToday.length }} 项</summary><TaskRow v-for="task in dueToday" :key="task.id" :task="task" reminder /></details>
          <details v-if="pastPlanned.length" class="planning-panel" @toggle="pastExpanded = ($event.target as HTMLDetailsElement).open"><summary>过往计划未完成 · {{ pastPlanned.length }} 项</summary><p>原计划保持不变，按需重新安排。</p><TaskRow v-for="task in pastPlanned" :key="task.id" :task="task" reminder /></details>
        </section>
        </template>
      </section>
      <TaskArrangementDialog />
      <BatchToolbar v-if="batch.active.value" :count="batch.selected.value.length" :selection="batch.selected.value.map(task => task.id).join(',')" :available="batch.available.value.length" :busy="batch.busy.value" :saved="batch.saved.value" :error="batch.error.value" @apply="batch.apply" @all="batch.selectAll" @clear="batch.selected.value = []" @exit="exitSelection" @refresh="batch.reload" />
    </main>
</template>
