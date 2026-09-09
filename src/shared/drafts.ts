import type { RecurrenceFrequency, Task, TaskPriority, UpdateTaskInput, SaveDailyReviewInput, UpdateVideoReflectionInput } from './contracts'
export interface TaskEditorDraft {
  plan: import('./planning').TaskPlan | null
  focusDate: string | null
  title: string
  listId: string | null
  dueDate: string
  dueTime: string
  reminderMinutesBefore: number | null
  tagIds: string[]
  priority: TaskPriority
  notes: string
  recurrence: RecurrenceFrequency | 'none'
  recurrenceEnd: string
  recurrenceInterval?: number
  recurrenceWeekdays?: number[]
}
export interface DraftPayloads {
  quickTask: { title: string; contextDate: string; listId: string | null; plan: import('./planning').TaskPlan | null }
  subtask: { title: string }
  videoLink: { sourceUrl: string }
  task: TaskEditorDraft
  review: SaveDailyReviewInput
  video: Required<UpdateVideoReflectionInput>
  capture: {
    title: string
  }
}
export type DraftKind = keyof DraftPayloads
export type DraftRecord = {
  [Kind in DraftKind]: {
    kind: Kind
    key: string
    version: 2
    revision: number
    baseUpdatedAt: string | null
    payload: DraftPayloads[Kind]
    updatedAt: string
  }
}[DraftKind]
export interface DraftSnapshot {
  generation: string
  revision: number
  baseUpdatedAt: string | null
  record: DraftRecord | null
}
export interface DraftRef {
  kind: DraftKind
  key: string
  generation: string
  revision: number
}
export type DraftWrite = DraftRef & {
  baseUpdatedAt: string | null
  payload: DraftPayloads[DraftKind]
}
export type DataDomain = 'tasks' | 'organization' | 'flow' | 'settings' | 'all'
export function taskToDraft(task: Task): TaskEditorDraft {
  return { plan: task.plan, focusDate: task.focusDate, title: task.title, listId: task.listId, dueDate: task.dueDate ?? '', dueTime: task.dueTime ?? '',
    reminderMinutesBefore: task.reminderMinutesBefore, tagIds: task.tags.map(tag => tag.id), priority: task.priority,
    notes: task.notes, recurrence: task.recurrence?.frequency ?? 'none', recurrenceEnd: task.recurrence?.endDate ?? '',
    recurrenceInterval: task.recurrence?.interval ?? 1, recurrenceWeekdays: task.recurrence?.weekdays ?? [] }
}
export function draftToTask(draft: TaskEditorDraft): UpdateTaskInput {
  return { plan: draft.plan, focusDate: draft.focusDate, title: draft.title.trim(), listId: draft.listId, dueDate: draft.dueDate || null, dueTime: draft.dueTime || null,
    reminderMinutesBefore: draft.reminderMinutesBefore, tagIds: draft.tagIds, priority: draft.priority, notes: draft.notes,
    recurrence: draft.recurrence === 'none' ? null : { frequency: draft.recurrence, interval: draft.recurrenceInterval ?? 1,
      weekdays: draft.recurrenceWeekdays ?? [], endDate: draft.recurrenceEnd || null } }
}
