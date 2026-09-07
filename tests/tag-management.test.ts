// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTagManagement } from '../src/features/workspace/useTagManagement'
import type { Tag, Task, TodoApi } from '../src/shared/contracts'

const tag: Tag = { id: 'tag-1', name: '工作', color: '#856AF9', createdAt: '', updatedAt: '' }

describe('tag management', () => {
  afterEach(() => { delete window.todoApi })

  it('preserves edited names during refresh and removes drafts for deleted tags', () => {
    const tags = ref<Tag[]>([])
    const manager = useTagManagement(tags, ref<Task[]>([]), vi.fn())
    manager.adoptTags([tag])
    manager.managedTagDrafts.value[tag.id].name = '尚未保存'
    manager.adoptTags([{ ...tag, color: '#31A87C' }])
    expect(manager.managedTagDrafts.value[tag.id]).toEqual({ name: '尚未保存', color: '#856AF9' })
    manager.adoptTags([])
    expect(manager.managedTagDrafts.value).toEqual({})
  })

  it('preserves failed edits and updates all references after a successful save', async () => {
    const tags = ref<Tag[]>([])
    const tasks = ref<Task[]>([{ id: 'task-1', tags: [{ ...tag }] } as Task])
    const update = vi.fn().mockRejectedValueOnce(new Error('duplicate')).mockResolvedValueOnce({ ...tag, name: '重要' })
    window.todoApi = { tags: { update } } as unknown as TodoApi
    const manager = useTagManagement(tags, tasks, vi.fn())
    manager.adoptTags([tag])
    manager.managedTagDrafts.value[tag.id].name = '重要'
    await manager.updateManagedTag(tag)
    expect(manager.managedTagDrafts.value[tag.id].name).toBe('重要')
    expect(tasks.value[0].tags[0].name).toBe('工作')
    await manager.updateManagedTag(tag)
    expect(tags.value[0].name).toBe('重要')
    expect(tasks.value[0].tags[0].name).toBe('重要')
    expect(manager.tagsSaving.value).toBe(false)
  })

  it('only removes references after confirmed deletion succeeds', async () => {
    const tags = ref<Tag[]>([])
    const tasks = ref<Task[]>([{ id: 'task-1', tags: [{ ...tag }] } as Task])
    const remove = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValueOnce(undefined)
    window.todoApi = { tags: { remove } } as unknown as TodoApi
    const manager = useTagManagement(tags, tasks, vi.fn())
    manager.adoptTags([tag])
    await manager.deleteManagedTag()
    expect(remove).not.toHaveBeenCalled()
    manager.pendingTagDelete.value = tag
    await manager.deleteManagedTag()
    expect(tags.value).toHaveLength(1)
    expect(tasks.value[0].tags).toHaveLength(1)
    await manager.deleteManagedTag()
    expect(manager.pendingTagDelete.value).toBeNull()
    expect(tags.value).toHaveLength(0)
    expect(tasks.value).toHaveLength(1)
    expect(tasks.value[0].tags).toHaveLength(0)
  })
})
