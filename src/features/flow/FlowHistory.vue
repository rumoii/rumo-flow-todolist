<script setup lang="ts">
import { nextTick, ref, toRef, watch } from 'vue'
import FlowHistoryDay from './FlowHistoryDay.vue'
import { useFlowHistory } from './useFlowHistory'
const props = defineProps<{ visible: boolean; today: string }>()
const emit = defineEmits<{ edit: [date: string]; backfill: []; ready: [] }>()
const filtersOpen = ref(false)
const { filters, entries, groups, nextCursor, loading, error, expanded, days, dayErrors, dayLoading, toggle, load, loadDay, selectMonth, recent } = useFlowHistory(toRef(props, 'visible'), toRef(props, 'today'))
const weekday = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('zh-CN', { weekday: 'short' })
watch(loading, async value => { if (!value && props.visible) { await nextTick(); emit('ready') } })
const monthLabel = (month: string) => month.slice(0, 4) + ' 年 ' + Number(month.slice(5)) + ' 月'
function collapse(date: string) {
  expanded.delete(date)
  document.getElementById('history-toggle-' + date)?.focus({ preventScroll: true })
  document.getElementById('history-day-' + date)?.scrollIntoView({ block: 'nearest' })
}
</script>
<template>
  <section class="flow-journal" aria-label="心流历史记录">
    <header class="journal-heading"><div><span class="journal-eyebrow">记录与回望</span><h2>留给未来的自己</h2><p>重新读一读，那些看过、想过和写下的事。</p></div><button class="secondary-button" @click="emit('backfill')">补记往日</button></header>
    <div class="journal-tools">
      <input v-model="filters.keyword" type="search" aria-label="搜索心流历史" placeholder="搜索输入、思考与复盘" maxlength="500" />
      <input type="month" aria-label="历史月份" :value="filters.from.slice(0,7) === filters.to.slice(0,7) ? filters.from.slice(0,7) : ''" :max="today.slice(0,7)" @change="selectMonth(($event.target as HTMLInputElement).value)" />
      <button class="journal-filter" :aria-expanded="filtersOpen" aria-controls="journal-filters" @click="filtersOpen = !filtersOpen">筛选{{ filters.pendingOnly || filters.reviewedOnly ? ' · 已启用' : '' }}</button>
      <button class="journal-filter" @click="recent">最近 30 天</button>
    </div>
    <div v-show="filtersOpen" id="journal-filters" class="journal-filters">
      <label>从<input v-model="filters.from" type="date" aria-label="历史开始日期" :max="today" /></label><label>至<input v-model="filters.to" type="date" aria-label="历史结束日期" :max="today" /></label>
      <label><input v-model="filters.pendingOnly" type="checkbox" />有待补思考</label><label><input v-model="filters.reviewedOnly" type="checkbox" />已复盘</label>
    </div>
    <p class="journal-range">{{ filters.from }} — {{ filters.to }}</p>
    <div v-if="error" class="journal-state" role="alert">{{ error }} <button @click="load()">重试</button></div>
    <p v-if="loading && !entries.length" class="journal-state" role="status">正在翻阅记录…</p>
    <p v-else-if="!error && !entries.length" class="journal-state">这段时间没有符合条件的记录。可以换个日期，或补记往日。</p>
    <section v-for="group in groups" :key="group.month" class="journal-month">
      <h3>{{ monthLabel(group.month) }}</h3>
      <article v-for="entry in group.entries" :id="'history-day-' + entry.date" :key="entry.date" class="journal-entry">
        <time :datetime="entry.date"><strong>{{ entry.date.slice(-2) }}</strong><span>{{ weekday(entry.date) }}</span></time>
        <div class="journal-story">
          <p v-if="entry.excerpt" class="journal-excerpt">{{ entry.excerpt }}</p>
          <p v-else class="journal-excerpt journal-untitled">{{ entry.videoTitles[0] || '这一天的复盘' }}</p>
          <p v-if="entry.videoTitles.length" class="journal-inputs">输入 · {{ entry.videoTitles.join(' / ') }}</p>
          <div class="journal-entry-meta"><span>{{ entry.videoCount }} 条输入</span><span>{{ entry.reviewSaved ? '复盘已保存' : '尚未保存复盘' }}</span><span v-if="entry.pendingThoughtCount">{{ entry.pendingThoughtCount }} 条待补思考</span></div>
          <button :id="'history-toggle-' + entry.date" class="journal-expand" :aria-expanded="expanded.has(entry.date)" :aria-controls="'history-body-' + entry.date" @click="toggle(entry.date)">{{ expanded.has(entry.date) ? '收起当天记录 ↑' : '展开当天记录 ↓' }}</button>
          <div v-if="expanded.has(entry.date)" :id="'history-body-' + entry.date">
            <p v-if="dayLoading.has(entry.date)" role="status">正在读取当天内容…</p>
            <p v-else-if="dayErrors[entry.date]" role="alert">{{ dayErrors[entry.date] }} <button @click="loadDay(entry.date)">重试</button></p>
            <FlowHistoryDay v-else-if="days[entry.date]" :day="days[entry.date]" />
            <footer class="journal-reading-actions"><button class="secondary-button" @click="emit('edit', entry.date)">编辑这一天</button><button class="journal-expand" @click="collapse(entry.date)">收起当天记录 ↑</button></footer>
          </div>
        </div>
      </article>
    </section>
    <footer v-if="entries.length" class="journal-end"><button v-if="nextCursor" class="secondary-button" :disabled="loading" @click="load(true)">{{ loading ? '正在加载…' : '加载更多' }}</button><span v-else>已读到这段记录的起点</span></footer>
  </section>
