<script setup lang="ts">
import { useWorkspaceContext } from './context'
import SelectField from '../../components/SelectField.vue'
import DraftStatus from '../../components/DraftStatus.vue'
import PlanField from './PlanField.vue'
import TaskSources from './TaskSources.vue'
const { detailLoading, trapDialogFocus, search, pendingDelete, selectedTaskId, detailOpen, detailDraft, tagQuery, newSubtaskTitle, activeTask, subtasks, visibleDetailTags, canCreateDetailTag, closeDetail, discardTaskDraft, createTagFromDetail, saveDetail, addSubtask, sortedLists, toggleTask } = useWorkspaceContext()
</script>

<template>
<Transition name="drawer">
<div v-if="detailOpen && activeTask" class="drawer-layer" @keydown="trapDialogFocus">
<div class="drawer-scrim" aria-hidden="true" @click="closeDetail">
</div>
<aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="任务详情" tabindex="-1">
<header class="drawer-header">
<span>任务详情</span>
<button class="icon-button" aria-label="关闭" @click="closeDetail">×</button>
</header>
<div class="drawer-body" :inert="detailLoading">
<TaskSources :task-id="activeTask.id" />
<DraftStatus v-if="selectedTaskId" kind="task" :draft-key="selectedTaskId" @discard="discardTaskDraft" />
<div class="detail-hero">
<input v-if="detailDraft" v-model="detailDraft.title" class="title-input" placeholder="任务标题" />
<button class="detail-status" type="button" @click="toggleTask(activeTask)">
<span class="check" :class="{ checked: activeTask.status === 'completed' }">{{ activeTask.status === 'completed' ? '✓' : '' }}</span>
<span>{{ activeTask.status === 'completed' ? '已完成' : '标记为完成' }}</span>
</button>
</div>
<section class="detail-card subtasks">
<div class="detail-card__header">
<div>
<span class="detail-card__eyebrow">进度</span>
<h3>子任务</h3>
</div>
<small>{{ subtasks.filter(task => task.status === 'completed').length }}/{{ subtasks.length }}</small>
</div>
<div class="subtask-composer">
<input v-model="newSubtaskTitle" placeholder="添加子任务…" @keydown.enter="addSubtask" />
<button aria-label="添加子任务" @click="addSubtask">＋</button>
</div>
<TransitionGroup name="subtask" tag="div" class="subtask-items">
<div v-for="subtask in subtasks" :key="subtask.id" class="subtask-row">
<button class="check mini" :class="{ checked: subtask.status === 'completed' }" @click="toggleTask(subtask)">{{ subtask.status === 'completed' ? '✓' : '' }}</button>
<span :class="{ done: subtask.status === 'completed' }">{{ subtask.title }}</span>
</div>
</TransitionGroup>
</section>
<section v-if="detailDraft" class="detail-card">
<div class="detail-card__header">
<div>
<span class="detail-card__eyebrow">时间与归属</span>
<h3>计划信息</h3>
</div>
</div>
<div class="field">
<span>清单</span>
<SelectField v-model="detailDraft.listId" aria-label="任务清单" :options="[{ value: null, label: '无清单' }, ...sortedLists.map(list => ({ value: list.id, label: list.name }))]" />
</div>
<label class="field">
<span>截止日期</span>
<input v-model="detailDraft.dueDate" type="date" />
</label>
<div class="field"><span>执行计划</span><PlanField v-model="detailDraft.plan" @update:model-value="detailDraft.focusDate = null" /></div>
<label v-if="detailDraft.plan?.kind === 'day'" class="field"><span>当日重点</span><input type="checkbox" :checked="detailDraft.focusDate === detailDraft.plan.start" @change="detailDraft.focusDate = ($event.target as HTMLInputElement).checked ? detailDraft.plan.start : null" /></label>
<label class="field">
<span>截止时间</span>
<input v-model="detailDraft.dueTime" type="time" />
</label>
<div class="field">
<span>提醒</span>
<SelectField v-model="detailDraft.reminderMinutesBefore" aria-label="任务提醒" :options="[{ value: null, label: '不提醒' }, { value: 5, label: '提前 5 分钟' }, { value: 15, label: '提前 15 分钟' }, { value: 60, label: '提前 1 小时' }, { value: 1440, label: '提前 1 天' }]" />
</div>
</section>
<section v-if="detailDraft" class="detail-card">
<div class="detail-card__header">
<div>
<span class="detail-card__eyebrow">分类与重要程度</span>
<h3>组织信息</h3>
</div>
</div>
<fieldset class="field tag-picker">
<legend>标签</legend>
<div class="tag-picker__content">
<div class="tag-search-row">
<input v-model="tagQuery" placeholder="搜索或输入新标签" @keydown.enter="createTagFromDetail" />
</div>
<div class="tag-options">
<label v-for="tag in visibleDetailTags" :key="tag.id">
<input v-model="detailDraft.tagIds" type="checkbox" :value="tag.id">
<span>#{{ tag.name }}</span>
</label>
<button v-if="canCreateDetailTag" type="button" class="tag-create-button" @click="createTagFromDetail">＋ 创建并添加“{{ tagQuery.trim() }}”</button>
<span v-if="!visibleDetailTags.length && !canCreateDetailTag" class="tag-empty">暂无标签</span>
</div>
</div>
</fieldset>
<div class="field">
<span>重要程度</span>
<SelectField v-model="detailDraft.priority" aria-label="任务重要程度" :options="[{ value: 'none', label: '未设置' }, { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]" />
</div>
</section>
<section v-if="detailDraft" class="detail-card">
<div class="detail-card__header">
<div>
<span class="detail-card__eyebrow">自动计划</span>
<h3>重复</h3>
</div>
</div>
<div class="field">
<span>频率</span>
<SelectField v-model="detailDraft.recurrence" aria-label="任务重复频率" :options="[{ value: 'none', label: '不重复' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]" />
</div>
<label v-if="detailDraft.recurrence !== 'none'" class="field">
<span>结束重复</span>
<input v-model="detailDraft.recurrenceEnd" type="date" />
</label>
</section>
<section v-if="detailDraft" class="detail-card notes-card">
<div class="detail-card__header">
<div>
<span class="detail-card__eyebrow">补充内容</span>
<h3>备注</h3>
</div>
</div>
<textarea v-model="detailDraft.notes" rows="5" placeholder="记录一些想法…">
</textarea>
</section>
</div>
<footer class="drawer-footer">
<button class="danger-link" @click="pendingDelete = activeTask">删除任务</button>
<button class="save-button" @click="saveDetail">保存更改</button>
</footer>
</aside>
</div>
</Transition>
</template>
