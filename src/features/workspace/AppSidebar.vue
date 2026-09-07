<script setup lang="ts">
import { useWorkspaceContext } from './context'
import SelectField from '../../components/SelectField.vue'
const { completedTodayCount, settingsOpen, tasks, tags, savedFilters, activeView, filterComposerOpen, newFilterName, newFilterStatus, newFilterListId, newFilterPriority, newFilterTagId, newFilterDue, listComposerOpen, newListName, openListMenuId, listDropTargetId, setListPinned, startListDrag, endListDrag, dropListBefore, isTodayTask, sortedLists, pinnedLists, regularLists, completedCount, pendingCount, listCount, addList, focusQuickAdd, toggleListMenu, requestListDelete, createFilter, removeFilter, rumoFlowIcon } = useWorkspaceContext()
</script>

<template>
<aside class="sidebar">
      <div class="brand">
<img class="brand-mark" :src="rumoFlowIcon" alt="Rumo-Flow" />
<span class="brand-copy">
<span>Rumo-<b>Flow</b>
</span>
<small>Todo List</small>
</span>
</div>
      <button class="primary-action" @click="focusQuickAdd">
<span aria-hidden="true">＋</span> 新建任务 <kbd>Ctrl N</kbd>
</button>
      <nav class="nav-group">
        <button :class="['nav-item', { active: activeView === 'all' }]" @click="activeView = 'all'"><span class="nav-icon" aria-hidden="true">☷</span> 总计划</button>
        <button :class="['nav-item', { active: activeView === 'inbox' }]" @click="activeView = 'inbox'">
<span class="nav-icon" aria-hidden="true">✦</span> 收集箱 <em>{{ tasks.filter(task => task.status === 'active' && task.listId === null).length }}</em>
</button>
        <button :class="['nav-item', { active: activeView === 'today' }]" @click="activeView = 'today'">
<span class="nav-icon" aria-hidden="true">☀</span> 今天 <em>{{ tasks.filter(isTodayTask).length }}</em>
</button>
        <button :class="['nav-item', { active: activeView === 'week' }]" @click="activeView = 'week'">
<span class="nav-icon" aria-hidden="true">▦</span> 本周</button>
        <button :class="['nav-item', { active: activeView === 'month' }]" @click="activeView = 'month'"><span class="nav-icon" aria-hidden="true">▦</span> 本月</button>
        <button :class="['nav-item', { active: activeView === 'overdue' }]" @click="activeView = 'overdue'"><span class="nav-icon" aria-hidden="true">◷</span> 已逾期</button>
        <button :class="['nav-item', { active: activeView === 'history' }]" @click="activeView = 'history'"><span class="nav-icon" aria-hidden="true">⌕</span> 历史搜索</button>
        <button :class="['nav-item', { active: activeView === 'trash' }]" @click="activeView = 'trash'"><span class="nav-icon" aria-hidden="true">♲</span> 回收站</button>
        <button :class="['nav-item', { active: activeView === 'completed' }]" @click="activeView = 'completed'">
<span class="nav-icon" aria-hidden="true">✓</span> 已完成 <em>{{ completedCount }}</em>
</button>
      </nav>
      <nav class="flow-nav-section" aria-label="心流">
<button :class="['nav-item', { active: activeView === 'flow' }]" @click="activeView = 'flow'">
<span class="nav-icon" aria-hidden="true">◌</span> 心流 <em>记录与复盘</em>
</button>
<button :class="['nav-item', { active: activeView === 'tags' }]" @click="activeView = 'tags'"><span class="nav-icon" aria-hidden="true">#</span> 标签管理</button>
</nav>
      <div class="sidebar-section saved-filter-section">
        <div class="section-title">保存的筛选 <button class="icon-button" aria-label="新建筛选" @click.stop="filterComposerOpen = !filterComposerOpen">＋</button>
</div>
        <Transition name="filter-composer">
          <div v-if="filterComposerOpen" class="filter-composer-motion">
            <div class="list-composer filter-composer-form" @click.stop>
              <input v-model="newFilterName" class="filter-name-input" autofocus placeholder="筛选名称" @keydown.enter="createFilter" />
              <div class="filter-field-row">
<span>状态</span>
<SelectField v-model="newFilterStatus" aria-label="筛选状态" :options="[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'all', label: '全部' }]" />
</div>
              <div class="filter-field-row">
<span>清单</span>
<SelectField v-model="newFilterListId" aria-label="筛选清单" :options="[{ value: 'any', label: '任意清单' }, { value: 'inbox', label: '收集箱' }, ...sortedLists.map(list => ({ value: list.id, label: list.name }))]" />
</div>
              <div class="filter-field-row">
<span>优先级</span>
<SelectField v-model="newFilterPriority" aria-label="筛选优先级" :options="[{ value: 'any', label: '任意优先级' }, { value: 'high', label: 'P1' }, { value: 'medium', label: 'P2' }, { value: 'low', label: 'P3' }, { value: 'none', label: '无' }]" />
</div>
              <div class="filter-field-row">
