<script setup lang="ts">
import { useWorkspaceContext } from './context'
const { tags, newTagName, managedTagDrafts, pendingTagDelete, tagsSaving, createManagedTag, updateManagedTag, deleteManagedTag, trapDialogFocus } = useWorkspaceContext()
</script>

<template>
  <section class="tag-page" aria-label="标签管理">
    <form class="tag-create-card" @submit.prevent="createManagedTag">
      <div><h2>让任务更有条理</h2><p>用标签串联不同清单里的任务。</p></div>
      <div class="tag-create-row"><input v-model="newTagName" aria-label="新标签名称" placeholder="新标签名称" :disabled="tagsSaving" /><button class="primary-button" :disabled="tagsSaving || !newTagName.trim()">创建标签</button></div>
    </form>
    <div class="tag-list-heading"><h2>全部标签</h2><span>{{ tags.length }} 个</span></div>
    <div v-if="tags.length" class="tag-table">
      <div v-for="tag in tags" :key="tag.id" class="tag-table-row">
        <input v-model="managedTagDrafts[tag.id].color" type="color" :aria-label="`标签颜色 ${tag.name}`" :disabled="tagsSaving" />
        <input v-model="managedTagDrafts[tag.id].name" :aria-label="`标签名称 ${tag.name}`" :disabled="tagsSaving" @keydown.enter="updateManagedTag(tag)" />
        <button class="secondary-button" :disabled="tagsSaving" @click="updateManagedTag(tag)">保存</button>
        <button class="danger-link" :disabled="tagsSaving" :aria-label="`删除标签 ${tag.name}`" @click="pendingTagDelete = tag">删除</button>
      </div>
    </div>
    <div v-else class="tag-empty-state"><span aria-hidden="true">#</span><h3>还没有标签</h3><p>创建第一个标签，在任务详情中关联它。</p></div>
    <Teleport to="body">
      <div v-if="pendingTagDelete" class="dialog-backdrop" @keydown="trapDialogFocus" @keydown.esc.stop="!tagsSaving && (pendingTagDelete = null)">
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-tag-title" tabindex="-1">
          <h2 id="delete-tag-title">删除标签「{{ pendingTagDelete.name }}」？</h2><p>仅解除标签关联，不会删除任务。</p>
          <div class="dialog-actions"><button class="cancel-button" :disabled="tagsSaving" @click="pendingTagDelete = null">取消</button><button class="danger-button" :disabled="tagsSaving" @click="deleteManagedTag">删除标签</button></div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
