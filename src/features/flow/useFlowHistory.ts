import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'
import type { FlowDay, FlowHistoryEntry, FlowHistoryQuery } from '../../shared/contracts'
import { localDay, shiftDay } from '../../shared/planning'

export function useFlowHistory(visible: Ref<boolean>, today: Ref<string>, keyword: Ref<string>) {
  const filters = reactive({ from: shiftDay(today.value, -29), to: today.value, get keyword() { return keyword.value }, set keyword(value: string) { keyword.value = value }, pendingOnly: false, reviewedOnly: false })
  const entries = ref<FlowHistoryEntry[]>([])
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const error = ref('')
  const expanded = reactive(new Set<string>())
  const days = reactive<Record<string, FlowDay>>({})
  const dayErrors = reactive<Record<string, string>>({})
  const dayLoading = reactive(new Set<string>())
  let sequence = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let revision = 0
  const groups = computed(() => {
    const result: Array<{ month: string; entries: FlowHistoryEntry[] }> = []
    for (const entry of entries.value) {
      const month = entry.date.slice(0, 7)
      if (result[result.length - 1]?.month !== month) result.push({ month, entries: [] })
      result[result.length - 1].entries.push(entry)
    }
    return result
  })
  async function loadDay(date: string) {
    if (dayLoading.has(date)) return
    const currentRevision = revision
    dayLoading.add(date)
    delete dayErrors[date]
    try {
      const value = await window.todoApi.flow.getDay(date)
      if (!disposed && currentRevision === revision) days[date] = value
    } catch { if (!disposed && currentRevision === revision) dayErrors[date] = '当天记录加载失败，请重试' }
    finally { if (currentRevision === revision) dayLoading.delete(date) }
  }
  async function toggle(date: string) {
    if (expanded.has(date)) expanded.delete(date)
    else { expanded.add(date); if (!days[date]) await loadDay(date) }
  }
  async function load(more = false, preserve = false) {
    const request = ++sequence
    const query: FlowHistoryQuery = { ...filters }
    if (query.from > query.to || !query.from || !query.to || query.to > today.value) { error.value = '请选择有效的历史日期范围'; loading.value = false; return }
    loading.value = true
    error.value = ''
    try {
      let cursor = more ? nextCursor.value : null
      const targetCount = preserve ? Math.max(entries.value.length, 30) : 30
      const loaded: FlowHistoryEntry[] = []
      do {
        const page = await window.todoApi.flow.history({ ...query, ...(cursor ? { before: cursor } : {}) })
        if (disposed || request !== sequence) return
        loaded.push(...page.entries)
        cursor = page.nextCursor
      } while (preserve && cursor && loaded.length < targetCount)
      entries.value = more ? [...entries.value, ...loaded] : loaded
      nextCursor.value = cursor
      if (preserve) {
        revision++
        dayLoading.clear()
        for (const date of Object.keys(days)) if (!expanded.has(date)) delete days[date]
        const requests: Promise<void>[] = []
        for (const date of expanded) {
          if (entries.value.some(entry => entry.date === date)) requests.push(loadDay(date))
          else expanded.delete(date)
        }
        await Promise.all(requests)
      }
    } catch { if (!disposed && request === sequence) error.value = '历史记录加载失败，请重试' }
    finally { if (request === sequence) loading.value = false }
  }
  function selectMonth(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return
    filters.from = month + '-01'
    const end = new Date(month + '-01T12:00:00')
    end.setMonth(end.getMonth() + 1, 0)
    filters.to = localDay(end) > today.value ? today.value : localDay(end)
  }
  function recent() { Object.assign(filters, { from: shiftDay(today.value, -29), to: today.value, keyword: '', pendingOnly: false, reviewedOnly: false }) }
  watch(filters, () => {
    sequence++
    clearTimeout(timer)
    entries.value = []
    loading.value = visible.value
    nextCursor.value = null
    expanded.clear()
    revision++
    dayLoading.clear()
    for (const date of Object.keys(days)) delete days[date]
    for (const date of Object.keys(dayErrors)) delete dayErrors[date]
    error.value = ''
    timer = setTimeout(() => { if (visible.value) void load() }, 250)
  })
  watch(visible, value => {
    clearTimeout(timer)
    if (value) void load(false, true)
    else { sequence++; loading.value = false }
  }, { immediate: true })
  const unsubscribe = window.todoApi?.desktop?.onDataChanged?.(domains => {
    if (domains.some(domain => ['flow', 'all', 'settings'].includes(domain)) && visible.value) void load(false, true)
  })
  onBeforeUnmount(() => { disposed = true; sequence++; revision++; clearTimeout(timer); unsubscribe?.() })
  return { filters, entries, groups, nextCursor, loading, error, expanded, days, dayErrors, dayLoading, toggle, load, loadDay, selectMonth, recent }
}
