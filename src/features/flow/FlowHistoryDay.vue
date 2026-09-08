<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FlowDay } from '../../shared/contracts'
const props = defineProps<{ day: FlowDay }>()
const error = ref('')
const questions = computed(() => {
  const review = props.day.review
  const input = review.inputType === 'video' ? props.day.videos.find(video => video.id === review.inputVideoId)?.title || '待补充标题' : review.inputType === 'other' ? review.inputText : ''
  return [
    ['值得肯定的事', review.didWell], ['没做好的事', review.didNotWell], ['思考与改进', review.reflection],
    ['最有价值的输入', input], ['完成的输出', review.outputText], ['对下一天的期待', review.tomorrowExpectation],
  ].filter(([, value]) => value.trim())
})
async function openSource(url: string) {
  try { await window.todoApi.desktop.openExternal(url); error.value = '' }
  catch { error.value = '来源链接未能打开，请重试' }
}
</script>
<template>
  <div class="history-reading">
    <section v-if="day.videos.length" aria-label="当天输入与思考">
      <h4>当天输入与思考</h4>
      <article v-for="video in day.videos" :key="video.id" class="reading-video">
        <h5>{{ video.title || '待补充标题' }}</h5>
        <div class="reading-meta">{{ video.author || video.sourcePlatform }} <button @click="openSource(video.sourceUrl)">打开来源 ↗</button></div>
        <p v-if="video.thought">{{ video.thought }}</p><p v-else class="reading-empty">还没有留下思考</p>
      </article>
    </section>
    <section aria-label="当天复盘">
      <h4>每日复盘</h4>
      <template v-if="day.review.savedAt">
        <section v-for="[label, value] in questions" :key="label" class="reading-answer"><h5>{{ label }}</h5><p>{{ value }}</p></section>
        <p v-if="!questions.length" class="reading-empty">已保存复盘，这一天没有填写正文。</p>
        <small class="reading-meta">保存于 {{ new Date(day.review.savedAt).toLocaleString('zh-CN') }}</small>
      </template>
      <p v-else class="reading-empty">这一天尚未保存复盘。</p>
    </section>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.history-reading { border-top: 1px solid var(--border); margin-top: 22px; padding-top: 8px; }
.history-reading > section { margin: 22px 0 32px; }
h4 { margin: 0 0 22px; font-size: 12px; font-weight: 500; color: var(--muted); letter-spacing: .1em; }
h5 { margin: 0 0 8px; font-size: 15px; font-weight: 600; line-height: 1.6; }
p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.95; margin: 12px 0; color: var(--text); }
.reading-video + .reading-video { margin-top: 28px; }
.reading-answer { margin-bottom: 24px; }
.reading-meta, .reading-empty { font-size: 12px; color: var(--muted); }
button { color: var(--journal-accent); margin-left: 12px; font-size: 12px; }
</style>