</template>
<style scoped>
:global(:root[data-theme="dark"] .flow-journal) { --journal-accent: #c7bcff; }
.flow-journal { --journal-accent: #7659ee; max-width: 920px; margin: 12px auto 48px; color: var(--text); }
.journal-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 8px 0 20px; }
.journal-eyebrow { font-size: 11px; letter-spacing: .16em; color: var(--muted); }
h2 { margin: 10px 0; font-size: 28px; font-weight: 550; letter-spacing: .03em; }
.journal-heading p { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.8; }
.journal-tools { display: flex; align-items: center; gap: 10px; border-block: 1px solid var(--border); padding: 14px 0; }
.journal-tools input[type=search] { flex: 1; min-width: 160px; }
input:not([type=checkbox]) { min-width: 0; padding: 9px 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
.journal-filter { padding: 8px; white-space: nowrap; color: var(--text-secondary); font-size: 12px; }
.journal-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 16px 0; }
.journal-filters label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); }
.journal-range { color: var(--muted); font-size: 11px; margin: 12px 0 24px; }
.journal-month h3 { position: sticky; top: 0; z-index: 1; background: var(--app-bg); padding: 14px 0; margin: 0 0 20px; border-bottom: 1px solid var(--border); font-size: 16px; font-weight: 500; }
.journal-entry { display: grid; grid-template-columns: 70px minmax(0,1fr); gap: 24px; scroll-margin-top: 64px; }
time { display: flex; flex-direction: column; align-items: center; padding-top: 2px; color: var(--muted); }
time strong { font-size: 32px; font-weight: 400; font-variant-numeric: tabular-nums; line-height: 1.2; color: var(--text); }
time span { margin-top: 6px; font-size: 11px; }
.journal-story { position: relative; min-width: 0; border-left: 1px solid var(--border); padding: 0 0 38px 28px; }
.journal-story::before { content: ''; position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--journal-accent); left: -3px; top: 12px; }
.journal-excerpt { margin: 0 0 16px; font-size: 18px; font-weight: 450; line-height: 1.9; overflow-wrap: anywhere; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.journal-untitled { color: var(--text-secondary); }
.journal-inputs { margin: 0 0 12px; color: var(--text-secondary); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.journal-entry-meta { display: flex; gap: 12px; flex-wrap: wrap; color: var(--muted); font-size: 11px; }
.journal-expand { display: block; padding: 8px 0; margin-top: 12px; color: var(--journal-accent); font-size: 12px; }
.journal-reading-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 20px 0 0; }
.journal-reading-actions .journal-expand { margin: 0; }
.journal-state, .journal-end { padding: 42px 8px; color: var(--muted); font-size: 13px; text-align: center; line-height: 1.8; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--journal-accent); outline-offset: 3px; }
@media(max-width:900px) { .journal-tools { flex-wrap: wrap; }.journal-heading { align-items: flex-start; } h2 { font-size: 24px; }.journal-entry { grid-template-columns: 1fr; gap: 12px; } time { flex-direction: row; gap: 10px; justify-content: flex-start; } time strong { font-size: 22px; } time span { margin: 0; }.journal-story { margin-left: 4px; padding-left: 20px; }.journal-excerpt { font-size: 16px; } }
</style>
