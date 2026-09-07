<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import FlowActions from '../features/flow/FlowActions.vue'
import FlowFacts from '../features/flow/FlowFacts.vue'
import { navigationKey } from '../features/workspace/navigation'
import SelectField from './SelectField.vue'
import DraftStatus from './DraftStatus.vue'
import FlowPreferences from '../features/flow/FlowPreferences.vue'
import { useFlow } from '../features/flow/useFlow'
const props = defineProps<{ todayCompletedCount: number; todayPendingCount: number }>()
const { drafts, todayIso, selectedDate, activeTab, day, summary, reviewDraft, reviewInputChoice, videoUrl, videoDrafts, loading, notice, confirmation, selectedSummary, isToday, pendingThoughts, overLimit, monthLabel, selectedDateLabel, inputOptions, calendarCells, resolveConfirmation, trapConfirmationFocus, discardReview, discardVideo, selectDay, changeMonth, daySummary, setActiveTab, moveTab, addVideo, openVideo, saveVideo, removeVideo, saveReview } = useFlow(props)
const expandedReview = ref(false)
let navigationSequence = 0
const navigation = inject(navigationKey, null)
watch(() => navigation?.flowTarget.value, async target => {
  if (!target) return
  const request = ++navigationSequence
  await selectDay(target.date)
  if (request !== navigationSequence || selectedDate.value !== target.date) return
  setActiveTab(target.videoId ? 'input' : 'review')
  await nextTick()
  if (target.videoId) document.getElementById(`video-${target.videoId}`)?.scrollIntoView({ block: 'center' })
}, { immediate: true })
const reviewDirty = computed(() => Object.entries(reviewDraft.value).some(([key, value]) => value !== day.value.review[key as keyof typeof reviewDraft.value]) || reviewInputChoice.value !== (day.value.review.inputType === 'video' ? `video:${day.value.review.inputVideoId}` : day.value.review.inputType))
</script>
<template>

  <div class="flow-view" :inert="loading || drafts.paused.value || drafts.saving.value">
    <div v-if="notice" class="flow-notice" role="status">{{ notice }}</div>
    <section class="flow-overview">
      <article :class="['flow-stat', { warning: overLimit }]">
        <span>{{ isToday ? '今日输入' : '当日输入' }}</span><strong>{{ day.videos.length }}/{{ day.review.videoLimit }}</strong><small>{{ pendingThoughts ? `${pendingThoughts} 条待补思考` : '每次输入都留下痕迹' }}</small>
      </article>
      <article class="flow-stat"><span>今日待办</span><strong>{{ props.todayCompletedCount }}</strong><small>已完成 · {{ props.todayPendingCount }} 项仍待处理</small></article>
      <article class="flow-stat"><span>近七日复盘</span><strong>{{ summary.reviewedDays }}/7</strong><small>不追连续，只看真实变化</small></article>
      <article class="flow-stat"><span>近七日视频</span><strong>{{ summary.videoCount }}</strong><small>{{ summary.overLimitDays }} 个超额日 · {{ summary.pendingThoughts }} 条待思考</small></article>
    </section>

    <div class="flow-layout">
      <div class="flow-primary">
        <div class="flow-tabs" role="tablist" aria-label="心流内容" @keydown="moveTab">
          <button id="flow-tab-input" role="tab" :aria-selected="activeTab === 'input'" aria-controls="flow-panel-input" :tabindex="activeTab === 'input' ? 0 : -1" :class="{ active: activeTab === 'input' }" @click="setActiveTab('input')"><span>输入记录</span><small>{{ day.videos.length }} 条</small></button>
          <button id="flow-tab-review" role="tab" :aria-selected="activeTab === 'review'" aria-controls="flow-panel-review" :tabindex="activeTab === 'review' ? 0 : -1" :class="{ active: activeTab === 'review' }" @click="setActiveTab('review')"><span>每日复盘</span><small>{{ day.review.savedAt ? '已保存' : '待完成' }}</small></button>
        </div>

        <Transition name="flow-tab" mode="out-in">
          <section v-if="activeTab === 'input'" id="flow-panel-input" key="input" class="flow-card" role="tabpanel" aria-labelledby="flow-tab-input">
            <header class="section-heading"><div><small>{{ isToday ? '观看之前' : '历史输入' }}</small><h2>{{ isToday ? '先看，再留下自己的判断' : selectedDateLabel }}</h2></div><span :class="['quota-pill', { warning: overLimit }]">{{ day.videos.length }}/{{ day.review.videoLimit }}</span></header>
            <FlowPreferences v-if="isToday" kind="quota" />
            <div v-if="isToday" class="video-composer">
              <label><span>粘贴准备观看的视频链接</span><input v-model="videoUrl" type="url" placeholder="https://…" @keydown.enter="addVideo" /></label>
              <button class="primary-button" @click="addVideo">暂存并打开</button>
              <p>链接会先保存在本地。看完回来，再补标题、作者和你的思考。</p>
            </div>
            <p v-else class="history-hint">历史日期可以补写和修改思考，但只能在今天暂存新视频。</p>
            <div v-if="loading" class="flow-empty">正在加载…</div>
            <div v-else-if="!day.videos.length" class="flow-empty">{{ isToday ? '今天还没有打开视频。没有刷，也是一种清醒的选择。' : '这一天没有视频记录。' }}</div>
            <div v-else class="video-list">
              <article v-for="video in day.videos" :key="video.id" :id="`video-${video.id}`" :class="['video-entry', { 'navigation-target': navigation?.flowTarget.value?.videoId === video.id }]"><DraftStatus kind="video" :draft-key="video.id" @discard="discardVideo(video)" />
                <div class="video-entry-heading"><div><span :class="['thought-state', { done: videoDrafts[video.id]?.thought.trim() }]">{{ videoDrafts[video.id]?.thought.trim() ? '已思考' : '待补思考' }}</span><strong :class="{ placeholder: !video.title }">{{ video.title || '待补充标题' }}</strong><small>{{ video.sourcePlatform }}<template v-if="video.author"> · {{ video.author }}</template></small></div><button class="text-button" @click="openVideo(video.sourceUrl)">再次打开 ↗</button></div>
                <div v-if="videoDrafts[video.id]" class="video-edit-grid">
                  <label><span>标题</span><input v-model="videoDrafts[video.id].title" placeholder="看完后，这条视频讲了什么？" /></label>
                  <label><span>来源</span><input v-model="videoDrafts[video.id].sourceUrl" type="url" /></label>
                  <label><span>作者</span><input v-model="videoDrafts[video.id].author" placeholder="账号或创作者（选填）" /></label>
                  <label class="thought-field"><span>我的思考</span><textarea v-model="videoDrafts[video.id].thought" rows="3" placeholder="我认同或不认同什么？它和我的经历有什么关系？"></textarea></label>
                </div>
                <footer><button class="danger-button" @click="removeVideo(video)">删除</button><button class="secondary-button" @click="saveVideo(video)">保存记录</button></footer>
                <FlowActions :source="{ kind: 'video', key: video.id }" :updated-at="video.updatedAt" :date="video.date" :saved="true" :dirty="Object.entries(videoDrafts[video.id] || {}).some(([key, value]) => value !== video[key as 'title' | 'sourceUrl' | 'author' | 'thought'])" :suggestion="videoDrafts[video.id]?.thought || video.title" />
              </article>
            </div>
          </section>

          <section v-else id="flow-panel-review" key="review" class="flow-card review-card" role="tabpanel" aria-labelledby="flow-tab-review">
            <header class="section-heading"><div><small>每日复盘</small><h2>{{ selectedDateLabel }}</h2></div><span :class="['saved-pill', { saved: day.review.savedAt }]">{{ day.review.savedAt ? '已保存' : '未保存' }}</span></header>
  <FlowPreferences kind="reminder" />
  <DraftStatus kind="review" :draft-key="selectedDate" @discard="discardReview" />
  <FlowFacts :date="selectedDate" />
            <button type="button" class="secondary-button review-toggle" :aria-expanded="expandedReview" aria-controls="flow-review-questions" @click="expandedReview = !expandedReview">
              <span>{{ expandedReview ? '收起为简版复盘（3 问）' : '展开完整复盘（6 问）' }}</span>
              <svg :class="{ expanded: expandedReview }" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <div id="flow-review-questions" :class="['review-grid', { 'light-review': !expandedReview }]">
              <label><span>1 · 今天做好了什么？</span><textarea v-model="reviewDraft.didWell" rows="3" placeholder="哪件事值得肯定？"></textarea></label>
              <label v-show="expandedReview"><span>2 · 今天什么没做好？</span><textarea v-model="reviewDraft.didNotWell" rows="3" placeholder="如实写下，不责备自己。"></textarea></label>
              <label class="wide"><span>{{ expandedReview ? 3 : 2 }} · 今天有什么可以改进？下次可以怎么做？</span><textarea v-model="reviewDraft.reflection" rows="3" placeholder="写下一件不够满意的事，以及下次可以尝试的做法。"></textarea></label>
              <label v-show="expandedReview" class="wide"><span>4 · 今天最有价值的一个输入是什么？</span><SelectField v-model="reviewInputChoice" aria-label="今日最有价值的输入" :options="inputOptions" /><textarea v-if="reviewInputChoice === 'other'" v-model="reviewDraft.inputText" rows="2" placeholder="来自哪本书、哪篇文章或哪次谈话？"></textarea></label>
              <label v-show="expandedReview"><span>5 · 今天完成的一个输出是什么？</span><textarea v-model="reviewDraft.outputText" rows="3" placeholder="文字、作品、表达或一次行动。"></textarea></label>
              <label><span>{{ expandedReview ? 6 : 3 }} · 明天有什么期待？准备从哪一步开始？</span><textarea v-model="reviewDraft.tomorrowExpectation" rows="3" placeholder="给明天留一个轻盈的起点。"></textarea></label>
            </div>
            <footer class="review-footer"><small>{{ day.review.savedAt ? `上次保存：${new Date(day.review.savedAt).toLocaleString('zh-CN')}` : '内容可留空，保存即表示今天已经复盘。' }}</small><button class="primary-button" @click="saveReview">保存今日复盘</button></footer>
            <FlowActions :source="{ kind: 'review', key: selectedDate }" :updated-at="day.review.updatedAt" :date="selectedDate" :saved="!!day.review.savedAt" :dirty="reviewDirty" :suggestion="reviewDraft.tomorrowExpectation || ''" />
          </section>
        </Transition>
      </div>

      <aside class="flow-history">
        <section class="flow-card calendar-card">
          <header class="calendar-header"><button aria-label="上个月" @click="changeMonth(-1)">‹</button><strong>{{ monthLabel }}</strong><button aria-label="下个月" @click="changeMonth(1)">›</button></header>
          <div class="weekdays"><span v-for="name in ['一','二','三','四','五','六','日']" :key="name">{{ name }}</span></div>
          <div class="calendar-grid">
            <button v-for="cell in calendarCells" :key="cell.key" :disabled="!cell.date || cell.date > todayIso" :class="['calendar-day', { selected: cell.date === selectedDate, today: cell.date === todayIso, saved: daySummary(cell.date)?.reviewSaved, over: daySummary(cell.date)?.overLimit }]" @click="selectDay(cell.date)">
              <span v-if="cell.day">{{ cell.day }}</span><small v-if="daySummary(cell.date)?.videoCount">{{ daySummary(cell.date)?.videoCount }}</small>
            </button>
          </div>
          <div class="calendar-legend"><span><i class="saved-dot"></i> 已复盘</span><span><i class="over-dot"></i> 超额</span></div>
        </section>
        <section class="flow-card history-summary"><small>所选日期</small><strong>{{ selectedDateLabel }}</strong><p>{{ selectedSummary?.reviewSaved ? '复盘已保存' : '尚未保存复盘' }} · {{ selectedSummary?.videoCount ?? day.videos.length }} 条视频</p><button v-if="!isToday" class="text-button" @click="selectDay(todayIso)">回到今天</button></section>
      </aside>
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

