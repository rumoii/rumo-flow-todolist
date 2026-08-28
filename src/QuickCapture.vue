<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { parseQuickAdd } from './shared/quick-add'
import { ensureTags } from './shared/tag-utils'
import type { Tag, TaskList } from './shared/contracts'
const title = ref(''); const input = ref<HTMLInputElement>(); const lists = ref<TaskList[]>([]); const tags = ref<Tag[]>([]); const message = ref('')
onMounted(async () => { [lists.value, tags.value] = await Promise.all([window.todoApi.lists.list(), window.todoApi.tags.list()]); await nextTick(); input.value?.focus() })
async function submit() { const parsed = parseQuickAdd(title.value, lists.value, tags.value); if (!parsed.input.title.trim()) return; const resolved = await ensureTags(window.todoApi, tags.value, parsed.tagNames); await window.todoApi.tasks.create({ ...parsed.input, tagIds: resolved.tags.map(tag => tag.id) }); title.value = ''; message.value = resolved.failed.length ? `任务已保存，标签创建失败：${resolved.failed.join('、')}` : '已加入收集箱'; setTimeout(() => { message.value = '' }, 1800) }
</script>
<template><main class="capture-shell" @keydown.esc="window.close()"><img src="/favicon.svg" alt=""><div><input ref="input" v-model="title" aria-label="快速捕获任务" placeholder="写下任务…  #标签 !p1 @明天 ~清单" @keydown.enter="submit"><p>{{ message || 'Enter 保存到收集箱 · Esc 关闭' }}</p></div></main></template>
<style scoped>
.capture-shell{height:100vh;display:flex;gap:16px;align-items:center;padding:24px;background:linear-gradient(135deg,#17171c,#24232c);color:#fff;font-family:Inter,"Microsoft YaHei",sans-serif}.capture-shell img{width:48px;height:48px}.capture-shell div{flex:1}.capture-shell input{width:100%;border:0;border-bottom:1px solid #54505f;background:transparent;padding:8px 0;color:#fff;font-size:20px;outline:none}.capture-shell input:focus{border-color:#9b87ff}.capture-shell p{margin:10px 0 0;color:#aaa4b5;font-size:12px}
</style>
