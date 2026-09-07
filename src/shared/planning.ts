import type { Task } from './contracts'
export type PlanKind = 'day' | 'week' | 'month'
export interface TaskPlan { kind: PlanKind; start: string }
export const localDay = (date = new Date()): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return localDay(date)
}
export function planFor(kind: PlanKind, day = localDay()): TaskPlan {
  const date = new Date(`${day}T12:00:00`)
  return { kind, start: kind === 'month' ? `${day.slice(0, 7)}-01` : kind === 'week' ? shiftDay(day, -((date.getDay() + 6) % 7)) : day }
}
export function planEnd(plan: TaskPlan): string {
  if (plan.kind === 'day') return plan.start
  if (plan.kind === 'week') return shiftDay(plan.start, 6)
  const date = new Date(`${plan.start}T12:00:00`)
  date.setMonth(date.getMonth() + 1, 0)
  return localDay(date)
}
export function validPlan(value: unknown): value is TaskPlan | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const plan = value as TaskPlan
  if (!['day', 'week', 'month'].includes(plan.kind) || typeof plan.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.start)) return false
  const date = new Date(`${plan.start}T12:00:00`)
  return !Number.isNaN(date.getTime()) && localDay(date) === plan.start && planFor(plan.kind, plan.start).start === plan.start
}
export function inPlan(task: Pick<Task, 'plan'>, kind: PlanKind, day = localDay()): boolean {
  const plan = task.plan
  if (!plan || (kind === 'day' && plan.kind !== 'day') || (kind === 'week' && plan.kind === 'month')) return false
  const period = planFor(kind, day)
  return plan.start <= planEnd(period) && planEnd(plan) >= period.start
}
export function isOverdue(task: Pick<Task, 'status' | 'dueDate' | 'dueTime'>, now = new Date()): boolean {
  if (task.status !== 'active' || !task.dueDate) return false
  return task.dueDate < localDay(now) || (task.dueDate === localDay(now) && !!task.dueTime && new Date(`${task.dueDate}T${task.dueTime}:00`) < now)
}
export function planLabel(plan: TaskPlan | null): string {
  if (!plan) return '未安排'
  return plan.kind === 'day' ? plan.start : plan.kind === 'week' ? `${plan.start}～${planEnd(plan)}` : `${plan.start.slice(0, 7)} 月计划`
}
