<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import type { ActionLink } from '../../shared/contracts'
import { navigationKey } from './navigation'
const props = defineProps<{ taskId: string }>()
const navigation = inject(navigationKey)!
const links = ref<ActionLink[]>([])
const error = ref('')
let sequence = 0
async function load() { const request = ++sequence; error.value = ''; try { const result = await window.todoApi.flow.actionLinks(undefined, props.taskId); if (request === sequence) links.value = result } catch { if (request === sequence) error.value = '来源加载失败' } }
watch(() => props.taskId, () => { links.value = []; void load() }, { immediate: true })
const unsubscribe = window.todoApi.desktop.onDataChanged(() => { void load() })
async function open(link: ActionLink) { try { await navigation.openFlow(link.sourceDate, link.sourceKind === 'video' ? link.sourceKey : undefined) } catch { error.value = '草稿保留失败，未切换页面' } }
onBeforeUnmount(() => { sequence++; unsubscribe() })
</script>
<template><section v-if="links.length || error" class="detail-card"><h3>行动来源</h3><p v-if="error" role="alert">{{ error }}</p><div v-for="link in links" :key="link.requestId"><small>{{ link.sourceDate }} · {{ link.sourceKind === 'review' ? '每日复盘' : '视频思考' }}</small><p v-if="link.sourceDeleted">{{ link.sourceLabel }}（来源已删除）</p><button v-else class="source-link" @click="open(link)">{{ link.sourceLabel }}</button></div></section></template>
