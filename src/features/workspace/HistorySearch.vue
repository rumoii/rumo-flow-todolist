<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import type { SearchHit } from '../../shared/contracts'
import { navigationKey } from './navigation'
const navigation = inject(navigationKey)!
const query = ref('')
const hits = ref<SearchHit[]>([])
const error = ref('')
const loading = ref(false)
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, value => {
  clearTimeout(timer); const request = ++sequence; hits.value = []; error.value = ''
  loading.value = !!value.trim()
  if (!value.trim()) return
  timer = setTimeout(async () => { try { const result = await window.todoApi.tasks.search(value); if (request === sequence) hits.value = result } catch { if (request === sequence) error.value = '搜索失败，请修改关键词重试' } finally { if (request === sequence) loading.value = false } }, 250)
})
async function open(hit: SearchHit) {
  try { if (hit.kind === 'task') await navigation.openTask(hit.key); else await navigation.openFlow(hit.date!, hit.kind === 'video' ? hit.key : undefined) }
  catch { error.value = '草稿保留失败，未切换页面' }
}
onBeforeUnmount(() => { clearTimeout(timer); sequence++ })
</script>
<template><section class="planning-panel"><input v-model="query" class="history-query" placeholder="搜索任务、视频思考、每日复盘" aria-label="历史搜索" maxlength="500" /><p>仅搜索已保存的内容，不包含草稿和回收站。</p><p v-if="error" role="alert">{{ error }}</p><p v-if="loading">正在搜索…</p><p v-else-if="query && !hits.length">没有匹配内容</p><button v-for="hit in hits" :key="`${hit.kind}:${hit.key}`" class="history-hit" @click="open(hit)"><span><small>{{ { task: '任务', video: '视频', review: '复盘' }[hit.kind] }} · {{ hit.date }}</small><strong>{{ hit.title }}</strong><small>{{ hit.excerpt }}</small></span></button></section></template>
