<script setup lang="ts">
import { computed, ref } from 'vue'
import SelectField from '../../components/SelectField.vue'
import type { TaskPriority } from '../../shared/contracts'
import { useWorkspaceContext } from './context'
const { editingFilter, filterEditName, filterEditKeyword, filterEditStatus, filterEditListId, filterEditPriorities, filterEditTagIds, filterEditDue, filterEditError, filterEditBusy, saveFilterEdit, cancelFilterEdit, sortedLists, tags, trapDialogFocus } = useWorkspaceContext()
const composing = ref(false)
const priorityChoices: { value: TaskPriority; label: string }[] = [{ value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }, { value: 'none', label: '未设置' }]
const staleListOption = computed(() => {
  const listId = editingFilter.value?.criteria.listId
  if (listId === undefined || listId === null || sortedLists.value.some(list => list.id === listId))
    return null
  return { value: listId, label: '已不可用' }
})
const listOptions = computed(() => [
  { value: 'any', label: '任意清单' },
  { value: 'inbox', label: '收集箱' },
  ...sortedLists.value.map(list => ({ value: list.id, label: list.name })),
  ...(staleListOption.value ? [staleListOption.value] : []),
])
const tagOptions = computed(() => {
  const known = new Set(tags.value.map(tag => tag.id))
  const stale = (editingFilter.value?.criteria.tagIds ?? []).filter(id => !known.has(id)).map(id => ({ value: id, label: '已不可用' }))
  return [...tags.value.map(tag => ({ value: tag.id, label: `#${tag.name}` })), ...stale]
})
function onNameEnter(event: KeyboardEvent) {
  if (composing.value)
    return
  event.preventDefault()
  void saveFilterEdit()
}
function requestClose() {
  if (filterEditBusy.value)
    return
  cancelFilterEdit()
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="editingFilter" class="dialog-backdrop" @click.self="requestClose" @keydown="trapDialogFocus">
      <section class="confirm-dialog filter-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-edit-title" tabindex="-1">
        <h2 id="filter-edit-title">编辑筛选</h2>
        <div class="filter-edit-form">
          <div class="filter-field-row">
            <span>名称</span>
            <input v-model="filterEditName" class="filter-edit-input" placeholder="筛选名称" :disabled="filterEditBusy" @compositionstart="composing = true" @compositionend="composing = false" @keydown.enter="onNameEnter" />
          </div>
          <div class="filter-field-row">
            <span>关键词</span>
            <input v-model="filterEditKeyword" class="filter-edit-input" placeholder="关键词" :disabled="filterEditBusy" />
          </div>
          <div class="filter-field-row">
            <span>状态</span>
            <SelectField v-model="filterEditStatus" aria-label="筛选状态" :disabled="filterEditBusy" :options="[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'all', label: '全部' }]" />
          </div>
          <div class="filter-field-row">
            <span>清单</span>
            <SelectField v-model="filterEditListId" aria-label="筛选清单" :disabled="filterEditBusy" :options="listOptions" />
          </div>
          <div class="filter-field-row">
            <span>重要程度</span>
            <div class="filter-multi" role="group" aria-label="筛选重要程度">
              <label v-for="priority in priorityChoices" :key="priority.value">
                <input v-model="filterEditPriorities" type="checkbox" :value="priority.value" :disabled="filterEditBusy" />{{ priority.label }}
              </label>
            </div>
          </div>
          <div class="filter-field-row">
            <span>标签</span>
            <div class="filter-multi" role="group" aria-label="筛选标签">
              <label v-for="tag in tagOptions" :key="tag.value">
                <input v-model="filterEditTagIds" type="checkbox" :value="tag.value" :disabled="filterEditBusy" />{{ tag.label }}
              </label>
            </div>
          </div>
          <div class="filter-field-row">
            <span>日期</span>
            <SelectField v-model="filterEditDue" aria-label="筛选日期" :disabled="filterEditBusy" :options="[{ value: 'any', label: '任意日期' }, { value: 'today', label: '今天' }, { value: 'overdue', label: '已逾期' }, { value: 'next7', label: '未来 7 天' }, { value: 'none', label: '无日期' }]" />
          </div>
        </div>
        <p v-if="filterEditError" class="filter-edit-error" role="alert">{{ filterEditError }}</p>
        <div class="dialog-actions">
          <button class="cancel-button" :disabled="filterEditBusy" @click="requestClose">取消</button>
          <button class="save-button" :disabled="filterEditBusy" @click="saveFilterEdit">{{ filterEditBusy ? '保存中…' : '保存' }}</button>
        </div>
      </section>
    </div>
  </Transition>
</template>
