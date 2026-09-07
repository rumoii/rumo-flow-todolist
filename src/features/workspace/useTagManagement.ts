import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Tag, Task } from '../../shared/contracts'
import { ensureTags } from '../../shared/tag-utils'

export function useTagManagement(tags: Ref<Tag[]>, tasks: Ref<Task[]>, notify: (message: string) => void) {
  const newTagName = ref('')
  const managedTagDrafts = ref<Record<string, { name: string; color: string }>>({})
  const pendingTagDelete = ref<Tag | null>(null)
  const tagsSaving = ref(false)

  function adoptTags(next: Tag[]) {
    const previous = new Map(tags.value.map(tag => [tag.id, tag]))
    managedTagDrafts.value = Object.fromEntries(next.map(tag => {
      const draft = managedTagDrafts.value[tag.id]
      const old = previous.get(tag.id)
      const dirty = draft && old && (draft.name !== old.name || draft.color !== (old.color || '#856AF9'))
      return [tag.id, dirty ? draft : { name: tag.name, color: tag.color || '#856AF9' }]
    }))
    tags.value = next
  }

  async function createManagedTag() {
    const name = newTagName.value.trim()
    if (!name || tagsSaving.value || !window.todoApi) return
    tagsSaving.value = true
    try {
      const result = await ensureTags(window.todoApi, tags.value, [name])
      const tag = result.tags[0]
      if (tag) {
        if (!tags.value.some(item => item.id === tag.id)) tags.value.push(tag)
        managedTagDrafts.value[tag.id] = { name: tag.name, color: tag.color || '#856AF9' }
        newTagName.value = ''
      }
      notify(result.failed.length ? '标签创建失败，请重试' : '标签已创建')
    }
    finally { tagsSaving.value = false }
  }

  async function updateManagedTag(tag: Tag) {
    const draft = managedTagDrafts.value[tag.id]
    if (!draft?.name.trim()) { notify('标签名称不能为空'); return }
    if (tagsSaving.value || !window.todoApi) return
    tagsSaving.value = true
    try {
      const updated = await window.todoApi.tags.update(tag.id, { name: draft.name.trim(), color: draft.color })
      tags.value = tags.value.map(item => item.id === tag.id ? updated : item)
      managedTagDrafts.value[tag.id] = { name: updated.name, color: updated.color || '#856AF9' }
      tasks.value.forEach(task => task.tags.filter(item => item.id === tag.id).forEach(item => Object.assign(item, updated)))
      notify('标签已更新')
    }
    catch { notify('标签更新失败，请检查名称是否重复') }
    finally { tagsSaving.value = false }
  }

  async function deleteManagedTag() {
    const tag = pendingTagDelete.value
    if (!tag || tagsSaving.value || !window.todoApi) return
    tagsSaving.value = true
    try {
      await window.todoApi.tags.remove(tag.id)
      tags.value = tags.value.filter(item => item.id !== tag.id)
      delete managedTagDrafts.value[tag.id]
      tasks.value.forEach(task => { task.tags = task.tags.filter(item => item.id !== tag.id) })
      pendingTagDelete.value = null
      notify('标签已删除，任务仍然保留')
    }
    catch { notify('标签删除失败，请重试') }
    finally { tagsSaving.value = false }
  }
  return { newTagName, managedTagDrafts, pendingTagDelete, tagsSaving, adoptTags, createManagedTag, updateManagedTag, deleteManagedTag }
}
