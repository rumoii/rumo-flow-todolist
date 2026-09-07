import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isoDate } from '../shared/date'

export function useCurrentDate() {
  const currentDate = ref(new Date())
  const todayIso = computed(() => isoDate(currentDate.value))
  const weekStart = computed(() => { const date = new Date(currentDate.value); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date })
  const weekEnd = computed(() => { const date = new Date(weekStart.value); date.setDate(date.getDate() + 6); return date })
  let timer: number | undefined

  function refresh() { const now = new Date(); if (isoDate(now) !== todayIso.value) currentDate.value = now }
  function handleVisibilityChange() { if (document.visibilityState === 'visible') refresh() }

  onMounted(() => { timer = window.setInterval(refresh, 60000); document.addEventListener('visibilitychange', handleVisibilityChange) })
  onBeforeUnmount(() => { if (timer) window.clearInterval(timer); document.removeEventListener('visibilitychange', handleVisibilityChange) })

  return { currentDate, todayIso, weekStart, weekEnd }
}
