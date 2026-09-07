import { describe, expect, it } from 'vitest'
import { matchesTaskFilter } from '../src/shared/task-filter'
import type { Task } from '../src/shared/contracts'

const task = (overrides: Partial<Task> = {}): Task => ({ id: 'task-1', title: '完成发布说明', listId: null, dueDate: '2026-09-07', dueTime: null, reminderMinutesBefore: null, priority: 'high', notes: '包含测试结果', status: 'completed', sortOrder: 0, isPinned: false, parentTaskId: null, recurrenceRuleId: null, deletedAt: null, tags: [{ id: 'tag-1', name: '发布', color: null, createdAt: '', updatedAt: '' }], createdAt: '', updatedAt: '', completedAt: '2026-09-07T10:00:00.000Z', ...overrides })

describe('matchesTaskFilter', () => {
  it('matches completed status independently from the current application view', () => {
    expect(matchesTaskFilter(task(), { status: 'completed' }, new Date('2026-09-07T12:00:00'))).toBe(true)
    expect(matchesTaskFilter(task({ status: 'active' }), { status: 'completed' }, new Date('2026-09-07T12:00:00'))).toBe(false)
  })

  it('applies date, tag and search criteria together', () => {
    expect(matchesTaskFilter(task(), { due: 'today', tagIds: ['tag-1'], search: '测试' }, new Date('2026-09-07T12:00:00'))).toBe(true)
    expect(matchesTaskFilter(task(), { due: 'overdue' }, new Date('2026-09-07T12:00:00'))).toBe(false)
  })
})
