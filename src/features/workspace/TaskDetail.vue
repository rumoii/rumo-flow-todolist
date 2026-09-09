<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWorkspaceContext } from './context'
import SelectField from '../../components/SelectField.vue'
import DraftStatus from '../../components/DraftStatus.vue'
import PlanField from './PlanField.vue'
import TaskSources from './TaskSources.vue'
const { detailLoading, trapDialogFocus, pendingDelete, selectedTaskId, detailOpen, detailDraft, tagQuery, newSubtaskTitle, activeTask, subtasks, visibleDetailTags, canCreateDetailTag, closeDetail, discardTaskDraft, createTagFromDetail, saveDetail, addSubtask, sortedLists, toggleTask } = useWorkspaceContext()
const expanded = ref(false)
const availableWidth = ref(676)
let observer: ResizeObserver | undefined
function measure() { availableWidth.value = document.querySelector('.main-content')?.getBoundingClientRect().width ?? window.innerWidth - 224 }
onMounted(() => { measure(); observer = new ResizeObserver(measure); observer.observe(document.documentElement) })
onBeforeUnmount(() => observer?.disconnect())
watch(detailOpen, value => { if (!value) expanded.value = false; else void nextTick(measure) })
</script>

<template>
  <Transition name="drawer">
    <div v-if="detailOpen && activeTask" class="drawer-layer" @keydown="trapDialogFocus">
      <div class="drawer-scrim" aria-hidden="true" @click="closeDetail"></div>
      <aside class="detail-drawer task-editor" :class="{ 'task-editor-expanded': expanded }" :style="{ width: (expanded ? availableWidth : Math.min(600, availableWidth)) + 'px' }" role="dialog" aria-modal="true" aria-label="任务详情" tabindex="-1">
        <header class="drawer-header">
          <span>任务详情</span>
          <div class="editor-window-actions">
            <button class="icon-button editor-expand" :aria-label="expanded ? '收起任务详情' : '展开任务详情'" :aria-pressed="expanded" :title="expanded ? '收起任务详情' : '展开任务详情'" @click="expanded = !expanded">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path v-if="!expanded" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><path v-else d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5" /></svg>
            </button>
            <button class="icon-button" aria-label="关闭" @click="closeDetail">×</button>
          </div>
        </header>
        <div class="drawer-body" :inert="detailLoading">
          <div v-if="detailDraft" class="editor-content">
            <div class="editor-heading">
              <button class="check" :class="{ checked: activeTask.status === 'completed' }" :aria-label="activeTask.status === 'completed' ? '恢复任务' : '标记为完成'" @click="toggleTask(activeTask)">{{ activeTask.status === 'completed' ? '✓' : '' }}</button>
              <input v-model="detailDraft.title" class="title-input" aria-label="任务标题" placeholder="任务标题" />
            </div>
            <div class="editor-summary">
              <label><span>清单</span><SelectField v-model="detailDraft.listId" aria-label="任务清单" :options="[{ value: null, label: '收集箱' }, ...sortedLists.map(list => ({ value: list.id, label: list.name }))]" /></label>
              <label><span>重要程度</span><SelectField v-model="detailDraft.priority" aria-label="任务重要程度" :options="[{ value: 'none', label: '未设置' }, { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]" /></label>
              <button v-if="detailDraft.plan?.kind === 'day'" type="button" class="editor-focus" :class="{ selected: detailDraft.focusDate === detailDraft.plan.start }" :aria-pressed="detailDraft.focusDate === detailDraft.plan.start" @click="detailDraft.focusDate = detailDraft.focusDate === detailDraft.plan.start ? null : detailDraft.plan.start">{{ detailDraft.focusDate === detailDraft.plan.start ? '★ 已设为当日重点' : '☆ 设为当日重点' }}</button>
            </div>
            <section class="editor-section editor-notes">
              <h3><label for="task-editor-notes">备注</label></h3>
              <textarea id="task-editor-notes" v-model="detailDraft.notes" rows="5" placeholder="记录一些想法…"></textarea>
            </section>
            <section class="editor-section subtasks">
              <div class="editor-section-heading"><h3>子任务</h3><small v-if="subtasks.length">{{ subtasks.filter(task => task.status === 'completed').length }}/{{ subtasks.length }}</small></div>
              <TransitionGroup name="subtask" tag="div" class="subtask-items">
                <div v-for="subtask in subtasks" :key="subtask.id" class="subtask-row">
                  <button class="check mini" :class="{ checked: subtask.status === 'completed' }" :aria-label="subtask.status === 'completed' ? '恢复子任务' : '完成子任务'" @click="toggleTask(subtask)">{{ subtask.status === 'completed' ? '✓' : '' }}</button>
                  <span :class="{ done: subtask.status === 'completed' }">{{ subtask.title }}</span>
                </div>
              </TransitionGroup>
              <div class="subtask-composer"><input v-model="newSubtaskTitle" placeholder="添加子任务…" @keydown.enter="addSubtask" /><button aria-label="添加子任务" @click="addSubtask">＋ 添加</button></div>
            </section>
            <section class="editor-properties" aria-label="任务安排与分类">
              <div class="editor-property"><span>执行计划</span><PlanField v-model="detailDraft.plan" @update:model-value="detailDraft.focusDate = null" /></div>
              <div class="editor-property"><span>截止与提醒</span><div class="editor-deadline">
                <label><span>截止日期</span><input v-model="detailDraft.dueDate" type="date" /></label>
                <label><span>截止时间</span><input v-model="detailDraft.dueTime" type="time" /></label>
                <label class="editor-reminder"><span>提醒</span><SelectField v-model="detailDraft.reminderMinutesBefore" aria-label="任务提醒" :options="[{ value: null, label: '不提醒' }, { value: 5, label: '提前 5 分钟' }, { value: 15, label: '提前 15 分钟' }, { value: 60, label: '提前 1 小时' }, { value: 1440, label: '提前 1 天' }]" /></label>
              </div></div>
              <fieldset class="editor-property editor-tags"><legend>标签</legend><div class="tag-picker__content">
                <input v-model="tagQuery" class="editor-tag-query" placeholder="搜索或输入新标签" @keydown.enter="createTagFromDetail" />
                <div class="tag-options"><label v-for="tag in visibleDetailTags" :key="tag.id"><input v-model="detailDraft.tagIds" type="checkbox" :value="tag.id" /><span>#{{ tag.name }}</span></label><button v-if="canCreateDetailTag" type="button" class="tag-create-button" @click="createTagFromDetail">＋ 创建并添加“{{ tagQuery.trim() }}”</button><span v-if="!visibleDetailTags.length && !canCreateDetailTag" class="tag-empty">暂无标签</span></div>
              </div></fieldset>
              <div class="editor-property"><span>重复</span><div class="editor-repeat"><SelectField v-model="detailDraft.recurrence" aria-label="任务重复频率" :options="[{ value: 'none', label: '不重复' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]" /><label v-if="detailDraft.recurrence !== 'none'"><span>结束重复</span><input v-model="detailDraft.recurrenceEnd" type="date" /></label></div></div>
            </section>
            <TaskSources :task-id="activeTask.id" />
          </div>
        </div>
        <footer class="drawer-footer">
          <div class="editor-save-state"><DraftStatus v-if="selectedTaskId" kind="task" :draft-key="selectedTaskId" @discard="discardTaskDraft" /><button class="danger-link" @click="pendingDelete = activeTask">删除任务</button></div>
          <button class="save-button" :disabled="detailLoading" @click="saveDetail">保存更改</button>
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.task-editor { transition: width var(--motion-smooth); max-width: 100vw; background: var(--surface); }
.task-editor .drawer-header { flex: none; padding: 0 26px; font-size: 13px; }
.editor-window-actions { display: flex; align-items: center; gap: 8px; }
.task-editor .drawer-body { min-height: 0; padding: 28px 32px 32px; background: var(--surface); overscroll-behavior: contain; }
.editor-content { width: 100%; max-width: 880px; margin: 0 auto; }
.editor-heading { display: flex; align-items: flex-start; gap: 14px; }
.editor-heading > .check { margin: 10px 0 0; flex: none; }
.task-editor .title-input { min-width: 0; width: 100%; padding: 3px 0 10px; border: 0; margin: 0; font-size: 25px; font-weight: 600; line-height: 1.4; background: transparent; }
.editor-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; margin: 14px 0 26px; }
.editor-summary > label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.editor-summary :deep(.select-field) { min-width: 105px; max-width: 220px; }
.editor-summary :deep(.select-field__trigger) { min-height: 32px; background: var(--surface-soft); border-color: transparent; }
.editor-focus { padding: 6px 9px; border-radius: 7px; font-size: 12px; color: var(--muted); }
.editor-focus.selected, .editor-focus:hover { background: var(--accent-soft); color: var(--accent); }
.editor-section { margin: 0 0 24px; }
.task-editor .subtasks { border: 0; padding: 0; }
.editor-section h3 { margin: 0 0 10px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.editor-notes textarea { width: 100%; min-height: 140px; padding: 12px 14px; border: 1px solid transparent; border-radius: 9px; background: var(--surface-soft); color: var(--text); line-height: 1.75; resize: vertical; transition: border-color var(--motion-fast), background-color var(--motion-fast); }
.editor-notes textarea:focus { border-color: var(--accent); background: var(--surface); }
.editor-section-heading { display: flex; align-items: baseline; justify-content: space-between; }
.editor-section-heading small { color: var(--muted); }
.task-editor .subtask-composer { display: flex; margin: 0; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: transparent; }
.task-editor .subtask-composer input { width: 100%; min-width: 0; height: 36px; background: transparent; border: 0; }
.task-editor .subtask-composer button { flex: none; width: auto; height: auto; white-space: nowrap; font-size: 12px; color: var(--accent); }
.task-editor .subtask-row { padding: 8px 0; height: auto; min-height: 38px; }
.task-editor .subtask-row > span { overflow-wrap: anywhere; }
.editor-properties { border-top: 1px solid var(--border); }
.editor-property { display: grid; grid-template-columns: 86px minmax(0, 1fr); align-items: start; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.editor-property > span, .editor-tags > legend { padding-top: 9px; color: var(--muted); }
.editor-property :deep(.plan-field) { margin: 0; gap: 10px; }
.editor-deadline { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.editor-deadline label, .editor-repeat label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.editor-deadline label > span, .editor-repeat label > span { font-size: 11px; color: var(--muted); }
.editor-reminder { grid-column: 1 / -1; }
.editor-property input:not([type=checkbox]) { min-width: 0; width: 100%; height: 34px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); }
.editor-tags { margin: 0; border: 0; border-bottom: 1px solid var(--border); min-width: 0; }
.editor-tags > legend { float: left; width: 86px; padding: 9px 0 0; }
.editor-tags .tag-picker__content { grid-column: 2; min-width: 0; }
.editor-tags .tag-options { margin: 10px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
.editor-tags .tag-options label { display: inline-flex; align-items: center; gap: 5px; }
.editor-tags input[type=checkbox] { width: 14px; height: 14px; accent-color: var(--accent); }
.editor-repeat { display: grid; gap: 12px; }
.task-editor :deep(.detail-card) { margin-top: 20px; padding: 0; border: 0; background: transparent; box-shadow: none; }
.task-editor .drawer-footer { flex: none; padding: 14px 26px; gap: 16px; background: var(--surface); box-shadow: none; }
.editor-save-state { min-width: 0; flex: 1; font-size: 12px; }
.editor-save-state :deep(.draft-status) { margin: 0 0 5px; }
.task-editor .save-button { flex: none; }
@media (prefers-reduced-motion: reduce) { .task-editor { transition: none; } }
</style>
