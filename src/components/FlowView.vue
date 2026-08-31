<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SelectField from './SelectField.vue'
import type { DailyReview, FlowDay, FlowDaySummary, FlowSummary, SaveDailyReviewInput, VideoReflection } from '../shared/contracts'

const props = defineProps<{ todayCompletedCount: number; todayPendingCount: number }>()

type FlowTab = 'input' | 'review'
type ReviewDraft = Omit<SaveDailyReviewInput, 'date' | 'inputType' | 'inputVideoId'>
type VideoDraft = Pick<VideoReflection, 'title' | 'sourceUrl' | 'author' | 'thought'>
type DayDraft = { review: ReviewDraft; inputChoice: string; videos: Record<string, VideoDraft> }

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const emptyReview = (date: string, videoLimit = 3): DailyReview => ({ date, videoLimit, didWell: '', didNotWell: '', reflection: '', inputType: 'none', inputVideoId: null, inputText: '', outputText: '', tomorrowExpectation: '', savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
const hasApi = () => typeof window !== 'undefined' && Boolean(window.todoApi?.flow)
const videoDraftFrom = (video: VideoReflection): VideoDraft => ({ title: video.title, sourceUrl: video.sourceUrl, author: video.author, thought: video.thought })

const todayIso = ref(isoDate(new Date()))
const selectedDate = ref(todayIso.value)
const monthCursor = ref(todayIso.value.slice(0, 7))
const activeTab = ref<FlowTab>('input')
const day = ref<FlowDay>({ review: emptyReview(todayIso.value), videos: [] })
const monthDays = ref<FlowDaySummary[]>([])
const summary = ref<FlowSummary>({ from: todayIso.value, to: todayIso.value, reviewedDays: 0, videoCount: 0, overLimitDays: 0, pendingThoughts: 0 })
const reviewDraft = ref<ReviewDraft>({ didWell: '', didNotWell: '', reflection: '', inputText: '', outputText: '', tomorrowExpectation: '' })
const reviewInputChoice = ref('none')
const videoUrl = ref('')
const videoDrafts = ref<Record<string, VideoDraft>>({})
const draftCache = ref<Record<string, DayDraft>>({})
const loading = ref(true)
const notice = ref('')
let midnightTimer: number | undefined

const selectedSummary = computed(() => monthDays.value.find((item) => item.date === selectedDate.value))
const isToday = computed(() => selectedDate.value === todayIso.value)
const pendingThoughts = computed(() => day.value.videos.filter((video) => !video.thought.trim()).length)
const overLimit = computed(() => day.value.videos.length > day.value.review.videoLimit)
const monthLabel = computed(() => { const [year, month] = monthCursor.value.split('-').map(Number); return new Date(year, month - 1, 1).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }) })
const selectedDateLabel = computed(() => new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
const inputOptions = computed(() => [{ value: 'none', label: '暂不记录输入' }, { value: 'other', label: '书、文章或谈话等其他输入' }, ...day.value.videos.map((video) => ({ value: `video:${video.id}`, label: `视频 · ${video.title || '待补充标题'}` }))])
const calendarCells = computed(() => {
  const [year, month] = monthCursor.value.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const leading = (first.getDay() + 6) % 7
  const count = new Date(year, month, 0).getDate()
  return [...Array.from({ length: leading }, (_, index) => ({ key: `blank-${index}`, date: '', day: 0 })), ...Array.from({ length: count }, (_, index) => ({ key: `${monthCursor.value}-${index + 1}`, date: `${monthCursor.value}-${String(index + 1).padStart(2, '0')}`, day: index + 1 }))]
})

function setNotice(message: string) { notice.value = message; window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 2800) }
function stashDrafts() {
  if (loading.value) return
  draftCache.value[selectedDate.value] = {
    review: { ...reviewDraft.value },
    inputChoice: reviewInputChoice.value,
    videos: Object.fromEntries(Object.entries(videoDrafts.value).map(([id, draft]) => [id, { ...draft }])),
  }
}
function hydrateDrafts() {
  const review = day.value.review
  const cached = draftCache.value[selectedDate.value]
  reviewDraft.value = cached?.review ?? { didWell: review.didWell, didNotWell: review.didNotWell, reflection: review.reflection, inputText: review.inputText, outputText: review.outputText, tomorrowExpectation: review.tomorrowExpectation }
  reviewInputChoice.value = cached?.inputChoice ?? (review.inputType === 'video' && review.inputVideoId ? `video:${review.inputVideoId}` : review.inputType)
  videoDrafts.value = Object.fromEntries(day.value.videos.map((video) => [video.id, cached?.videos[video.id] ?? videoDraftFrom(video)]))
}
async function loadDay() {
  loading.value = true
  try { day.value = hasApi() ? await window.todoApi.flow.getDay(selectedDate.value) : { review: emptyReview(selectedDate.value), videos: [] }; hydrateDrafts() }
  catch { setNotice('心流记录加载失败') }
  finally { loading.value = false }
}
async function loadOverview() {
  if (!hasApi()) return
  try { [monthDays.value, summary.value] = await Promise.all([window.todoApi.flow.month(monthCursor.value), window.todoApi.flow.summary(7)]) }
  catch { setNotice('历史统计加载失败') }
}
async function refresh() { await Promise.all([loadDay(), loadOverview()]) }
async function selectDay(date: string) { if (!date || date > todayIso.value || date === selectedDate.value) return; stashDrafts(); selectedDate.value = date; await loadDay() }
async function changeMonth(offset: number) { const [year, month] = monthCursor.value.split('-').map(Number); const next = new Date(year, month - 1 + offset, 1); monthCursor.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; await loadOverview() }
function daySummary(date: string) { return monthDays.value.find((item) => item.date === date) }
function setActiveTab(tab: FlowTab) { activeTab.value = tab }
function moveTab(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  activeTab.value = activeTab.value === 'input' ? 'review' : 'input'
  requestAnimationFrame(() => document.getElementById(`flow-tab-${activeTab.value}`)?.focus())
}

