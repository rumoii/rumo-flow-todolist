<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Tag } from '../../shared/contracts'
const selected = defineModel<string[]>({ required: true })
const query = defineModel<string>('query', { required: true })
defineProps<{ tags: Tag[]; options: Tag[]; canCreate: boolean }>()
const emit = defineEmits<{ change: []; create: [] }>()
const open = ref(false)
const input = ref<HTMLInputElement>()
const trigger = ref<HTMLButtonElement>()
async function toggle() { open.value = !open.value; if (open.value) { await nextTick(); input.value?.focus() } }
function close() { open.value = false; trigger.value?.focus() }
</script>
<template>
  <div class="task-tags-field" @keydown.esc.stop.prevent="close">
    <div class="selected-tags"><span v-for="tag in tags" :key="tag.id" class="tag-chip" :title="tag.name"><span>#{{ tag.name }}</span><button :aria-label="`移除标签 ${tag.name}`" @click="selected = selected.filter(id => id !== tag.id); emit('change')">×</button></span><button ref="trigger" class="text-button" :aria-expanded="open" @click="toggle">＋ 添加标签</button></div>
    <div v-if="open" class="tag-picker">
      <input ref="input" v-model="query" aria-label="搜索或创建标签" placeholder="搜索或输入新标签" @keydown.enter="!$event.isComposing && canCreate && emit('create')" />
      <div class="tag-options"><label v-for="tag in options" :key="tag.id" :title="tag.name"><input v-model="selected" type="checkbox" :value="tag.id" @change="emit('change')" /><span>#{{ tag.name }}</span></label><span v-if="!options.length && !canCreate">暂无标签</span></div>
      <button v-if="canCreate" class="text-button" @click="emit('create')">创建并添加“{{ query.trim() }}”</button>
      <button class="text-button picker-done" @click="close">完成选择</button>
    </div>
  </div>
</template>
<style scoped>
.task-tags-field { min-width: 0; }
.selected-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tag-chip { display: inline-flex; align-items: center; max-width: 100%; gap: 6px; padding: 4px 8px; border-radius: 6px; background: var(--surface-soft); font-size: 12px; color: var(--text-secondary); }
.tag-chip > span, .tag-options span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-chip button { flex: none; }
.tag-picker { margin-top: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; }
.tag-picker > input { width: 100%; padding: 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
.tag-options { display: flex; flex-wrap: wrap; gap: 10px; max-height: 180px; overflow: auto; margin: 12px 0; }
.tag-options label { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; gap: 6px; font-size: 12px; }
.picker-done { display: block; margin-top: 12px; }
</style>
