import { expect, it } from 'vitest'
import { inPlan, isOverdue, localDay, planEnd, planFor, shiftDay, validPlan } from '../src/shared/planning'

it('normalizes local day, Monday week and calendar month across boundaries', () => {
  expect(planFor('week', '2026-01-01')).toEqual({ kind: 'week', start: '2025-12-29' })
  expect(planEnd(planFor('month', '2024-02-14'))).toBe('2024-02-29')
  expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  expect(localDay(new Date('2026-09-07T00:01:00'))).toBe('2026-09-07')
  expect(validPlan({ kind: 'day', start: '2026-02-30' })).toBe(false)
  expect(validPlan({ kind: 'week', start: '2026-09-08' })).toBe(false)
  expect(validPlan(null)).toBe(true)
})
it('includes intersecting weeks in both months but never expands coarse plans into days', () => {
  const task = { plan: planFor('week', '2026-09-01') }
  expect(inPlan(task, 'month', '2026-08-01')).toBe(true)
  expect(inPlan(task, 'month', '2026-09-01')).toBe(true)
  expect(inPlan(task, 'day', '2026-09-01')).toBe(false)
  expect(inPlan({ plan: planFor('day', '2026-09-01') }, 'month', '2026-08-01')).toBe(false)
  expect(inPlan({ plan: planFor('month', '2026-09-01') }, 'week', '2026-09-01')).toBe(false)
})
it('uses local deadline time and excludes completed tasks from overdue', () => {
  const task = { status: 'active' as const, dueDate: '2026-09-07', dueTime: '10:00' }
  expect(isOverdue(task, new Date('2026-09-07T10:01:00'))).toBe(true)
  expect(isOverdue({ ...task, dueTime: null }, new Date('2026-09-07T23:59:00'))).toBe(false)
  expect(isOverdue({ ...task, status: 'completed' }, new Date('2026-09-08T10:00:00'))).toBe(false)
})