async function addVideo() {
  if (!isToday.value) return
  if (!videoUrl.value.trim()) { setNotice('请先粘贴视频链接'); return }
  const warnings: string[] = []
  if (pendingThoughts.value) warnings.push(`还有 ${pendingThoughts.value} 条视频待补思考`)
  if (day.value.videos.length >= day.value.review.videoLimit) warnings.push(`今天已达到 ${day.value.videos.length}/${day.value.review.videoLimit} 的额度`)
  if (warnings.length && !window.confirm(`${warnings.join('，')}。仍要打开下一条吗？`)) return
  try {
    stashDrafts()
    const created = hasApi() ? await window.todoApi.flow.createVideo({ date: selectedDate.value, sourceUrl: videoUrl.value }) : null
    videoUrl.value = ''
    await refresh()
    if (created) {
      try { await window.todoApi.desktop.openExternal(created.sourceUrl); setNotice('链接已暂存，观看后回来补充信息') }
      catch { setNotice('链接已暂存，但来源页面未能打开') }
    }
  } catch (error) { setNotice(error instanceof Error ? error.message : '视频链接暂存失败') }
}
async function openVideo(url: string) { try { if (hasApi()) await window.todoApi.desktop.openExternal(url) } catch { setNotice('无法打开来源链接') } }
async function saveVideo(video: VideoReflection) {
  const draft = videoDrafts.value[video.id]; if (!draft) return
  try {
    const saved = hasApi() ? await window.todoApi.flow.updateVideo(video.id, draft) : { ...video, ...draft }
    videoDrafts.value[video.id] = videoDraftFrom(saved)
    stashDrafts()
    await refresh()
    setNotice(draft.thought.trim() ? '视频信息和思考已保存' : '视频信息已保存，思考仍待补充')
  } catch (error) { setNotice(error instanceof Error ? error.message : '视频记录保存失败') }
}
async function removeVideo(video: VideoReflection) {
  if (!window.confirm(`删除“${video.title || '待补充标题'}”的记录吗？`)) return
  try {
    if (hasApi()) await window.todoApi.flow.removeVideo(video.id)
    delete videoDrafts.value[video.id]
    if (reviewInputChoice.value === `video:${video.id}`) reviewInputChoice.value = 'none'
    stashDrafts()
    await refresh()
    setNotice('视频记录已删除')
  } catch { setNotice('视频记录删除失败') }
}
async function saveReview() {
  const choice = reviewInputChoice.value
  const inputType = choice.startsWith('video:') ? 'video' : choice === 'other' ? 'other' : 'none'
  try {
    const saved = hasApi() ? await window.todoApi.flow.saveReview({ date: selectedDate.value, ...reviewDraft.value, inputType, inputVideoId: inputType === 'video' ? choice.slice(6) : null }) : { ...day.value.review, ...reviewDraft.value, savedAt: new Date().toISOString() }
    day.value.review = saved as DailyReview
    stashDrafts()
    await loadOverview(); setNotice('复盘已保存')
  } catch { setNotice('复盘保存失败') }
}
async function checkDateRollover() {
  const current = isoDate(new Date()); if (current === todayIso.value) return
  stashDrafts()
  const wasToday = selectedDate.value === todayIso.value; todayIso.value = current
  if (wasToday) selectedDate.value = current
  monthCursor.value = current.slice(0, 7)
  await refresh()
}

