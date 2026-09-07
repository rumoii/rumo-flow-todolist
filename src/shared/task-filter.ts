import type { Task, TaskFilterCriteria } from './contracts'
import { isoDate } from './date'

export function matchesTaskFilter(task: Task, criteria: TaskFilterCriteria, today: Date): boolean {
  const todayIso = isoDate(today)
  if (criteria.status && criteria.status !== 'all' && task.status !== criteria.status) return false
  if (criteria.listId !== undefined && task.listId !== criteria.listId) return false
  if (criteria.priorities?.length && !criteria.priorities.includes(task.priority)) return false
  if (criteria.tagIds?.length && !task.tags.some(tag => criteria.tagIds!.includes(tag.id))) return false
  if (criteria.due === 'today' && task.dueDate !== todayIso) return false
  if (criteria.due === 'overdue' && (!task.dueDate || task.dueDate >= todayIso)) return false
  if (criteria.due === 'next7' && (!task.dueDate || task.dueDate <= todayIso || task.dueDate > isoDate(new Date(today.getTime() + 7 * 86400000)))) return false
  if (criteria.due === 'none' && task.dueDate) return false
  if (criteria.search && !`${task.title} ${task.notes} ${task.tags.map(tag => tag.name).join(' ')}`.toLocaleLowerCase().includes(criteria.search.toLocaleLowerCase())) return false
  return true
}
