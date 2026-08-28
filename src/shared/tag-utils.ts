import type { Tag, TodoApi } from './contracts'

export const tagColors = ['#856AF9', '#4F8EF7', '#31A87C', '#E79032', '#E05E75', '#8A6F5A']

export function nextTagColor(tags: Tag[]): string {
  return tagColors[tags.length % tagColors.length]
}

export async function ensureTags(api: TodoApi, current: Tag[], names: string[]): Promise<{ tags: Tag[]; failed: string[] }> {
  const resolved: Tag[] = []
  const failed: string[] = []
  for (const rawName of [...new Set(names.map(name => name.trim()).filter(Boolean))]) {
    let tag = current.find(item => item.name.toLocaleLowerCase() === rawName.toLocaleLowerCase())
    if (!tag) {
      try {
        tag = await api.tags.create({ name: rawName, color: nextTagColor(current) })
        current.push(tag)
      } catch {
        failed.push(rawName)
        continue
      }
    }
    resolved.push(tag)
  }
  return { tags: resolved, failed }
}
