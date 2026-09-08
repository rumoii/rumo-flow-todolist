<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Task } from '../../shared/contracts'
const tasks = ref<Task[]>([])
const selected = ref<string[]>([])
const error = ref('')
const busy = ref(false)
const confirm = ref(false)
const generation = ref('')
watch(selected, () => { confirm.value = false }, { deep: true })
let sequence = 0
let unsubscribe: (() => void) | undefined
async function load() {
  const request = ++sequence
  try {
    const snapshot = await window.todoApi.drafts.get('capture', 'global')
    const result = await window.todoApi.tasks.list({ includeDeleted: true })
    if (request !== sequence) return
    if (generation.value !== snapshot.generation) selected.value = []
    generation.value = snapshot.generation
    tasks.value = result.filter(task => task.deletedAt)
    selected.value = selected.value.filter(id => tasks.value.some(task => task.id === id))
  }
  catch { if (request === sequence) error.value = '回收站加载失败，请重试' }
}
async function apply(kind: 'recover' | 'purge') {
  if (busy.value) return
  if (kind === 'purge' && !confirm.value) { confirm.value = true; return }
  busy.value = true; error.value = ''
  try { await window.todoApi.tasks.batch({ targets: tasks.value.filter(task => selected.value.includes(task.id)).map(({ id, updatedAt }) => ({ id, updatedAt })), generation: generation.value, action: { kind } }); selected.value = []; confirm.value = false; await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败' }
  finally { busy.value = false }
}
onMounted(() => { void load(); unsubscribe = window.todoApi.desktop.onDataChanged(() => { void load() }) })
onBeforeUnmount(() => { sequence++; unsubscribe?.() })
</script>
<template>
  <section class="planning-panel" :inert="busy">
    <p>删除后保留 30 天。恢复父任务时，仅恢复同次删除的子任务。永久删除父任务也会删除其回收站子任务，无法撤销。</p>
    <div class="planning-controls"><button @click="load">刷新</button><button @click="selected = tasks.map(task => task.id)">全选</button><button :disabled="busy || !selected.length" @click="apply('recover')">恢复所选</button><button :disabled="busy || !selected.length" @click="apply('purge')">{{ confirm ? '确认永久删除，无法撤销' : '永久删除' }}</button><button v-if="confirm" @click="confirm = false">取消</button></div>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="!tasks.length">回收站为空</p>
    <label v-for="task in tasks" :key="task.id" class="history-hit"><input v-model="selected" type="checkbox" :value="task.id" @change="confirm = false" /><span>{{ task.title }}<small>删除于 {{ new Date(task.deletedAt!).toLocaleString() }}</small></span></label>
  </section>
</template>
