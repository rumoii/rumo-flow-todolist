import type { DraftKind, DraftSnapshot, DraftWrite, DraftRef, DraftRecord, DataDomain } from './drafts'
import type { TaskPlan } from './planning'
export type { TaskPlan, PlanKind } from './planning'
export type ArrangeTaskAction = { kind: 'plan'; target: TaskPlan | 'today' | 'tomorrow' | 'week' | 'month' | null } | { kind: 'focus'; enabled: boolean }
export interface ArrangeTaskInput { taskId: string; updatedAt: string; generation: string; action: ArrangeTaskAction }
export type LifecycleReason = 'backup' | 'import' | 'close' | 'arrange'
export interface TaskSynchronization { task: Task; snapshot: DraftSnapshot }
export interface LifecycleResume { replaced: boolean; synchronizedTask?: TaskSynchronization }
export type TaskBatchAction = { kind: 'plan'; plan: TaskPlan | null } | { kind: 'deadline'; date: string | null } | { kind: 'move'; listId: string | null } | { kind: 'tags'; tagIds: string[] } | { kind: 'complete' | 'remove' | 'recover' | 'purge' }
export interface ActionSource { kind: 'review' | 'video'; key: string }
export interface ActionLink { requestId: string; taskId: string | null; sourceKind: 'review' | 'video'; sourceKey: string; sourceLabel: string; sourceDate: string; createdAt: string; sourceDeleted: boolean }
export interface ActionLinkView extends ActionLink { task: Pick<Task, 'id' | 'title' | 'status' | 'deletedAt'> | null }
export interface CreateActionInput { requestId: string; source: ActionSource; sourceUpdatedAt: string; task: CreateTaskInput }
export interface SearchHit { kind: 'task' | 'video' | 'review'; key: string; date: string | null; title: string; excerpt: string }
export type { DraftKind, DraftSnapshot, DraftWrite, DraftRef, DraftRecord, DataDomain } from './drafts'
export type TaskPriority = 'none' | 'low' | 'medium' | 'high'
export type TaskStatus = 'active' | 'completed'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'
export type ThemeMode = 'light' | 'dark'
export type DensityMode = 'comfortable' | 'compact'
export type DueFilter = 'today' | 'overdue' | 'next7' | 'none' | 'any'
export type DailyInputType = 'none' | 'video' | 'other'

