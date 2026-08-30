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
}

export interface CreateTaskInput {
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

export interface CreateVideoReflectionInput { date: string; title: string; sourceUrl: string; author?: string }
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
  format: 'rumo-flow-backup' | 'rumo-daiban-backup'
  version: 1 | 2 | 3
  exportedAt: string
  taskLists: TaskList[]
  tasks: Task[]
  recurrenceRules: RecurrenceRule[]
  tags?: Tag[]
  taskTags?: Array<{ taskId: string; tagId: string }>
  savedFilters?: SavedFilter[]
  flowDays?: DailyReview[]
  videoReflections?: VideoReflection[]
  settings: Record<string, unknown>
}

export interface ImportResult { importedTasks: number; importedLists: number; importedRules: number; importedReviews: number; importedVideos: number }

export interface TodoApi {
  tasks: {
    list(query?: TaskQuery): Promise<Task[]>
    create(input: CreateTaskInput): Promise<Task>
    update(id: string, input: UpdateTaskInput): Promise<Task>
    complete(id: string): Promise<void>
    restore(id: string): Promise<void>
    remove(id: string): Promise<void>
    restoreRemoved(id: string): Promise<void>
    reorder(ids: string[]): Promise<void>
  }
  lists: {
    list(): Promise<TaskList[]>
    create(input: CreateTaskListInput): Promise<TaskList>
    update(id: string, input: UpdateTaskListInput): Promise<TaskList>
    remove(id: string, options?: { taskPolicy?: 'keep' | 'delete' }): Promise<void>
    reorder(ids: string[]): Promise<void>
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
  }
  flow: {
    getDay(date: string): Promise<FlowDay>
    saveReview(input: SaveDailyReviewInput): Promise<DailyReview>
    createVideo(input: CreateVideoReflectionInput): Promise<VideoReflection>
    updateVideo(id: string, input: UpdateVideoReflectionInput): Promise<VideoReflection>
    removeVideo(id: string): Promise<void>
    month(month: string): Promise<FlowDaySummary[]>
    summary(days?: number): Promise<FlowSummary>
  }
  desktop: {
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
