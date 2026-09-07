<script setup lang="ts">
import { inject } from 'vue'
import { draftCoordinatorKey } from '../composables/draft-coordinator'
import type { DraftKind } from '../shared/drafts'
defineProps<{ kind: DraftKind; draftKey: string }>()
defineEmits<{ discard: [] }>()
const drafts = inject(draftCoordinatorKey, null)
</script>

<template>
  <div v-if="drafts?.supported" class="draft-status" role="status">
    <span>{{ drafts.status(kind, draftKey) }}</span>
    <button v-if="drafts.error(kind, draftKey)" type="button" @click="drafts.flush().catch(() => undefined)">重试保留</button>
    <button v-if="drafts.error(kind, draftKey).includes('已变化') || drafts.error(kind, draftKey).includes('已删除')" type="button" @click="drafts.reload(kind, draftKey).catch(() => undefined)">保留输入并重新同步</button>
    <button v-if="drafts.status(kind, draftKey)" type="button" @click="$emit('discard')">放弃草稿</button>
  </div>
</template>

<style scoped>
.draft-status { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary, #72727e); margin: 10px 0; }
.draft-status button { border: 0; background: transparent; color: var(--accent, #856af9); cursor: pointer; font: inherit; padding: 4px; }
</style>
