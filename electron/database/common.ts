import crypto from 'node:crypto'
import type { AppSettings, TaskList, Tag, RecurrenceRule } from '../../src/shared/contracts'
export const timestamp = () => new Date().toISOString()
export const newId = () => crypto.randomUUID()
export const reminders = [5, 15, 60, 1440]
export const defaults: AppSettings = { automaticUpdateChecks: true, theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }
export const mapList = (row: any): TaskList => ({ id: row.id, name: row.name, color: row.color ?? null, sortOrder: row.sort_order, isPinned: Boolean(row.is_pinned), createdAt: row.created_at, updatedAt: row.updated_at })
export const mapTag = (row: any): Tag => ({ id: row.id, name: row.name, color: row.color ?? null, createdAt: row.created_at, updatedAt: row.updated_at })
export const mapRule = (row: any): RecurrenceRule => ({ id: row.id, taskId: row.task_id, frequency: row.frequency, interval: row.interval, weekdays: JSON.parse(row.weekdays), monthDay: row.month_day ?? null, endDate: row.end_date, nextDueDate: row.next_due_date })
export const validTime = (value?: string | null) => value == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
export const parseLocalDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }
export const shiftDate = (value: string, days: number) => { const date = parseLocalDate(value); date.setDate(date.getDate() + days); return localDate(date); }
export const validCalendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(parseLocalDate(value)) === value
export const validDate = (value?: string | null) => value == null || validCalendarDate(value)
export function normalizeHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error()
    return url.toString()
  }
  catch {
    throw new Error('视频来源必须是有效的 HTTP 或 HTTPS 链接')
  }
}
export function platformForUrl(value: string): string {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  if (hostname === 'douyin.com' || hostname.endsWith('.douyin.com'))
    return '抖音'
  if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com') || hostname === 'b23.tv')
    return '哔哩哔哩'
  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be')
    return 'YouTube'
  if (hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com') || hostname === 'xhslink.com')
    return '小红书'
  if (hostname === 'kuaishou.com' || hostname.endsWith('.kuaishou.com'))
    return '快手'
  return hostname
}
export function nextDate(value: string, rule: RecurrenceRule): string {
  const [year, month, day] = value.split('-').map(Number)
  if (rule.frequency === 'daily') {
    const date = new Date(Date.UTC(year, month - 1, day))
    date.setUTCDate(date.getUTCDate() + rule.interval)
    return date.toISOString().slice(0, 10)
  }
  if (rule.frequency === 'weekly') {
    const date = new Date(Date.UTC(year, month - 1, day))
    const days = [...new Set(rule.weekdays)].sort()
    if (!days.length)
      date.setUTCDate(date.getUTCDate() + rule.interval * 7)
    else {
      const later = days.find((item) => item > date.getUTCDay())
      date.setUTCDate(date.getUTCDate() + (later === undefined ? rule.interval * 7 - date.getUTCDay() + days[0] : later - date.getUTCDay()))
    }
    return date.toISOString().slice(0, 10)
  }
  const date = new Date(Date.UTC(year, month - 1 + rule.interval, 1))
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(rule.monthDay ?? day, last)).padStart(2, '0')}`
}