export interface Tag {
  id: string
  name: string
  color: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskList {
  id: string
  name: string
  color: string | null
  sortOrder: number
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface RecurrenceRule {
  id: string
  taskId: string
  frequency: RecurrenceFrequency
  interval: number
  weekdays: number[]
  monthDay?: number | null
  endDate: string | null
  nextDueDate: string | null
}

export interface Task {
  plan: TaskPlan | null
  focusDate: string | null
  deletionBatch: string | null
  id: string
  title: string
  listId: string | null
  dueDate: string | null
  dueTime: string | null
  reminderMinutesBefore: number | null
  priority: TaskPriority
  notes: string
  status: TaskStatus
  sortOrder: number
  isPinned: boolean
  parentTaskId: string | null
  recurrenceRuleId: string | null
  generatedFromTaskId?: string | null
  deletedAt: string | null
  tags: Tag[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  recurrence?: RecurrenceRule | null
}

export interface CreateTaskInput {
  plan?: TaskPlan | null
  focusDate?: string | null
  title: string
  listId?: string | null
  dueDate?: string | null
  dueTime?: string | null
  reminderMinutesBefore?: number | null
  priority?: TaskPriority
  notes?: string
  sortOrder?: number
  isPinned?: boolean
  tagIds?: string[]
  parentTaskId?: string | null
  recurrence?: {
    frequency: RecurrenceFrequency
    interval?: number
    weekdays?: number[]
    endDate?: string | null
  } | null
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'recurrence'>> & {
  recurrence?: CreateTaskInput['recurrence']
}

export interface OrganizeTaskInput {
  isPinned: boolean
  priority: TaskPriority
  orderedIds: string[]
}

export interface TaskFilterCriteria {
  status?: TaskStatus | 'all'
  listId?: string | null
  priorities?: TaskPriority[]
  tagIds?: string[]
  due?: DueFilter
  search?: string
}

export interface SavedFilter {
  id: string
  name: string
  criteria: TaskFilterCriteria
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TaskQuery extends TaskFilterCriteria {
  dueFrom?: string
  dueTo?: string
  includeOverdue?: boolean
  includeDeleted?: boolean
}

export interface CreateTaskListInput { name: string; color?: string | null; sortOrder?: number; isPinned?: boolean }
export interface UpdateTaskListInput { name?: string; color?: string | null; sortOrder?: number; isPinned?: boolean }
export interface OrganizeTaskListInput { isPinned: boolean; orderedIds: string[] }
export interface CreateTagInput { name: string; color?: string | null }
export interface UpdateTagInput { name?: string; color?: string | null }
export interface CreateSavedFilterInput { name: string; criteria: TaskFilterCriteria; sortOrder?: number }
export type UpdateSavedFilterInput = Partial<CreateSavedFilterInput>

export interface AppSettings {
  theme: ThemeMode
  density: DensityMode
  globalShortcut: string
  dailyVideoLimit: number
  reviewReminderEnabled: boolean
  reviewReminderTime: string
}

export interface VideoReflection {
  id: string
  date: string
  title: string
  sourceUrl: string
  sourcePlatform: string
  author: string
  thought: string
  createdAt: string
  updatedAt: string
}

export interface DailyReview {
  date: string
  videoLimit: number
  didWell: string
  didNotWell: string
  reflection: string
  inputType: DailyInputType
  inputVideoId: string | null
  inputText: string
  outputText: string
  tomorrowExpectation: string
  savedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowDay {
  review: DailyReview
  videos: VideoReflection[]
}

export interface FlowDaySummary {
  date: string
  videoLimit: number
  videoCount: number
  pendingThoughtCount: number
  reviewSaved: boolean
  overLimit: boolean
}

export interface FlowSummary {
  from: string
  to: string
  reviewedDays: number
  videoCount: number
  overLimitDays: number
  pendingThoughts: number
}

export interface CreateVideoReflectionInput { date: string; title?: string; sourceUrl: string; author?: string }
export interface UpdateVideoReflectionInput { title?: string; sourceUrl?: string; author?: string; thought?: string }
export interface SaveDailyReviewInput {
  date: string
  didWell?: string
  didNotWell?: string
  reflection?: string
  inputType?: DailyInputType
  inputVideoId?: string | null
  inputText?: string
  outputText?: string
  tomorrowExpectation?: string
}

export interface DesktopStatus {
  globalShortcut: string
  globalShortcutRegistered: boolean
}

export interface BackupPayload {
  format: 'rumo-flow-backup'
  version: 5
  exportedAt: string
  taskLists: TaskList[]
  tasks: Task[]
  recurrenceRules: RecurrenceRule[]
  tags: Tag[]
  taskTags: Array<{ taskId: string; tagId: string }>
  savedFilters: SavedFilter[]
  flowDays: DailyReview[]
  videoReflections: VideoReflection[]
  actionLinks: ActionLink[]
  settings: Record<string, unknown>
  drafts: DraftRecord[]
}

export interface ImportResult { importedTasks: number; importedLists: number; importedRules: number; importedReviews: number; importedVideos: number }

export interface TodoApi {
  drafts: {
    get(kind: DraftKind, key: string): Promise<DraftSnapshot>
    put(input: DraftWrite): Promise<DraftSnapshot>
    discard(input: DraftRef): Promise<DraftSnapshot>
    commit(input: DraftRef & { acceptChanges?: boolean }): Promise<unknown>
  }
  lifecycle: {
    onPrepare(callback: (request: { id: string; reason: LifecycleReason; taskId?: string }) => Promise<void>): () => void
    onResume(callback: (result: LifecycleResume) => void): () => void
  }
  tasks: {
    arrange(input: ArrangeTaskInput): Promise<Task>
    batch(ids: string[], action: TaskBatchAction): Promise<void>
    search(text: string): Promise<SearchHit[]>
    list(query?: TaskQuery): Promise<Task[]>
    create(input: CreateTaskInput): Promise<Task>
    update(id: string, input: UpdateTaskInput): Promise<Task>
    complete(id: string): Promise<void>
    reopen(id: string): Promise<void>
    remove(id: string): Promise<void>
    recover(id: string): Promise<void>
    reorder(ids: string[]): Promise<void>
    organize(id: string, input: OrganizeTaskInput): Promise<Task>
  }
  lists: {
    list(): Promise<TaskList[]>
    create(input: CreateTaskListInput): Promise<TaskList>
    update(id: string, input: UpdateTaskListInput): Promise<TaskList>
    remove(id: string, options?: { taskPolicy?: 'keep' | 'delete' }): Promise<void>
    reorder(ids: string[]): Promise<void>
    organize(id: string, input: OrganizeTaskListInput): Promise<TaskList>
  }
  tags: {
    list(): Promise<Tag[]>
    create(input: CreateTagInput): Promise<Tag>
    update(id: string, input: UpdateTagInput): Promise<Tag>
    remove(id: string): Promise<void>
  }
  filters: {
    list(): Promise<SavedFilter[]>
    create(input: CreateSavedFilterInput): Promise<SavedFilter>
    update(id: string, input: UpdateSavedFilterInput): Promise<SavedFilter>
    remove(id: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    update(input: Partial<AppSettings>): Promise<AppSettings>
    onChanged(callback: (settings: AppSettings) => void): () => void
  }
  flow: {
    createAction(input: CreateActionInput): Promise<Task>
    actionLinks(source?: ActionSource, taskId?: string): Promise<ActionLinkView[]>
    taskFacts(date: string): Promise<{ completed: Task[]; pending: Task[] }>
    getDay(date: string): Promise<FlowDay>
    saveReview(input: SaveDailyReviewInput): Promise<DailyReview>
    createVideo(input: CreateVideoReflectionInput): Promise<VideoReflection>
    updateVideo(id: string, input: UpdateVideoReflectionInput): Promise<VideoReflection>
    removeVideo(id: string): Promise<void>
    month(month: string): Promise<FlowDaySummary[]>
    summary(days?: number): Promise<FlowSummary>
  }
  desktop: {
    onDataChanged(callback: (domains: DataDomain[]) => void): () => void
    onCaptureShown(callback: () => void): () => void
    status(): Promise<DesktopStatus>
    openQuickCapture(): Promise<void>
    openExternal(url: string): Promise<void>
    onFocusQuickAdd(callback: (taskId?: string) => void): () => void
    onOpenFlow(callback: () => void): () => void
  }
  backup: {
    export(): Promise<string | null>
    import(payload?: BackupPayload | string): Promise<ImportResult | null>
  }
}

declare global {
  interface Window { todoApi: TodoApi }
}