.flow-view{position:relative;color:var(--text,#333)}.flow-notice{position:fixed;z-index:35;right:28px;bottom:24px;padding:9px 14px;border-radius:7px;background:#333;color:#fff;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.18)}.flow-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.flow-stat,.flow-card{border:1px solid var(--border,#e9edf2);border-radius:10px;background:var(--surface,#fff);box-shadow:0 3px 12px rgba(45,42,57,.035)}.flow-stat{display:flex;min-height:102px;flex-direction:column;padding:15px 16px}.flow-stat span,.section-heading small,.history-summary>small{color:var(--muted,#999);font-size:10px}.flow-stat strong{margin-top:5px;color:var(--text,#444);font-size:24px;font-weight:600}.flow-stat small{margin-top:auto;color:var(--muted,#999);font-size:10px}.flow-stat.warning strong{color:#e56b3f}.flow-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;align-items:start;gap:16px}.flow-primary{min-width:0}.flow-tabs{display:inline-flex;gap:4px;margin:0 0 12px;padding:4px;border:1px solid var(--border,#e9edf2);border-radius:9px;background:var(--surface,#fff)}.flow-tabs button{display:flex;align-items:center;gap:9px;min-width:128px;height:36px;padding:0 13px;border-radius:6px;color:var(--muted,#8d8997);font-size:12px;transition:background-color .16s,color .16s,box-shadow .16s}.flow-tabs button:hover{color:var(--text,#555)}.flow-tabs button.active{background:#f1efff;color:#7659ee;box-shadow:0 2px 7px rgba(89,69,176,.1)}.flow-tabs button small{margin-left:auto;color:inherit;font-size:9px;opacity:.72}.flow-card{padding:18px}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}.section-heading h2{margin:2px 0 0;font-size:16px;font-weight:600}.quota-pill,.saved-pill{padding:4px 9px;border-radius:12px;background:#f1efff;color:#7659ee;font-size:11px}.quota-pill.warning{background:#fff0e9;color:#d45f35}.saved-pill{background:#f1f2f5;color:#999}.saved-pill.saved{background:#ecf8f0;color:#438b5d}.video-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:9px;padding:13px;border-radius:8px;background:var(--surface-soft,#fafafd)}.video-composer p{grid-column:1/-1;margin:0;color:var(--muted,#999);font-size:10px}label{display:flex;min-width:0;flex-direction:column;gap:5px}label>span{color:var(--muted,#8d8997);font-size:10px}input,textarea{width:100%;border:1px solid var(--border,#e5e6eb);border-radius:7px;outline:0;background:var(--surface,#fff);padding:8px 9px;color:var(--text,#555);font-size:12px}textarea{line-height:1.6;resize:vertical}.primary-button{height:34px;padding:0 14px;border-radius:6px;background:#856af9;color:#fff;white-space:nowrap;font-size:12px}.primary-button:hover{background:#7659ee}.secondary-button{min-width:auto}.history-hint,.flow-empty{margin:0;padding:16px;border-radius:7px;background:var(--surface-soft,#fafafd);color:var(--muted,#999);text-align:center;font-size:11px}.video-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}.video-entry{padding:14px;border:1px solid var(--border,#e9edf2);border-radius:8px}.video-entry-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.video-entry-heading>div{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:4px 8px;min-width:0}.video-entry-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.video-entry-heading strong.placeholder{color:var(--muted,#999);font-weight:500}.video-entry-heading small{grid-column:2;color:var(--muted,#999);font-size:10px}.thought-state{grid-row:1/3;padding:3px 6px;border-radius:9px;background:#fff3e8;color:#d46b38;font-size:9px}.thought-state.done{background:#ecf8f0;color:#438b5d}.text-button{color:#7659ee;font-size:11px;white-space:nowrap}.video-edit-grid{display:grid;grid-template-columns:1fr 1.4fr .7fr;gap:8px}.thought-field{grid-column:1/-1}.video-entry footer{display:flex;justify-content:space-between;margin-top:10px}.danger-button{color:#e45757;font-size:11px}.review-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.review-grid .wide{grid-column:1/-1}.review-grid :deep(.select-field){margin-bottom:7px}.review-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border,#edf0f3)}.review-footer small{color:var(--muted,#999);font-size:10px}.flow-history{position:sticky;top:18px;display:flex;flex-direction:column;gap:12px}.calendar-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.calendar-header button{width:28px;height:28px;border-radius:6px;color:#856af9;font-size:20px}.calendar-header button:hover{background:#f2f1ff}.calendar-header strong{font-size:13px;font-weight:600}.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.weekdays{margin-bottom:4px}.weekdays span{text-align:center;color:var(--muted,#aaa);font-size:9px}.calendar-day{position:relative;aspect-ratio:1;border-radius:6px;color:var(--text,#666);font-size:11px}.calendar-day:not(:disabled):hover{background:#f5f3ff}.calendar-day:disabled{cursor:default;color:#ccc}.calendar-day.selected{background:#856af9;color:#fff}.calendar-day.today{box-shadow:inset 0 0 0 1px #856af9}.calendar-day.saved:after{content:'';position:absolute;right:4px;bottom:4px;width:4px;height:4px;border-radius:50%;background:#55a46d}.calendar-day.over:after{background:#eb754b}.calendar-day small{position:absolute;right:3px;top:2px;color:inherit;font-size:7px}.calendar-legend{display:flex;gap:12px;margin-top:12px;color:var(--muted,#999);font-size:9px}.calendar-legend span{display:flex;align-items:center;gap:4px}.calendar-legend i{width:5px;height:5px;border-radius:50%}.saved-dot{background:#55a46d}.over-dot{background:#eb754b}.history-summary{display:flex;flex-direction:column;gap:5px}.history-summary strong{font-size:13px}.history-summary p{margin:0;color:var(--muted,#999);font-size:10px}.history-summary .text-button{align-self:flex-start;margin-top:5px;padding:0}.flow-stat,.flow-card,input,textarea{transition:border-color .15s,background-color .15s}.flow-tab-enter-active,.flow-tab-leave-active{transition:opacity .16s ease}.flow-tab-enter-from,.flow-tab-leave-to{opacity:0}
@media(max-width:1080px){.flow-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.flow-layout{grid-template-columns:minmax(0,1fr) 230px}.video-edit-grid{grid-template-columns:1fr 1fr}}
@media(prefers-reduced-motion:reduce){.flow-tab-enter-active,.flow-tab-leave-active{transition:none}}
:global(:root[data-theme="dark"]) .flow-stat,:global(:root[data-theme="dark"]) .flow-card,:global(:root[data-theme="dark"]) .flow-tabs,:global(:root[data-theme="dark"]) input,:global(:root[data-theme="dark"]) textarea{background:#211f28;border-color:#3b3745}:global(:root[data-theme="dark"]) .video-composer,:global(:root[data-theme="dark"]) .history-hint,:global(:root[data-theme="dark"]) .flow-empty{background:#1d1b22}:global(:root[data-theme="dark"]) .flow-tabs button.active{background:#302a45;color:#c7bcff}:global(:root[data-theme="dark"]) .calendar-day:not(:disabled):hover{background:#302a45}:global(:root[data-theme="dark"]) .saved-pill{background:#302e36}:global(:root[data-theme="dark"]) .quota-pill{background:#302a45;color:#c7bcff}
.flow-confirm-backdrop{z-index:60}.flow-confirm-dialog{width:min(380px,calc(100vw - 36px))}

</style>
