<script setup lang="ts">
import { inject, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import FlowActions from '../features/flow/FlowActions.vue'
import FlowFacts from '../features/flow/FlowFacts.vue'
import FlowHistory from '../features/flow/FlowHistory.vue'
import { navigationKey } from '../features/workspace/navigation'
import ReviewQuestions from '../features/flow/ReviewQuestions.vue'
import VideoEditor from '../features/flow/VideoEditor.vue'
import FlowCalendar from '../features/flow/FlowCalendar.vue'
import DraftStatus from './DraftStatus.vue'
import FlowPreferences from '../features/flow/FlowPreferences.vue'
import { useFlow } from '../features/flow/useFlow'
const props = defineProps<{ todayCompletedCount: number; todayPendingCount: number }>()
const historyKeyword = defineModel<string>('historyKeyword', { default: '' })
const emit = defineEmits<{ historyVisible: [visible: boolean]; searchHistory: [] }>()
const { drafts, monthDays, todayIso, selectedDate, activeTab, day, summary, reviewDraft, reviewInputChoice, videoUrl, addingVideo, videoDrafts, loading, notice, confirmation, selectedSummary, isToday, pendingThoughts, overLimit, reviewDirty, monthLabel, selectedDateLabel, inputOptions, calendarCells, resolveConfirmation, trapConfirmationFocus, discardReview, discardVideo, selectDay, changeMonth, daySummary, setActiveTab, moveTab, addVideo, openVideo, saveVideo, removeVideo, saveReview } = useFlow(props)
watch(activeTab, tab => emit('historyVisible', tab === 'history'), { immediate: true })
const flowRoot = ref<HTMLElement>()
const calendarOpen = ref(false)
let calendarChosen = false
let widthObserver: ResizeObserver | undefined
onMounted(() => {
  widthObserver = new ResizeObserver(entries => { if (!calendarChosen) calendarOpen.value = entries[0].contentRect.width >= 960 })
  if (flowRoot.value) widthObserver.observe(flowRoot.value)
})
onBeforeUnmount(() => widthObserver?.disconnect())
function toggleCalendar() { calendarChosen = true; calendarOpen.value = !calendarOpen.value }
const backfillOpen = ref(false)
const backfillDate = ref(todayIso.value)
const returningToHistory = ref(false)
const historyOrigin = ref(false)
let historyScroll = 0
watch(backfillOpen, async value => { if (value) { await nextTick(); flowRoot.value?.querySelector<HTMLInputElement>('[aria-label="补录日期"]')?.focus() } })
async function calendarDay(date: string) {
  if (activeTab.value === 'history') await editHistory(date)
  else await selectDay(date)
}
function scrollContainer() { return flowRoot.value?.closest('.main-content') as HTMLElement | null }
async function editHistory(date: string) {
  historyScroll = scrollContainer()?.scrollTop ?? 0
  if (!await drafts.leave.request(['flow'])) return
  if (!await selectDay(date, true)) return
  await setActiveTab('review', true)
  if (activeTab.value !== 'review') return
  historyOrigin.value = true
  scrollContainer()?.scrollTo({ top: 0 })
}
async function returnHistory() {
  returningToHistory.value = true
  await setActiveTab('history')
  if (activeTab.value !== 'history') returningToHistory.value = false
}
async function restoreHistoryPosition() {
  if (!returningToHistory.value) return
  await nextTick()
  scrollContainer()?.scrollTo({ top: historyScroll })
  returningToHistory.value = false
}
async function backfill() {
  if (!backfillDate.value || backfillDate.value > todayIso.value) return
  const fromHistory = activeTab.value === 'history'
  if (fromHistory) historyScroll = scrollContainer()?.scrollTop ?? 0
  if (!await drafts.leave.request(['flow'])) return
  if (!await selectDay(backfillDate.value, true)) return
  await setActiveTab('input', true)
  if (activeTab.value !== 'input') return
  historyOrigin.value = fromHistory
  backfillOpen.value = false
}
const expandedReview = ref(false)
let navigationSequence = 0
const navigation = inject(navigationKey, null)
watch(() => navigation?.flowTarget.value, async target => {
  if (!target) return
  const request = ++navigationSequence
  await selectDay(target.date, true)
  if (request !== navigationSequence || selectedDate.value !== target.date) return
  await setActiveTab(target.videoId ? 'input' : 'review', true)
  await nextTick()
  if (target.videoId) document.getElementById(`video-${target.videoId}`)?.scrollIntoView({ block: 'center' })
}, { immediate: true })
</script>
<template>

  <div ref="flowRoot" class="flow-view" :inert="loading || addingVideo || drafts.paused.value || drafts.saving.value">
    <div v-if="notice" class="flow-notice" role="status">{{ notice }}</div>
    <header class="flow-date-heading"><div><small>{{ isToday ? '今天' : '补写往日记录' }}</small><h2>{{ selectedDateLabel }}</h2></div><button v-if="!isToday" class="secondary-button" @click="selectDay(todayIso)">回到今天</button></header>
    <section v-show="activeTab !== 'history'" class="flow-overview">
      <article :class="['flow-stat', { warning: overLimit }]">
        <span>{{ isToday ? '今日输入' : '当日输入' }}</span><strong>{{ day.videos.length }}/{{ day.review.videoLimit }}</strong><small>{{ pendingThoughts ? `${pendingThoughts} 条待补思考` : '每次输入都留下痕迹' }}</small>
      </article>
      <article class="flow-stat"><span>今日待办</span><strong>{{ props.todayCompletedCount }}</strong><small>已完成 · {{ props.todayPendingCount }} 项仍待处理</small></article>
      <article class="flow-stat"><span>近七日复盘</span><strong>{{ summary.reviewedDays }}/7</strong><small>不追连续，只看真实变化</small></article>
      <article class="flow-stat"><span>近七日视频</span><strong>{{ summary.videoCount }}</strong><small>{{ summary.overLimitDays }} 个超额日 · {{ summary.pendingThoughts }} 条待思考</small></article>
    </section>

    <div class="flow-top-actions">
      <button v-if="historyOrigin && activeTab !== 'history'" class="secondary-button" @click="returnHistory">← 返回历史记录</button>
      <button class="text-button" :aria-expanded="calendarOpen" aria-controls="flow-calendar" @click="toggleCalendar">日历跳转</button>
      <button v-if="activeTab !== 'history'" class="secondary-button" :aria-expanded="backfillOpen" @click="backfillOpen = !backfillOpen">补记往日</button>
      <form v-if="backfillOpen" class="backfill-form" @submit.prevent="backfill"><label>记录日期<input v-model="backfillDate" aria-label="补录日期" type="date" :max="todayIso" required /></label><button class="primary-button" type="submit">开始补记</button><button type="button" class="text-button" @click="backfillOpen = false">取消</button></form>
    </div>
    <div class="flow-layout" :class="{ 'without-calendar': !calendarOpen }">
      <div class="flow-primary">
        <div class="flow-tabs" role="tablist" aria-label="心流内容" @keydown="moveTab">
          <button id="flow-tab-input" role="tab" :aria-selected="activeTab === 'input'" aria-controls="flow-panel-input" :tabindex="activeTab === 'input' ? 0 : -1" :class="{ active: activeTab === 'input' }" @click="setActiveTab('input')"><span>输入记录</span><small>{{ day.videos.length }} 条</small></button>
          <button id="flow-tab-review" role="tab" :aria-selected="activeTab === 'review'" aria-controls="flow-panel-review" :tabindex="activeTab === 'review' ? 0 : -1" :class="{ active: activeTab === 'review' }" @click="setActiveTab('review')"><span>每日复盘</span><small>{{ day.review.savedAt ? '已保存' : '待完成' }}</small></button>
          <button id="flow-tab-history" role="tab" :aria-selected="activeTab === 'history'" aria-controls="flow-panel-history" :tabindex="activeTab === 'history' ? 0 : -1" :class="{ active: activeTab === 'history' }" @click="setActiveTab('history')"><span>历史记录</span></button>
        </div>

        <FlowHistory v-model:keyword="historyKeyword" @search="emit('searchHistory')" v-show="activeTab === 'history'" id="flow-panel-history" role="tabpanel" aria-labelledby="flow-tab-history" :visible="activeTab === 'history'" :today="todayIso" @edit="editHistory" @backfill="backfillOpen = true" @ready="restoreHistoryPosition" />
        <Transition name="flow-tab" mode="out-in">
          <section v-if="activeTab === 'input'" id="flow-panel-input" key="input" class="flow-card" role="tabpanel" aria-labelledby="flow-tab-input">
            <header class="section-heading"><div><small>{{ isToday ? '观看之前' : '历史输入' }}</small><h2>{{ isToday ? '先看，再留下自己的判断' : selectedDateLabel }}</h2></div><span :class="['quota-pill', { warning: overLimit }]">{{ day.videos.length }}/{{ day.review.videoLimit }}</span></header>
            <FlowPreferences v-if="isToday" kind="quota" />
            <div class="video-composer">
              <label><span>{{ isToday ? '粘贴准备观看的视频链接' : '补录当天看过的视频链接' }}</span><input v-model="videoUrl" type="url" placeholder="https://…" @keydown.enter="!$event.isComposing && addVideo()" /></label>
              <button class="primary-button" :disabled="addingVideo" @click="addVideo()">{{ isToday ? '暂存并打开' : '保存补录' }}</button>
              <p>{{ isToday ? '链接会先保存在本地。看完回来，再补标题、作者和你的思考。' : '补录计入所选日期，不会打开浏览器；保存后可继续补充标题和思考。' }}</p>
            </div>
            <p v-if="!isToday && !selectedSummary" class="history-hint">首次补录使用当前视频额度 {{ day.review.videoLimit }}，不代表过去的额度设置。</p>
            <div v-if="loading" class="flow-empty">正在加载…</div>
            <div v-else-if="!day.videos.length" class="flow-empty">{{ isToday ? '今天还没有打开视频。没有刷，也是一种清醒的选择。' : '这一天没有视频记录。' }}</div>
            <div v-else class="video-list">
              <article v-for="video in day.videos" :key="video.id" :id="`video-${video.id}`" :class="['video-entry', { 'navigation-target': navigation?.flowTarget.value?.videoId === video.id }]"><DraftStatus kind="video" :draft-key="video.id" @discard="discardVideo(video)" />
                <div class="video-entry-heading"><div><span :class="['thought-state', { done: video.thought.trim() }]">{{ video.thought.trim() ? '已思考' : '待补思考' }}</span><strong :class="{ placeholder: !video.title }">{{ video.title || '待补充标题' }}</strong><small>{{ video.sourcePlatform }}<template v-if="video.author"> · {{ video.author }}</template></small></div><button class="text-button" @click="openVideo(video.sourceUrl)">再次打开 ↗</button></div>
                <VideoEditor v-if="videoDrafts[video.id]" v-model="videoDrafts[video.id]" />
                <footer><button class="danger-button" @click="removeVideo(video)">删除</button><button class="secondary-button" @click="saveVideo(video)">保存记录</button></footer>
                <FlowActions :source="{ kind: 'video', key: video.id }" :updated-at="video.updatedAt" :date="video.date" :saved="true" :dirty="Object.entries(videoDrafts[video.id] || {}).some(([key, value]) => value !== video[key as 'title' | 'sourceUrl' | 'author' | 'thought'])" :suggestion="videoDrafts[video.id]?.thought || video.title" />
              </article>
            </div>
          </section>

          <section v-else-if="activeTab === 'review'" id="flow-panel-review" key="review" class="flow-card review-card" role="tabpanel" aria-labelledby="flow-tab-review">
            <header class="section-heading"><div><small>每日复盘</small><h2>{{ selectedDateLabel }}</h2></div><span :class="['saved-pill', { saved: day.review.savedAt }]">{{ day.review.savedAt ? '已保存' : '未保存' }}</span></header>
  <DraftStatus kind="review" :draft-key="selectedDate" @discard="discardReview" />
            <button type="button" class="secondary-button review-toggle" :aria-expanded="expandedReview" aria-controls="flow-review-questions" @click="expandedReview = !expandedReview">
              <span>{{ expandedReview ? '收起为简版复盘（3 问）' : '展开完整复盘（6 问）' }}</span>
              <svg :class="{ expanded: expandedReview }" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <ReviewQuestions v-model="reviewDraft" v-model:input-choice="reviewInputChoice" :expanded-review="expandedReview" :is-today="isToday" :input-options="inputOptions" />
            <footer class="review-footer"><small>{{ day.review.savedAt ? `上次保存：${new Date(day.review.savedAt).toLocaleString('zh-CN')}` : `内容可留空，保存即表示 ${selectedDate} 已经复盘。` }}</small><button class="primary-button" @click="saveReview()">{{ isToday ? '保存今日复盘' : '保存当日复盘' }}</button></footer>
            <FlowFacts :date="selectedDate" />
            <FlowActions :source="{ kind: 'review', key: selectedDate }" :updated-at="day.review.updatedAt" :date="selectedDate" :saved="!!day.review.savedAt" :dirty="reviewDirty" :suggestion="reviewDraft.tomorrowExpectation || ''" />
            <FlowPreferences kind="reminder" />
          </section>
        </Transition>
      </div>

      <FlowCalendar v-show="calendarOpen" :today-iso="todayIso" :selected-date="selectedDate" :month-label="monthLabel" :selected-date-label="selectedDateLabel" :calendar-cells="calendarCells" :month-days="monthDays" :video-count="day.videos.length" @month="changeMonth" @select="calendarDay" />
    </div>
    <Transition name="dialog">
      <div v-if="confirmation" class="dialog-backdrop flow-confirm-backdrop" @click.self="resolveConfirmation(false)" @keydown="trapConfirmationFocus">
        <section class="confirm-dialog flow-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="flow-confirm-title" tabindex="-1">
          <div class="dialog-icon">!</div>
          <h2 id="flow-confirm-title">{{ confirmation.title }}</h2>
          <p>{{ confirmation.message }}</p>
          <div class="dialog-actions"><button class="cancel-button" @click="resolveConfirmation(false)">取消</button><button class="delete-button" @click="resolveConfirmation(true)">{{ confirmation.confirmLabel }}</button></div>
        </section>
      </div>
    </Transition>
  </div>

</template>
<style scoped>
.flow-view { position: relative; color: var(--text); }
.flow-date-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 20px; }
.flow-date-heading h2 { margin: 5px 0 0; font-size: 22px; }
.flow-date-heading small { color: var(--muted); font-size: 12px; }
.flow-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 12px 0; margin-bottom: 20px; border-block: 1px solid var(--border); }
.flow-stat { display: flex; min-height: 76px; flex-direction: column; padding: 4px 18px; border-right: 1px solid var(--border); }
.flow-stat:last-child { border-right: 0; }
.flow-stat span, .flow-stat small { color: var(--muted); font-size: 12px; }
.flow-stat strong { margin-top: 5px; color: var(--text); font-size: 21px; font-weight: 600; }
.flow-stat small { margin-top: auto; }
.flow-stat.warning strong { color: var(--warning-color, #b75c2e); }
.flow-top-actions { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.backfill-form { display: flex; align-items: flex-end; gap: 12px; width: 100%; padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.backfill-form label { gap: 8px; font-size: 12px; color: var(--text-secondary); }
.flow-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; align-items: start; gap: 16px; }
.flow-layout.without-calendar { grid-template-columns: minmax(0, 1fr); }
.flow-primary { min-width: 0; }
.flow-tabs { display: inline-flex; gap: 4px; margin-bottom: 12px; padding: 4px; border-radius: 9px; background: var(--surface-soft); }
.flow-tabs button { display: flex; align-items: center; gap: 9px; min-width: 128px; height: 36px; padding: 0 13px; border-radius: 6px; color: var(--muted); font-size: 12px; transition: background-color var(--motion-fast), color var(--motion-fast); }
.flow-tabs button:hover { color: var(--text); }
.flow-tabs button.active { background: var(--accent-soft); color: var(--accent); }
.flow-tabs button small { margin-left: auto; color: inherit; font-size: 11px; opacity: .8; }
.flow-card { padding: 24px; border-radius: 10px; background: var(--surface); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-heading small { color: var(--muted); font-size: 12px; }
.section-heading h2 { margin: 2px 0 0; font-size: 16px; font-weight: 600; }
.quota-pill, .saved-pill { flex-shrink: 0; padding: 4px 9px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 12px; }
.quota-pill.warning { color: var(--warning-color, #b75c2e); }
.saved-pill { background: var(--surface-soft); color: var(--muted); }
.saved-pill.saved { color: var(--success-color, #438b5d); }
.video-composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 9px; padding: 13px; border-radius: 8px; background: var(--surface-soft); }
.video-composer p { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: 12px; }
label { display: flex; min-width: 0; flex-direction: column; gap: 8px; }
label > span { color: var(--text-secondary); font-size: 12px; }
input { width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); padding: 8px 9px; color: var(--text); font-size: 14px; transition: border-color var(--motion-fast); }
input:focus { border-color: var(--accent); }
.primary-button { height: 34px; padding: 0 14px; border-radius: 6px; background: var(--accent-solid); color: #fff; white-space: nowrap; font-size: 12px; }
.primary-button:hover { filter: brightness(.96); }
.secondary-button { min-width: auto; }
.flow-empty { margin: 0; padding: 16px; border-radius: 7px; background: var(--surface-soft); color: var(--muted); text-align: center; font-size: 12px; }
.video-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.video-entry { padding: 20px 0; border-top: 1px solid var(--border); }
.video-entry-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.video-entry-heading > div { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 4px 8px; min-width: 0; }
.video-entry-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.video-entry-heading strong.placeholder { color: var(--muted); font-weight: 500; }
.video-entry-heading small { grid-column: 2; color: var(--muted); font-size: 12px; }
.thought-state { grid-row: 1 / 3; padding: 3px 6px; border-radius: 9px; background: var(--surface-soft); color: var(--warning-color, #b75c2e); font-size: 11px; }
.thought-state.done { color: var(--success-color, #438b5d); }
.text-button { color: var(--accent); font-size: 12px; white-space: nowrap; }
.video-entry footer { display: flex; justify-content: space-between; margin-top: 10px; }
.danger-button { color: var(--danger-color, #d95363); font-size: 12px; }
.review-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 16px 0; padding-top: 14px; border-top: 1px solid var(--border); }
.review-footer small { color: var(--muted); font-size: 12px; }
.flow-notice { position: fixed; z-index: 35; right: 28px; bottom: 24px; max-width: min(520px, calc(100vw - 40px)); max-height: 140px; overflow: auto; overflow-wrap: anywhere; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); }
.flow-tab-enter-active, .flow-tab-leave-active { transition: opacity var(--motion-fast); }
.flow-tab-enter-from, .flow-tab-leave-to { opacity: 0; }
.flow-confirm-backdrop { z-index: 60; }
.flow-confirm-dialog { width: min(380px, calc(100vw - 36px)); }
@media (max-width: 1080px) {
  .flow-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 12px; }
  .flow-stat:nth-child(2) { border-right: 0; }
  .flow-layout { grid-template-columns: minmax(0, 1fr) 230px; }
}
@media (prefers-reduced-motion: reduce) {
  .flow-view *, .flow-tab-enter-active, .flow-tab-leave-active { transition: none !important; }
}
</style>
