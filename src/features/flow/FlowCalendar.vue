<script setup lang="ts">
import { computed } from 'vue'
import type { FlowDaySummary } from '../../shared/contracts'
const props = defineProps<{ todayIso: string; selectedDate: string; monthLabel: string; selectedDateLabel: string; calendarCells: { key: string; date: string; day: number }[]; monthDays: FlowDaySummary[]; videoCount: number }>()
const emit = defineEmits<{ month: [offset: number]; select: [date: string] }>()
const isToday = computed(() => props.selectedDate === props.todayIso)
const selectedSummary = computed(() => daySummary(props.selectedDate))
function daySummary(date: string) { return props.monthDays.find(day => day.date === date) }
</script>
<template>
      <aside id="flow-calendar" class="flow-history">
        <section class="flow-card calendar-card">
          <header class="calendar-header"><button aria-label="上个月" @click="emit('month', -1)">‹</button><strong>{{ monthLabel }}</strong><button aria-label="下个月" @click="emit('month', 1)">›</button></header>
          <div class="weekdays"><span v-for="name in ['一','二','三','四','五','六','日']" :key="name">{{ name }}</span></div>
          <div class="calendar-grid">
            <button v-for="cell in calendarCells" :key="cell.key" :disabled="!cell.date || cell.date > todayIso" :class="['calendar-day', { selected: cell.date === selectedDate, today: cell.date === todayIso, saved: daySummary(cell.date)?.reviewSaved, over: daySummary(cell.date)?.overLimit }]" @click="emit('select', cell.date)">
              <span v-if="cell.day">{{ cell.day }}</span><small v-if="daySummary(cell.date)?.videoCount">{{ daySummary(cell.date)?.videoCount }}</small>
            </button>
          </div>
          <div class="calendar-legend"><span><i class="saved-dot"></i> 已复盘</span><span><i class="over-dot"></i> 超额</span></div>
        </section>
        <section class="flow-card history-summary"><small>所选日期</small><strong>{{ selectedDateLabel }}</strong><p>{{ selectedSummary?.reviewSaved ? '复盘已保存' : '尚未保存复盘' }} · {{ selectedSummary?.videoCount ?? videoCount }} 条视频</p><button v-if="!isToday" class="text-button" @click="emit('select', todayIso)">回到今天</button></section>
      </aside>
</template>
<style scoped>
.flow-history { position: sticky; top: 18px; display: grid; gap: 16px; }
.flow-card { padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.calendar-header button { width: 32px; height: 32px; color: var(--accent); font-size: 20px; border-radius: 7px; }
.calendar-header strong { font-size: 14px; }
.weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.weekdays { padding-bottom: 8px; color: var(--muted); font-size: 12px; text-align: center; }
.calendar-day { position: relative; aspect-ratio: 1; border-radius: 7px; color: var(--text); font-size: 13px; transition: background-color var(--motion-fast); }
.calendar-day:not(:disabled):hover, .calendar-header button:hover { background: var(--accent-soft); }
.calendar-day:disabled { color: var(--muted); opacity: .4; cursor: default; }
.calendar-day.today { box-shadow: inset 0 0 0 1px var(--accent); }
.calendar-day.selected { background: var(--accent); color: white; }
.calendar-day small { position: absolute; right: 3px; top: 2px; font-size: 8px; }
.calendar-day.saved:after, .calendar-day.over:after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 4px; height: 4px; border-radius: 50%; background: #55a46d; }
.calendar-day.over:after { background: #eb754b; }
.calendar-legend { display: flex; gap: 12px; margin-top: 14px; color: var(--muted); font-size: 11px; }
.calendar-legend span { display: flex; align-items: center; gap: 5px; }
.calendar-legend i { width: 5px; height: 5px; border-radius: 50%; }
.saved-dot { background: #55a46d; }.over-dot { background: #eb754b; }
.history-summary { display: grid; gap: 8px; }
.history-summary small, .history-summary p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.history-summary strong { font-size: 14px; }
.history-summary button { justify-self: start; color: var(--accent); }
@media (max-width: 1050px) { .flow-history { position: static; } }
@media (prefers-reduced-motion: reduce) { .calendar-day { transition: none; } }
</style>
