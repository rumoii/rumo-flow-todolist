import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createDraftCoordinator, draftCoordinatorKey } from '../../composables/draft-coordinator'
import type { DailyReview, FlowDay, FlowDaySummary, FlowSummary, SaveDailyReviewInput, VideoReflection } from '../../shared/contracts'
export function useFlow(props: {
  todayCompletedCount: number
  todayPendingCount: number
}) {
  const drafts = inject(draftCoordinatorKey, null) ?? createDraftCoordinator(window.todoApi)
  let hydration = false
  let removeDataListener: (() => void) | undefined
  let loadSequence = 0
  type FlowTab = 'input' | 'review'
  type ReviewDraft = Omit<SaveDailyReviewInput, 'date' | 'inputType' | 'inputVideoId'>
  type VideoDraft = Pick<VideoReflection, 'title' | 'sourceUrl' | 'author' | 'thought'>
  type DayDraft = {
    review: ReviewDraft
    inputChoice: string
    videos: Record<string, VideoDraft>
  }
  type Confirmation = {
    title: string
    message: string
    confirmLabel: string
    resolve: (confirmed: boolean) => void
  }
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
  const confirmation = ref<Confirmation | null>(null)
  let midnightTimer: number | undefined
  const selectedSummary = computed(() => monthDays.value.find((item) => item.date === selectedDate.value))
  const isToday = computed(() => selectedDate.value === todayIso.value)
  const pendingThoughts = computed(() => day.value.videos.filter((video) => !video.thought.trim()).length)
  const overLimit = computed(() => day.value.videos.length > day.value.review.videoLimit)
  const monthLabel = computed(() => { const [year, month] = monthCursor.value.split('-').map(Number); return new Date(year, month - 1, 1).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }); })
  const selectedDateLabel = computed(() => new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
  const inputOptions = computed(() => [{ value: 'none', label: '暂不记录输入' }, { value: 'other', label: '书、文章或谈话等其他输入' }, ...day.value.videos.map((video) => ({ value: `video:${video.id}`, label: `视频 · ${video.title || '待补充标题'}` }))])
  const calendarCells = computed(() => {
    const [year, month] = monthCursor.value.split('-').map(Number)
    const first = new Date(year, month - 1, 1)
    const leading = (first.getDay() + 6) % 7
    const count = new Date(year, month, 0).getDate()
    return [...Array.from({ length: leading }, (_, index) => ({ key: `blank-${index}`, date: '', day: 0 })), ...Array.from({ length: count }, (_, index) => ({ key: `${monthCursor.value}-${index + 1}`, date: `${monthCursor.value}-${String(index + 1).padStart(2, '0')}`, day: index + 1 }))]
  })
  function setNotice(message: string) { notice.value = message; window.setTimeout(() => { if (notice.value === message)
    notice.value = ''; }, 2800); }
  function askConfirmation(title: string, message: string, confirmLabel: string) {
    return new Promise<boolean>((resolve) => {
      confirmation.value = { title, message, confirmLabel, resolve }
      void nextTick(() => document.querySelector<HTMLElement>('.flow-confirm-dialog .cancel-button')?.focus())
    })
  }
  function resolveConfirmation(confirmed: boolean) { const request = confirmation.value; confirmation.value = null; request?.resolve(confirmed); }
  function trapConfirmationFocus(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      resolveConfirmation(false)
      return
    }
    if (event.key !== 'Tab')
      return
    const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
    if (!buttons.length)
      return
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault()
      buttons[buttons.length - 1].focus()
    }
    else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      event.preventDefault()
      buttons[0].focus()
    }
  }
  function stashDrafts() {
    if (loading.value)
      return
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
    const request = ++loadSequence
    const date = selectedDate.value
    loading.value = true
    try {
      const loaded = hasApi() ? await window.todoApi.flow.getDay(date) : { review: emptyReview(date), videos: [] }
      if (request !== loadSequence)
        return
      hydration = true
      day.value = loaded
      hydrateDrafts()
      const review = await drafts.open('review', date, { date, ...reviewDraft.value, inputType: loaded.review.inputType, inputVideoId: loaded.review.inputVideoId })
      const videos = await Promise.all(loaded.videos.map(async (video) => [video.id, await drafts.open('video', video.id, videoDraftFrom(video))] as const))
      if (request !== loadSequence)
        return
      reviewDraft.value = review
      reviewInputChoice.value = review.inputType === 'video' && review.inputVideoId ? `video:${review.inputVideoId}` : review.inputType ?? 'none'
      videoDrafts.value = Object.fromEntries(videos)
    }
    catch {
      setNotice('心流记录加载失败')
    }
    finally {
      if (request === loadSequence) {
        hydration = false
        loading.value = false
      }
    }
  }
  function captureDrafts() {
    if (hydration || loading.value)
      return
    const choice = reviewInputChoice.value
    drafts.update('review', selectedDate.value, { date: selectedDate.value, ...reviewDraft.value,
      inputType: choice.startsWith('video:') ? 'video' : choice === 'other' ? 'other' : 'none', inputVideoId: choice.startsWith('video:') ? choice.slice(6) : null })
    for (const [id, payload] of Object.entries(videoDrafts.value))
      drafts.update('video', id, payload)
  }
  watch([reviewDraft, reviewInputChoice, videoDrafts], captureDrafts, { deep: true, flush: 'sync' })
  watch(drafts.epoch, () => { draftCache.value = {}; void refresh(); })
  async function discardReview() {
    if (!window.confirm('放弃这一天未正式保存的复盘内容？'))
      return
    try {
      await drafts.discard('review', selectedDate.value)
      delete draftCache.value[selectedDate.value]
      await loadDay()
    }
    catch {
      setNotice('放弃草稿失败')
    }
  }
  async function discardVideo(video: VideoReflection) {
    if (!window.confirm('放弃这条视频未正式保存的修改？'))
      return
    try {
      await drafts.discard('video', video.id)
      delete draftCache.value[selectedDate.value]
      await loadDay()
    }
    catch {
      setNotice('放弃草稿失败')
    }
  }
  async function loadOverview() {
    if (!hasApi())
      return
    try {
      [monthDays.value, summary.value] = await Promise.all([window.todoApi.flow.month(monthCursor.value), window.todoApi.flow.summary(7)])
    }
    catch {
      setNotice('历史统计加载失败')
    }
  }
  async function refresh() { await Promise.all([loadDay(), loadOverview()]); }
  async function selectDay(date: string) { if (!date || date > todayIso.value || date === selectedDate.value)
    return; try {
    await drafts.flush()
  }
  catch {
    setNotice('草稿保留失败，请重试')
    return
  } ; stashDrafts(); selectedDate.value = date; monthCursor.value = date.slice(0, 7); await Promise.all([loadDay(), loadOverview()]); }
  async function changeMonth(offset: number) { const [year, month] = monthCursor.value.split('-').map(Number); const next = new Date(year, month - 1 + offset, 1); monthCursor.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; await loadOverview(); }
  function daySummary(date: string) { return monthDays.value.find((item) => item.date === date); }
  function setActiveTab(tab: FlowTab) { activeTab.value = tab; }
  function moveTab(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
      return
    event.preventDefault()
    activeTab.value = activeTab.value === 'input' ? 'review' : 'input'
    requestAnimationFrame(() => document.getElementById(`flow-tab-${activeTab.value}`)?.focus())
  }
  async function addVideo() {
    if (!isToday.value)
      return
    if (!videoUrl.value.trim()) {
      setNotice('请先粘贴视频链接')
      return
    }
    const warnings: string[] = []
    if (pendingThoughts.value)
      warnings.push(`还有 ${pendingThoughts.value} 条视频待补思考`)
    if (day.value.videos.length >= day.value.review.videoLimit)
      warnings.push(`今天已达到 ${day.value.videos.length}/${day.value.review.videoLimit} 的额度`)
    if (warnings.length && !await askConfirmation('继续打开下一条？', `${warnings.join('，')}。先确认是否仍要继续。`, '继续打开'))
      return
    try {
      stashDrafts()
      const created = hasApi() ? await window.todoApi.flow.createVideo({ date: selectedDate.value, sourceUrl: videoUrl.value }) : null
      videoUrl.value = ''
      await refresh()
      if (created) {
        try {
          await window.todoApi.desktop.openExternal(created.sourceUrl)
          setNotice('链接已暂存，观看后回来补充信息')
        }
        catch {
          setNotice('链接已暂存，但来源页面未能打开')
        }
      }
    }
    catch (error) {
      setNotice(error instanceof Error ? error.message : '视频链接暂存失败')
    }
  }
  async function openVideo(url: string) { try {
    if (hasApi())
      await window.todoApi.desktop.openExternal(url)
  }
  catch {
    setNotice('无法打开来源链接')
  } }
  async function saveVideo(video: VideoReflection) {
    const draft = videoDrafts.value[video.id]
    if (!draft)
      return
    try {
      const saved = drafts.supported ? await drafts.commit('video', video.id) as VideoReflection : hasApi() ? await window.todoApi.flow.updateVideo(video.id, draft) : { ...video, ...draft }
      videoDrafts.value[video.id] = videoDraftFrom(saved)
      stashDrafts()
      await refresh()
      setNotice(draft.thought.trim() ? '视频信息和思考已保存' : '视频信息已保存，思考仍待补充')
    }
    catch (error) {
      setNotice(error instanceof Error ? error.message : '视频记录保存失败')
    }
  }
  async function removeVideo(video: VideoReflection) {
    if (!await askConfirmation('删除这条视频记录？', `“${video.title || '待补充标题'}”及已填写的思考将被删除。`, '确认删除'))
      return
    try {
      if (hasApi())
        await window.todoApi.flow.removeVideo(video.id)
      drafts.forget('video', video.id)
      delete videoDrafts.value[video.id]
      if (reviewInputChoice.value === `video:${video.id}`)
        reviewInputChoice.value = 'none'
      stashDrafts()
      await refresh()
      setNotice('视频记录已删除')
    }
    catch {
      setNotice('视频记录删除失败')
    }
  }
  async function saveReview() {
    const choice = reviewInputChoice.value
    const inputType = choice.startsWith('video:') ? 'video' : choice === 'other' ? 'other' : 'none'
    try {
      const saved = drafts.supported ? await drafts.commit('review', selectedDate.value) as DailyReview : hasApi() ? await window.todoApi.flow.saveReview({ date: selectedDate.value, ...reviewDraft.value, inputType, inputVideoId: inputType === 'video' ? choice.slice(6) : null }) : { ...day.value.review, ...reviewDraft.value, savedAt: new Date().toISOString() }
      day.value.review = saved as DailyReview
      await drafts.open('review', selectedDate.value, saved as DailyReview)
      stashDrafts()
      await loadOverview()
      setNotice('复盘已保存')
    }
    catch {
      setNotice('复盘保存失败')
    }
  }
  async function checkDateRollover() {
    const current = isoDate(new Date())
    if (current === todayIso.value)
      return
    stashDrafts()
    const wasToday = selectedDate.value === todayIso.value
    todayIso.value = current
    if (wasToday)
      selectedDate.value = current
    monthCursor.value = current.slice(0, 7)
    await refresh()
  }
  onMounted(() => { removeDataListener = window.todoApi?.desktop?.onDataChanged?.(domains => { if (domains.some(domain => ['flow', 'settings', 'all'].includes(domain)))
    void refresh(); }); void refresh(); midnightTimer = window.setInterval(() => { void checkDateRollover(); }, 60000); document.addEventListener('visibilitychange', checkDateRollover); })
  onBeforeUnmount(() => { removeDataListener?.(); if (midnightTimer)
    window.clearInterval(midnightTimer); document.removeEventListener('visibilitychange', checkDateRollover); resolveConfirmation(false); })
  return { drafts, hydration, loadSequence, isoDate, emptyReview, hasApi, videoDraftFrom, todayIso, selectedDate, monthCursor, activeTab, day, monthDays, summary, reviewDraft, reviewInputChoice, videoUrl, videoDrafts, draftCache, loading, notice, confirmation, midnightTimer, selectedSummary, isToday, pendingThoughts, overLimit, monthLabel, selectedDateLabel, inputOptions, calendarCells, setNotice, askConfirmation, resolveConfirmation, trapConfirmationFocus, stashDrafts, hydrateDrafts, loadDay, captureDrafts, discardReview, discardVideo, loadOverview, refresh, selectDay, changeMonth, daySummary, setActiveTab, moveTab, addVideo, openVideo, saveVideo, removeVideo, saveReview, checkDateRollover }
}
