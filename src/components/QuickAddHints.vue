<script setup lang="ts">
import { computed } from 'vue'
import type { Tag, TaskList } from '../shared/contracts'
const props = defineProps<{ tags: Tag[]; lists: TaskList[] }>()
const model = defineModel<string>({ required: true })
const token = computed(() => model.value.match(/(?:^|\s)([#~@][^\s]*)$/)?.[1] ?? '')
const suggestions = computed(() => {
  const prefix = token.value[0]
  const values = prefix === '#' ? props.tags.map(tag => `#${tag.name}`) : prefix === '~' ? props.lists.map(list => `~${list.name}`) : prefix === '@' ? ['@今天', '@明天'] : []
  return values.filter(value => value.includes(token.value)).slice(0, 6)
})
function choose(value: string) { model.value = model.value.slice(0, -token.value.length) + value + ' ' }
</script>
<template><div v-if="suggestions.length" class="quick-suggestions" aria-label="快速输入建议"><button v-for="suggestion in suggestions" :key="suggestion" @click="choose(suggestion)">{{ suggestion }}</button><small v-if="token.startsWith('@')">@ 设置截止日期，不改变计划</small></div></template>