onMounted(() => { void refresh(); midnightTimer = window.setInterval(() => { void checkDateRollover() }, 60000); document.addEventListener('visibilitychange', checkDateRollover) })
onBeforeUnmount(() => { if (midnightTimer) window.clearInterval(midnightTimer); document.removeEventListener('visibilitychange', checkDateRollover) })
</script>

<template>
  <div class="flow-view">
    <div v-if="notice" class="flow-notice" role="status">{{ notice }}</div>
    <section class="flow-overview">
      <article :class="['flow-stat', { warning: overLimit }]">
        <span>今日输入</span><strong>{{ day.videos.length }}/{{ day.review.videoLimit }}</strong><small>{{ pendingThoughts ? `${pendingThoughts} 条待补思考` : '每次输入都留下痕迹' }}</small>
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
            <div v-if="isToday" class="video-composer">
              <label><span>粘贴准备观看的视频链接</span><input v-model="videoUrl" type="url" placeholder="https://…" @keydown.enter="addVideo" /></label>
              <button class="primary-button" @click="addVideo">暂存并打开</button>
              <p>链接会先保存在本地。看完回来，再补标题、作者和你的思考。</p>
            </div>
            <p v-else class="history-hint">历史日期可以补写和修改思考，但只能在今天暂存新视频。</p>
            <div v-if="loading" class="flow-empty">正在加载…</div>
            <div v-else-if="!day.videos.length" class="flow-empty">{{ isToday ? '今天还没有打开视频。没有刷，也是一种清醒的选择。' : '这一天没有视频记录。' }}</div>
            <div v-else class="video-list">
              <article v-for="video in day.videos" :key="video.id" class="video-entry">
                <div class="video-entry-heading"><div><span :class="['thought-state', { done: videoDrafts[video.id]?.thought.trim() }]">{{ videoDrafts[video.id]?.thought.trim() ? '已思考' : '待补思考' }}</span><strong :class="{ placeholder: !video.title }">{{ video.title || '待补充标题' }}</strong><small>{{ video.sourcePlatform }}<template v-if="video.author"> · {{ video.author }}</template></small></div><button class="text-button" @click="openVideo(video.sourceUrl)">再次打开 ↗</button></div>
                <div v-if="videoDrafts[video.id]" class="video-edit-grid">
                  <label><span>标题</span><input v-model="videoDrafts[video.id].title" placeholder="看完后，这条视频讲了什么？" /></label>
                  <label><span>来源</span><input v-model="videoDrafts[video.id].sourceUrl" type="url" /></label>
                  <label><span>作者</span><input v-model="videoDrafts[video.id].author" placeholder="账号或创作者（选填）" /></label>
                  <label class="thought-field"><span>我的思考</span><textarea v-model="videoDrafts[video.id].thought" rows="3" placeholder="我认同或不认同什么？它和我的经历有什么关系？"></textarea></label>
                </div>
                <footer><button class="danger-button" @click="removeVideo(video)">删除</button><button class="secondary-button" @click="saveVideo(video)">保存记录</button></footer>
              </article>
            </div>
          </section>

          <section v-else id="flow-panel-review" key="review" class="flow-card review-card" role="tabpanel" aria-labelledby="flow-tab-review">
            <header class="section-heading"><div><small>每日复盘</small><h2>{{ selectedDateLabel }}</h2></div><span :class="['saved-pill', { saved: day.review.savedAt }]">{{ day.review.savedAt ? '已保存' : '未保存' }}</span></header>
            <div class="review-grid">
              <label><span>1 · 今天做好了什么？</span><textarea v-model="reviewDraft.didWell" rows="3" placeholder="哪件事值得肯定？"></textarea></label>
              <label><span>2 · 今天什么没做好？</span><textarea v-model="reviewDraft.didNotWell" rows="3" placeholder="如实写下，不责备自己。"></textarea></label>
              <label class="wide"><span>3 · 为什么会这样？下次准备怎么调整？</span><textarea v-model="reviewDraft.reflection" rows="3" placeholder="找到原因，再留一个可执行的调整。"></textarea></label>
              <label class="wide"><span>4 · 今天最有价值的一个输入是什么？</span><SelectField v-model="reviewInputChoice" aria-label="今日最有价值的输入" :options="inputOptions" /><textarea v-if="reviewInputChoice === 'other'" v-model="reviewDraft.inputText" rows="2" placeholder="来自哪本书、哪篇文章或哪次谈话？"></textarea></label>
              <label><span>5 · 今天完成的一个输出是什么？</span><textarea v-model="reviewDraft.outputText" rows="3" placeholder="文字、作品、表达或一次行动。"></textarea></label>
              <label><span>6 · 明天有什么期待？准备从哪一步开始？</span><textarea v-model="reviewDraft.tomorrowExpectation" rows="3" placeholder="给明天留一个轻盈的起点。"></textarea></label>
            </div>
            <footer class="review-footer"><small>{{ day.review.savedAt ? `上次保存：${new Date(day.review.savedAt).toLocaleString('zh-CN')}` : '内容可留空，保存即表示今天已经复盘。' }}</small><button class="primary-button" @click="saveReview">保存今日复盘</button></footer>
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
  </div>
