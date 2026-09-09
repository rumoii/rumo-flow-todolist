<script setup lang="ts">
import { computed } from 'vue'
import type { SaveDailyReviewInput } from '../../shared/contracts'
import SelectField from '../../components/SelectField.vue'
const reviewDraft = defineModel<Omit<SaveDailyReviewInput, 'date' | 'inputType' | 'inputVideoId'>>({ required: true })
const reviewInputChoice = defineModel<string>('inputChoice', { required: true })
const props = defineProps<{ expandedReview: boolean; isToday: boolean; inputOptions: { value: string; label: string }[] }>()
const dayWord = computed(() => props.isToday ? '今天' : '当天')
</script>
<template>
<div id="flow-review-questions" :class="['review-grid', { 'light-review': !expandedReview }]">
              <label><span>1 · {{ dayWord }}做好了什么？</span><textarea v-model="reviewDraft.didWell" rows="3" placeholder="哪件事值得肯定？"></textarea></label>
              <label v-show="expandedReview"><span>2 · {{ dayWord }}什么没做好？</span><textarea v-model="reviewDraft.didNotWell" rows="3" placeholder="如实写下，不责备自己。"></textarea></label>
              <label class="wide"><span>{{ expandedReview ? 3 : 2 }} · {{ dayWord }}有什么可以改进？下次可以怎么做？</span><textarea v-model="reviewDraft.reflection" rows="3" placeholder="写下一件不够满意的事，以及下次可以尝试的做法。"></textarea></label>
              <label v-show="expandedReview" class="wide"><span>4 · {{ dayWord }}最有价值的一个输入是什么？</span><SelectField v-model="reviewInputChoice" :aria-label="`${dayWord}最有价值的输入`" :options="inputOptions" /><textarea v-if="reviewInputChoice === 'other'" v-model="reviewDraft.inputText" rows="2" placeholder="来自哪本书、哪篇文章或哪次谈话？"></textarea></label>
              <label v-show="expandedReview"><span>5 · {{ dayWord }}完成的一个输出是什么？</span><textarea v-model="reviewDraft.outputText" rows="3" placeholder="文字、作品、表达或一次行动。"></textarea></label>
              <label><span>{{ expandedReview ? 6 : 3 }} · {{ isToday ? '明天' : '对下一天' }}有什么期待？准备从哪一步开始？</span><textarea v-model="reviewDraft.tomorrowExpectation" rows="3" :placeholder="isToday ? '给明天留一个轻盈的起点。' : '回想当时，你对下一天有什么期待？'"></textarea></label>
            </div>
</template>
<style scoped>
.review-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
label { display: flex; min-width: 0; flex-direction: column; gap: 8px; }
label > span { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.wide { grid-column: 1 / -1; }
textarea { width: 100%; min-height: 100px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-soft); color: var(--text); font-size: 14px; line-height: 1.75; resize: vertical; transition: border-color var(--motion-fast); }
textarea:focus { border-color: var(--accent); }
.light-review { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 1000px) { .review-grid { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { textarea { transition: none; } }
</style>
