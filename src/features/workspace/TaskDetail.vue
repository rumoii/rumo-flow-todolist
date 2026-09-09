<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWorkspaceContext } from './context'
import { useTaskDetails } from './useDetails'
import SelectField from '../../components/SelectField.vue'
import TaskTimeFields from './TaskTimeFields.vue'
import TaskTagsField from './TaskTagsField.vue'
import TaskSubtasks from './TaskSubtasks.vue'
import TaskSources from './TaskSources.vue'
const { trapDialogFocus, pendingDelete, sortedLists, toggleTask } = useWorkspaceContext()
const { detailLoading, detailOpen, detailDraft, tagQuery, newSubtaskTitle, activeTask, subtasks, selectedTags, visibleDetailTags, canCreateDetailTag, closeDetail, discardTaskDraft, createTagFromDetail, submitSubtask, subtaskBusy, scheduleSave, flushOnBlur, saveState, saveError, validation, recovered, applyRecovered, resolveConflict } = useTaskDetails()
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
        <header class="drawer-header"><span>任务详情</span><div class="editor-window-actions">
          <button class="icon-button editor-expand" :aria-label="expanded ? '收起任务详情' : '展开任务详情'" :aria-pressed="expanded" :title="expanded ? '收起任务详情' : '展开任务详情'" @click="expanded = !expanded">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path v-if="!expanded" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><path v-else d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5" /></svg>
          </button>
          <button class="icon-button" aria-label="关闭" @click="closeDetail">×</button>
        </div></header>
        <div class="drawer-body" :inert="detailLoading">
          <div v-if="detailDraft" class="editor-content">
            <div v-if="recovered" class="recovery-banner" role="status"><span>发现尚未应用的任务草稿</span><button class="text-button" @click="applyRecovered">应用草稿</button><button class="text-button" @click="discardTaskDraft">放弃草稿</button></div>
            <div class="editor-heading">
              <button class="check" :class="{ checked: activeTask.status === 'completed' }" :aria-label="activeTask.status === 'completed' ? '恢复任务' : '标记为完成'" @click="toggleTask(activeTask)">{{ activeTask.status === 'completed' ? '✓' : '' }}</button>
              <input v-model="detailDraft.title" class="title-input" aria-label="任务标题" placeholder="任务标题" @blur="flushOnBlur" />
            </div>
            <TaskTimeFields v-model="detailDraft" @change="scheduleSave(0)" />
            <section class="editor-classification" aria-label="清单与标签">
              <label class="list-field"><span>清单</span><SelectField v-model="detailDraft.listId" aria-label="任务清单" :options="[{ value: null, label: '收集箱' }, ...sortedLists.map(list => ({ value: list.id, label: list.name }))]" @update:model-value="scheduleSave(0)" /></label>
              <TaskTagsField v-model="detailDraft.tagIds" v-model:query="tagQuery" :tags="selectedTags" :options="visibleDetailTags" :can-create="canCreateDetailTag" @change="scheduleSave(0)" @create="createTagFromDetail" />
            </section>
            <TaskSubtasks v-model="newSubtaskTitle" :tasks="subtasks" :busy="subtaskBusy" @add="submitSubtask" @toggle="toggleTask" />
            <section class="editor-section editor-notes"><h3><label for="task-editor-notes">备注</label></h3><textarea id="task-editor-notes" v-model="detailDraft.notes" rows="5" placeholder="补充背景、思路或参考信息…" @blur="flushOnBlur"></textarea></section>
            <section class="editor-section editor-repeat"><label><span>重复</span><SelectField v-model="detailDraft.recurrence" aria-label="任务重复频率" :options="[{ value: 'none', label: '不重复' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]" @update:model-value="scheduleSave(0)" /></label><label v-if="detailDraft.recurrence !== 'none'"><span>结束重复</span><input v-model="detailDraft.recurrenceEnd" type="date" @change="scheduleSave(0)" /></label></section>
            <TaskSources :task-id="activeTask.id" />
          </div>
        </div>
        <footer class="drawer-footer">
          <div class="editor-save-state" role="status"><span>{{ validation || saveState || '修改后自动保存' }}</span>
            <div v-if="saveError" class="editor-error" role="alert"><span>未能保存，输入仍在编辑器中。</span><button class="text-button" @click="saveError.includes('已变化') ? resolveConflict() : flushOnBlur()">{{ saveError.includes('已变化') ? '检查冲突并处理' : '重试' }}</button><button v-if="saveError.includes('已变化')" class="text-button" @click="discardTaskDraft">放弃草稿</button><details><summary>查看原因</summary><pre>{{ saveError }}</pre></details></div>
          </div>
          <button class="danger-link" @click="pendingDelete = activeTask">删除任务</button>
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
.editor-heading > .check { margin-top: 10px; flex: none; }
.task-editor .title-input { min-width: 0; width: 100%; padding: 3px 0 10px; border: 0; margin: 0; font-size: 25px; font-weight: 600; line-height: 1.4; background: transparent; }
.editor-classification { display: grid; gap: 16px; padding: 20px 0 24px; }
.list-field, .editor-repeat label { display: flex; min-width: 0; align-items: center; gap: 12px; font-size: 12px; color: var(--muted); }
.list-field :deep(.select-field) { min-width: 100px; max-width: 250px; }
.editor-section { margin: 0 0 28px; }

.editor-section h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--text-secondary); }


.editor-notes textarea { width: 100%; min-height: 130px; padding: 12px 14px; border: 1px solid transparent; border-radius: 9px; background: var(--surface-soft); color: var(--text); font-size: 14px; line-height: 1.75; resize: vertical; transition: border-color var(--motion-fast); }
.editor-notes textarea:focus { border-color: var(--accent); }





.editor-repeat { display: flex; flex-wrap: wrap; gap: 16px; padding-top: 20px; border-top: 1px solid var(--border); }
.editor-repeat input { min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); }
.task-editor :deep(.detail-card) { margin-top: 20px; padding: 0; border: 0; background: transparent; box-shadow: none; }
.task-editor .drawer-footer { flex: none; padding: 14px 26px; gap: 16px; background: var(--surface); box-shadow: none; }
.editor-save-state { min-width: 0; flex: 1; font-size: 12px; color: var(--muted); }
.danger-link { flex: none; }
.editor-error { margin-top: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; color: var(--danger, #d45757); }
.editor-error button { margin-left: 8px; }
.editor-error pre { max-height: 120px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.recovery-banner { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px; margin-bottom: 20px; background: var(--surface-soft); border-radius: 8px; font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .task-editor { transition: none; } }
</style>