</template>

<style scoped>
.flow-view{position:relative;color:var(--text,#333)}.flow-notice{position:fixed;z-index:35;right:28px;bottom:24px;padding:9px 14px;border-radius:7px;background:#333;color:#fff;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.18)}.flow-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.flow-stat,.flow-card{border:1px solid var(--border,#e9edf2);border-radius:10px;background:var(--surface,#fff);box-shadow:0 3px 12px rgba(45,42,57,.035)}.flow-stat{display:flex;min-height:102px;flex-direction:column;padding:15px 16px}.flow-stat span,.section-heading small,.history-summary>small{color:var(--muted,#999);font-size:10px}.flow-stat strong{margin-top:5px;color:var(--text,#444);font-size:24px;font-weight:600}.flow-stat small{margin-top:auto;color:var(--muted,#999);font-size:10px}.flow-stat.warning strong{color:#e56b3f}.flow-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;align-items:start;gap:16px}.flow-primary{min-width:0}.flow-tabs{display:inline-flex;gap:4px;margin:0 0 12px;padding:4px;border:1px solid var(--border,#e9edf2);border-radius:9px;background:var(--surface,#fff)}.flow-tabs button{display:flex;align-items:center;gap:9px;min-width:128px;height:36px;padding:0 13px;border-radius:6px;color:var(--muted,#8d8997);font-size:12px;transition:background-color .16s,color .16s,box-shadow .16s}.flow-tabs button:hover{color:var(--text,#555)}.flow-tabs button.active{background:#f1efff;color:#7659ee;box-shadow:0 2px 7px rgba(89,69,176,.1)}.flow-tabs button small{margin-left:auto;color:inherit;font-size:9px;opacity:.72}.flow-card{padding:18px}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}.section-heading h2{margin:2px 0 0;font-size:16px;font-weight:600}.quota-pill,.saved-pill{padding:4px 9px;border-radius:12px;background:#f1efff;color:#7659ee;font-size:11px}.quota-pill.warning{background:#fff0e9;color:#d45f35}.saved-pill{background:#f1f2f5;color:#999}.saved-pill.saved{background:#ecf8f0;color:#438b5d}.video-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:9px;padding:13px;border-radius:8px;background:var(--surface-soft,#fafafd)}.video-composer p{grid-column:1/-1;margin:0;color:var(--muted,#999);font-size:10px}label{display:flex;min-width:0;flex-direction:column;gap:5px}label>span{color:var(--muted,#8d8997);font-size:10px}input,textarea{width:100%;border:1px solid var(--border,#e5e6eb);border-radius:7px;outline:0;background:var(--surface,#fff);padding:8px 9px;color:var(--text,#555);font-size:12px}textarea{line-height:1.6;resize:vertical}.primary-button{height:34px;padding:0 14px;border-radius:6px;background:#856af9;color:#fff;white-space:nowrap;font-size:12px}.primary-button:hover{background:#7659ee}.secondary-button{min-width:auto}.history-hint,.flow-empty{margin:0;padding:16px;border-radius:7px;background:var(--surface-soft,#fafafd);color:var(--muted,#999);text-align:center;font-size:11px}.video-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}.video-entry{padding:14px;border:1px solid var(--border,#e9edf2);border-radius:8px}.video-entry-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.video-entry-heading>div{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:4px 8px;min-width:0}.video-entry-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.video-entry-heading strong.placeholder{color:var(--muted,#999);font-weight:500}.video-entry-heading small{grid-column:2;color:var(--muted,#999);font-size:10px}.thought-state{grid-row:1/3;padding:3px 6px;border-radius:9px;background:#fff3e8;color:#d46b38;font-size:9px}.thought-state.done{background:#ecf8f0;color:#438b5d}.text-button{color:#7659ee;font-size:11px;white-space:nowrap}.video-edit-grid{display:grid;grid-template-columns:1fr 1.4fr .7fr;gap:8px}.thought-field{grid-column:1/-1}.video-entry footer{display:flex;justify-content:space-between;margin-top:10px}.danger-button{color:#e45757;font-size:11px}.review-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.review-grid .wide{grid-column:1/-1}.review-grid :deep(.select-field){margin-bottom:7px}.review-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border,#edf0f3)}.review-footer small{color:var(--muted,#999);font-size:10px}.flow-history{position:sticky;top:18px;display:flex;flex-direction:column;gap:12px}.calendar-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.calendar-header button{width:28px;height:28px;border-radius:6px;color:#856af9;font-size:20px}.calendar-header button:hover{background:#f2f1ff}.calendar-header strong{font-size:13px;font-weight:600}.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.weekdays{margin-bottom:4px}.weekdays span{text-align:center;color:var(--muted,#aaa);font-size:9px}.calendar-day{position:relative;aspect-ratio:1;border-radius:6px;color:var(--text,#666);font-size:11px}.calendar-day:not(:disabled):hover{background:#f5f3ff}.calendar-day:disabled{cursor:default;color:#ccc}.calendar-day.selected{background:#856af9;color:#fff}.calendar-day.today{box-shadow:inset 0 0 0 1px #856af9}.calendar-day.saved:after{content:'';position:absolute;right:4px;bottom:4px;width:4px;height:4px;border-radius:50%;background:#55a46d}.calendar-day.over:after{background:#eb754b}.calendar-day small{position:absolute;right:3px;top:2px;color:inherit;font-size:7px}.calendar-legend{display:flex;gap:12px;margin-top:12px;color:var(--muted,#999);font-size:9px}.calendar-legend span{display:flex;align-items:center;gap:4px}.calendar-legend i{width:5px;height:5px;border-radius:50%}.saved-dot{background:#55a46d}.over-dot{background:#eb754b}.history-summary{display:flex;flex-direction:column;gap:5px}.history-summary strong{font-size:13px}.history-summary p{margin:0;color:var(--muted,#999);font-size:10px}.history-summary .text-button{align-self:flex-start;margin-top:5px;padding:0}.flow-stat,.flow-card,input,textarea{transition:border-color .15s,background-color .15s}.flow-tab-enter-active,.flow-tab-leave-active{transition:opacity .16s ease,transform .16s ease}.flow-tab-enter-from{opacity:0;transform:translateY(4px)}.flow-tab-leave-to{opacity:0;transform:translateY(-2px)}
@media(max-width:1080px){.flow-overview{grid-template-columns:repeat(2,minmax(0,1fr))}.flow-layout{grid-template-columns:minmax(0,1fr) 230px}.video-edit-grid{grid-template-columns:1fr 1fr}}
@media(prefers-reduced-motion:reduce){.flow-tab-enter-active,.flow-tab-leave-active{transition:none}.flow-tab-enter-from,.flow-tab-leave-to{transform:none}}
:global(:root[data-theme="dark"]) .flow-stat,:global(:root[data-theme="dark"]) .flow-card,:global(:root[data-theme="dark"]) .flow-tabs,:global(:root[data-theme="dark"]) input,:global(:root[data-theme="dark"]) textarea{background:#211f28;border-color:#3b3745}:global(:root[data-theme="dark"]) .video-composer,:global(:root[data-theme="dark"]) .history-hint,:global(:root[data-theme="dark"]) .flow-empty{background:#1d1b22}:global(:root[data-theme="dark"]) .flow-tabs button.active{background:#302a45;color:#c7bcff}:global(:root[data-theme="dark"]) .calendar-day:not(:disabled):hover{background:#302a45}:global(:root[data-theme="dark"]) .saved-pill{background:#302e36}:global(:root[data-theme="dark"]) .quota-pill{background:#302a45;color:#c7bcff}
</style>