<span>标签</span>
<SelectField v-model="newFilterTagId" aria-label="筛选标签" :options="[{ value: 'any', label: '任意标签' }, ...tags.map(tag => ({ value: tag.id, label: `#${tag.name}` }))]" />
</div>
              <div class="filter-field-row">
<span>日期</span>
<SelectField v-model="newFilterDue" aria-label="筛选日期" :options="[{ value: 'any', label: '任意日期' }, { value: 'today', label: '今天' }, { value: 'overdue', label: '已逾期' }, { value: 'next7', label: '未来 7 天' }, { value: 'none', label: '无日期' }]" />
</div>
              <button class="filter-submit" @click="createFilter">✓</button>
            </div>
          </div>
        </Transition>
        <div v-for="filter in savedFilters" :key="filter.id" class="saved-filter-row">
          <button :class="['nav-item', { active: activeView === `filter:${filter.id}` }]" @click="activeView = `filter:${filter.id}`">
<span class="nav-icon" aria-hidden="true">⌕</span>
<span class="list-name">{{ filter.name }}</span>
</button>
          <button class="inline-remove" :aria-label="`删除筛选 ${filter.name}`" @click.stop="removeFilter(filter)">×</button>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="section-title">我的清单 <button class="icon-button" aria-label="新建清单" @click.stop="listComposerOpen = !listComposerOpen">＋</button>
</div>
        <Transition name="composer">
<div v-if="listComposerOpen" class="list-composer" @click.stop>
<input v-model="newListName" autofocus placeholder="清单名称" @keydown.enter="addList" @keydown.esc="listComposerOpen = false" />
<button @click="addList">✓</button>
</div>
</Transition>
        <div v-if="pinnedLists.length" class="list-group-label">置顶</div>
        <TransitionGroup name="list-row" tag="div" class="list-items">
        <div v-for="list in pinnedLists" :key="list.id" :class="['list-row', { 'drag-target': listDropTargetId === list.id }]" draggable="true" @dragstart="startListDrag($event, list)" @dragend="endListDrag" @dragover.prevent="listDropTargetId = list.id" @drop.stop="dropListBefore(list)">
          <button :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`">
<i class="list-dot" :style="{ background: list.color || '#856AF9' }">
</i>
<span class="list-name">{{ list.name }}</span>
<em>{{ listCount(list.id) }}</em>
</button>
          <span class="pin-indicator">置顶</span>
          <button class="list-menu-button" aria-label="清单操作" @click.stop="toggleListMenu(list.id)">···</button>
          <Transition name="popup">
<div v-if="openListMenuId === list.id" class="popup-menu list-popup" @click.stop>
<button @click="setListPinned(list, false)">取消置顶</button>
<button class="menu-danger" @click="requestListDelete(list)">删除清单</button>
</div>
</Transition>
        </div>
        </TransitionGroup>
        <div v-if="pinnedLists.length" class="list-group-label">其他清单</div>
        <TransitionGroup name="list-row" tag="div" class="list-items">
        <div v-for="list in regularLists" :key="list.id" :class="['list-row', { 'drag-target': listDropTargetId === list.id }]" draggable="true" @dragstart="startListDrag($event, list)" @dragend="endListDrag" @dragover.prevent="listDropTargetId = list.id" @drop.stop="dropListBefore(list)">
          <button :class="['nav-item', { active: activeView === `list:${list.id}` }]" @click="activeView = `list:${list.id}`">
<i class="list-dot" :style="{ background: list.color || '#856AF9' }">
</i>
<span class="list-name">{{ list.name }}</span>
<em>{{ listCount(list.id) }}</em>
</button>
          <button class="list-menu-button" aria-label="清单操作" @click.stop="toggleListMenu(list.id)">···</button>
          <Transition name="popup">
<div v-if="openListMenuId === list.id" class="popup-menu list-popup" @click.stop>
<button @click="setListPinned(list, true)">置顶清单</button>
<button class="menu-danger" @click="requestListDelete(list)">删除清单</button>
</div>
</Transition>
        </div>
        </TransitionGroup>
      </div>
      <div class="sidebar-footer">
<div class="mini-progress">
<div>
<span>今日进度</span>
<strong>{{ completedTodayCount + tasks.filter(isTodayTask).length ? Math.round(completedTodayCount / (completedTodayCount + tasks.filter(isTodayTask).length) * 100) : 0 }}%</strong>
</div>
<div class="progress-track">
<span :style="{ width: `${completedTodayCount + tasks.filter(isTodayTask).length ? completedTodayCount / (completedTodayCount + tasks.filter(isTodayTask).length) * 100 : 0}%` }">
</span>
</div>
</div>
<button class="nav-item muted" @click="settingsOpen = true">
<span class="nav-icon" aria-hidden="true">⚙</span> 设置</button>
</div>
    </aside>
</template>
