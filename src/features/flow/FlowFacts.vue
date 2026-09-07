<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import type { Task } from '../../shared/contracts'
import { navigationKey } from '../workspace/navigation'
const props = defineProps<{ date: string }>()
const navigation = inject(navigationKey)!
const facts = ref<{ completed: Task[]; pending: Task[] }>({ completed: [], pending: [] })
const error = ref('')
let sequence = 0
async function load() { const request = ++sequence; try { const result = await window.todoApi.flow.taskFacts(props.date); if (request === sequence) { facts.value = result; error.value = '' } } catch { if (request === sequence) error.value = '任务事实加载失败' } }
async function open(task: Task) { try { await navigation.openTask(task.id) } catch { error.value = '草稿保留失败，未切换页面' } }
watch(() => props.date, () => { facts.value = { completed: [], pending: [] }; void load() }, { immediate: true })
const unsubscribe = window.todoApi.desktop.onDataChanged(() => { void load() })
onBeforeUnmount(() => { sequence++; unsubscribe() })
</script>
<template><details class="planning-panel"><summary>{{ date }} · 已完成 {{ facts.completed.length }} / 当前日计划未完成 {{ facts.pending.length }}</summary><p v-if="error" role="alert">{{ error }}</p><p>按完成时间和当前执行计划汇总，不是历史计划快照。</p><button v-for="task in facts.completed" :key="task.id" class="source-link" @click="open(task)">✓ {{ task.title }}</button><button v-for="task in facts.pending" :key="task.id" class="source-link" @click="open(task)">○ {{ task.title }}</button></details></template>
