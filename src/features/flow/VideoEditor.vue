<script setup lang="ts">
import type { VideoReflection } from '../../shared/contracts'
const draft = defineModel<Pick<VideoReflection, 'title' | 'sourceUrl' | 'author' | 'thought'>>({ required: true })
</script>
<template>
  <div class="video-edit-grid">
    <label><span>标题</span><input v-model="draft.title" placeholder="看完后，这条视频讲了什么？" /></label>
    <label class="source-field"><span>来源</span><input v-model="draft.sourceUrl" type="url" /></label>
    <label><span>作者</span><input v-model="draft.author" placeholder="账号或创作者（选填）" /></label>
    <label class="thought-field"><span>我的思考</span><textarea v-model="draft.thought" rows="3" placeholder="我认同或不认同什么？它和我的经历有什么关系？"></textarea></label>
  </div>
</template>
<style scoped>
.video-edit-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
label { display: flex; min-width: 0; flex-direction: column; gap: 8px; }
label > span { color: var(--text-secondary); font-size: 13px; }
input, textarea { width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); color: var(--text); font-size: 14px; line-height: 1.6; }
textarea { resize: vertical; }
.source-field, .thought-field { grid-column: 1 / -1; }
.source-field { grid-row: 2; }
</style>
