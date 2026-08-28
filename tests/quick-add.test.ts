import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from '../src/shared/quick-add'
import type { Tag, TaskList } from '../src/shared/contracts'

const time = '2026-08-28T00:00:00.000Z'
const lists: TaskList[] = [{ id: 'work', name: '工作', color: null, sortOrder: 0, isPinned: false, createdAt: time, updatedAt: time }]
const tags: Tag[] = [{ id: 'urgent', name: '紧急', color: null, createdAt: time, updatedAt: time }]

describe('Quick Add Magic', () => {
  it('parses recognized tokens and keeps unknown list tokens in the title', () => {
    const result = parseQuickAdd('完成报告 #紧急 !p1 @明天 ~工作 ~不存在', lists, tags, new Date('2026-08-28T08:00:00'))
    expect(result.input).toMatchObject({ title: '完成报告 ~不存在', listId: 'work', dueDate: '2026-08-29', priority: 'high', tagIds: ['urgent'] })
    expect(result.recognized).toEqual(['#紧急', '!p1', '@明天', '~工作'])
  })
})
