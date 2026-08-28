import type { CreateTaskInput, Tag, TaskList } from './contracts'

export interface QuickAddResult { input: CreateTaskInput; tagNames: string[]; recognized: string[] }

export function parseQuickAdd(source: string, lists: TaskList[] = [], tags: Tag[] = [], today = new Date()): QuickAddResult {
  const tagNames: string[] = []; const recognized: string[] = []; let listId: string | null = null; let dueDate: string | null = null; let priority: CreateTaskInput['priority'] = 'none'
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const title = source.split(/\s+/).filter(Boolean).filter((token) => {
    if (/^#\S+$/.test(token)) { tagNames.push(token.slice(1)); recognized.push(token); return false }
    const p = token.match(/^!p([123])$/i); if (p) { priority = ({ '1': 'high', '2': 'medium', '3': 'low' } as const)[p[1] as '1' | '2' | '3']; recognized.push(token); return false }
    if (token === '@今天') { dueDate = iso(today); recognized.push(token); return false }
    if (token === '@明天') { const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1); dueDate = iso(tomorrow); recognized.push(token); return false }
    const date = token.match(/^@(\d{4}-\d{2}-\d{2})$/); if (date) { dueDate = date[1]; recognized.push(token); return false }
    if (token.startsWith('~')) { const list = lists.find((item) => item.name === token.slice(1)); if (list) { listId = list.id; recognized.push(token); return false } }
    return true
  }).join(' ')
  return { input: { title, listId, dueDate, priority, tagIds: tags.filter((tag) => tagNames.includes(tag.name)).map((tag) => tag.id) }, tagNames, recognized }
}
