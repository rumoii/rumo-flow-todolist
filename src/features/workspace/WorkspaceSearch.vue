<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { SearchHit } from '../../shared/contracts'
import { navigationKey } from './navigation'
import { useWorkspaceContext } from './context'
const { workspaceSearch: search, trapDialogFocus, drafts } = useWorkspaceContext()
const navigation = inject(navigationKey)!
const input = ref<HTMLInputElement>()
const localQuery = ref('')
const query = computed({ get: () => search.scope.value === 'all' ? search.globalQuery.value : localQuery.value, set: value => { if (search.scope.value === 'all') search.globalQuery.value = value; else localQuery.value = value } })
const hits = ref<SearchHit[]>([])
const loading = ref(false)
const navigating = ref(false)
const error = ref('')
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
let origin: HTMLElement | null = null
async function load() {
  const request = ++sequence
  const text = search.globalQuery.value.trim()
  error.value = ''
  hits.value = []
  if (!text || !search.open.value || search.scope.value !== 'all') { loading.value = false; return }
  loading.value = true
  try { const result = await window.todoApi.tasks.search(text); if (request === sequence) hits.value = result }
  catch { if (request === sequence) error.value = '搜索失败，请重试' }
  finally { if (request === sequence) loading.value = false }
}
function close() { if (!navigating.value) search.open.value = false }
function apply() {
  if (search.scope.value !== 'current' || !search.currentAvailable.value) return
  search.currentKeyword.value = localQuery.value.trim()
  close()
}
async function openHit(hit: SearchHit) {
  if (navigating.value) return
  navigating.value = true
  error.value = ''
  try {
    await drafts.flush()
    const opened = hit.kind === 'task' ? await navigation.openTask(hit.key) : await navigation.openFlow(hit.date!, hit.kind === 'video' ? hit.key : undefined)
    if (!opened) return
    origin = null
    search.open.value = false
  } catch { error.value = '草稿保留失败，未切换页面，请重试' }
  finally { navigating.value = false }
}
watch(() => search.open.value, async value => {
  if (value) { origin = document.activeElement as HTMLElement; localQuery.value = search.currentKeyword.value; await nextTick(); input.value?.focus() }
  else { await nextTick(); if (origin?.isConnected) origin.focus(); origin = null }
})
watch(() => [search.open.value, search.scope.value, search.globalQuery.value], () => {
  clearTimeout(timer); sequence++; hits.value = []; error.value = ''
  loading.value = search.open.value && search.scope.value === 'all' && !!search.globalQuery.value.trim()
  if (loading.value) timer = setTimeout(load, 250)
})
watch(() => search.currentAvailable.value, available => { if (!available) search.scope.value = 'all' })
onBeforeUnmount(() => { clearTimeout(timer); sequence++ })
</script>
<template>
  <Transition name="search-dialog">
    <div v-if="search.open.value" class="workspace-search-backdrop" @click.self="close" @keydown="trapDialogFocus" @keydown.esc.stop.prevent="close">
      <section class="workspace-search-dialog" role="dialog" aria-modal="true" aria-label="搜索" tabindex="-1" :aria-busy="navigating">
        <header><h2>搜索</h2><button class="icon-button" aria-label="关闭搜索" :disabled="navigating" @click="close">×</button></header>
        <div class="search-scopes" role="group" aria-label="搜索范围">
          <button :aria-pressed="search.scope.value === 'all'" @click="search.scope.value = 'all'">全部内容</button>
          <button v-if="search.currentAvailable.value" :aria-pressed="search.scope.value === 'current'" @click="search.scope.value = 'current'">当前列表 · {{ search.currentName.value }}</button>
        </div>
        <form class="unified-search-form" @submit.prevent="search.scope.value === 'current' ? apply() : load()">
          <input ref="input" v-model="query" type="search" aria-label="搜索关键词" :placeholder="search.scope.value === 'all' ? '搜索任务、视频记录与复盘' : `筛选${search.currentName.value}`" maxlength="500" :disabled="navigating" />
          <button v-if="search.scope.value === 'current'" class="save-button">应用筛选</button>
        </form>
        <p class="search-description">{{ search.scope.value === 'all' ? '仅搜索已保存内容，不包含草稿和回收站。' : '与当前页面已有筛选共同生效，应用后在原页面查看。' }}</p>
        <div class="unified-search-results">
          <p v-if="error" role="alert">{{ error }} <button class="text-button" @click="load">重试搜索</button></p>
          <p v-else-if="loading" role="status">正在搜索…</p>
          <p v-else-if="search.scope.value === 'all' && query.trim() && !hits.length">没有匹配内容</p>
          <button v-for="hit in hits" :key="`${hit.kind}:${hit.key}`" class="unified-search-hit" :disabled="navigating" @click="openHit(hit)"><small>{{ { task: '任务', video: '视频', review: '复盘' }[hit.kind] }} · {{ hit.date }}</small><strong>{{ hit.title }}</strong><span>{{ hit.excerpt }}</span></button>
        </div>
      </section>
    </div>
  </Transition>
</template>
