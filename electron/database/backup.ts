import { getDatabase } from './db'
import { timestamp, mapRule, validCalendarDate, normalizeHttpUrl } from './common'
import type { AppSettings, BackupPayload } from '../../src/shared/contracts'
import fs from 'node:fs'
import path from 'node:path'
import { TaskRepository } from './tasks'
import { OrganizationRepository } from './organization'
import { FlowRepository } from './flow'
import { SettingsRepository } from './settings'
import { DraftRepository } from './drafts'
export class BackupService {
  constructor(private readonly tasks: TaskRepository, private readonly organization: OrganizationRepository, private readonly flow: FlowRepository, private readonly settings: SettingsRepository, private readonly drafts: DraftRepository) { }
  exportBackup(): BackupPayload { const db = getDatabase(); const tasks = this.tasks.listTasks(); return { format: 'rumo-flow-backup', version: 4, drafts: this.drafts.list(), exportedAt: timestamp(), taskLists: this.organization.listLists(), tasks, recurrenceRules: (db.prepare('SELECT * FROM recurrence_rules WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NULL)').all() as any[]).map(mapRule), tags: this.organization.listTags(), taskTags: (db.prepare('SELECT task_id AS taskId,tag_id AS tagId FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE deleted_at IS NULL)').all() as any[]), savedFilters: this.organization.listSavedFilters(), flowDays: (db.prepare('SELECT * FROM flow_days ORDER BY entry_date').all() as any[]).map((row) => this.flow.mapFlowDay(row)), videoReflections: (db.prepare('SELECT * FROM flow_videos ORDER BY entry_date,created_at').all() as any[]).map((row) => this.flow.mapFlowVideo(row)), settings: { ...this.settings.getSettings() } }; }
  importBackup(payload: BackupPayload): {
    importedTasks: number
    importedLists: number
    importedRules: number
    importedReviews: number
    importedVideos: number
  } {
    this.validateBackup(payload)
    const db = getDatabase()
    const flowDays = payload.version >= 3 ? payload.flowDays ?? [] : []
    const videoReflections = payload.version >= 3 ? payload.videoReflections ?? [] : []
    const folder = path.join(path.dirname(db.name), 'backups')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, `pre-import-${Date.now()}.json`), JSON.stringify(this.exportBackup(), null, 2))
    db.transaction(() => {
      db.exec('DELETE FROM flow_days; DELETE FROM flow_videos; DELETE FROM recurrence_rules; DELETE FROM task_tags; DELETE FROM tasks; DELETE FROM task_lists; DELETE FROM tags; DELETE FROM saved_filters; DELETE FROM app_settings;')
      const lists = db.prepare('INSERT INTO task_lists(id,name,color,sort_order,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      payload.taskLists.forEach((x) => lists.run(x.id, x.name, x.color, x.sortOrder, x.isPinned ? 1 : 0, x.createdAt, x.updatedAt))
      const tags = db.prepare('INSERT INTO tags(id,name,color,created_at,updated_at) VALUES (?,?,?,?,?)')
      ;(payload.tags ?? []).forEach((x) => tags.run(x.id, x.name, x.color, x.createdAt, x.updatedAt))
      const tasks = db.prepare('INSERT INTO tasks(id,title,list_id,due_date,due_time,reminder_minutes_before,priority,notes,status,sort_order,is_pinned,parent_task_id,recurrence_rule_id,created_at,updated_at,completed_at,generated_from_task_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL)')
      payload.tasks.forEach((x) => tasks.run(x.id, x.title, x.listId, x.dueDate, x.dueTime ?? null, x.reminderMinutesBefore ?? null, x.priority, x.notes, x.status, x.sortOrder, x.isPinned ? 1 : 0, x.recurrenceRuleId, x.createdAt, x.updatedAt, x.completedAt))
      const taskLinks = db.prepare('UPDATE tasks SET parent_task_id=?,generated_from_task_id=? WHERE id=?')
      payload.tasks.forEach((x) => taskLinks.run(x.parentTaskId, x.generatedFromTaskId ?? null, x.id))
      const rules = db.prepare('INSERT INTO recurrence_rules(id,task_id,frequency,interval,weekdays,end_date,next_due_date,month_day) VALUES (?,?,?,?,?,?,?,?)')
      payload.recurrenceRules.forEach((x) => rules.run(x.id, x.taskId, x.frequency, x.interval, JSON.stringify(x.weekdays), x.endDate, x.nextDueDate, x.monthDay ?? null))
      const links = db.prepare('INSERT INTO task_tags(task_id,tag_id) VALUES (?,?)')
      ;(payload.taskTags ?? []).forEach((x) => links.run(x.taskId, x.tagId))
      const filters = db.prepare('INSERT INTO saved_filters(id,name,criteria_json,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      ;(payload.savedFilters ?? []).forEach((x) => filters.run(x.id, x.name, JSON.stringify(x.criteria), x.sortOrder, x.createdAt, x.updatedAt))
      const videos = db.prepare('INSERT INTO flow_videos(id,entry_date,title,source_url,author,thought,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      videoReflections.forEach((x) => videos.run(x.id, x.date, x.title, x.sourceUrl, x.author, x.thought, x.createdAt, x.updatedAt))
      const days = db.prepare('INSERT INTO flow_days(entry_date,video_limit,did_well,did_not_well,reflection,input_type,input_video_id,input_text,output_text,tomorrow_expectation,saved_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      flowDays.forEach((x) => days.run(x.date, x.videoLimit, x.didWell, x.didNotWell, x.reflection, x.inputType, x.inputVideoId, x.inputText, x.outputText, x.tomorrowExpectation, x.savedAt, x.createdAt, x.updatedAt))
      this.drafts.replace(payload.version === 4 ? payload.drafts! : [])
      const settings = db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)')
      Object.entries(payload.settings).forEach(([key, value]) => settings.run(key, JSON.stringify(value)))
    })()
    return { importedTasks: payload.tasks.length, importedLists: payload.taskLists.length, importedRules: payload.recurrenceRules.length, importedReviews: flowDays.filter((item) => item.savedAt).length, importedVideos: videoReflections.length }
  }
  private validateBackup(payload: BackupPayload): void {
    this.drafts.validateBackup(payload)
    if (!payload || ![1, 2, 3, 4].includes(payload.version) || !['rumo-flow-backup', 'rumo-daiban-backup'].includes(payload.format) || !Array.isArray(payload.tasks) || !Array.isArray(payload.taskLists) || !Array.isArray(payload.recurrenceRules))
      throw new Error('备份文件格式不受支持')
    this.settings.validateSettings(payload.settings as Partial<AppSettings>)
    const lists = new Set(payload.taskLists.map((x) => x.id))
    const tasks = new Set(payload.tasks.map((x) => x.id))
    if (lists.size !== payload.taskLists.length || tasks.size !== payload.tasks.length)
      throw new Error('备份文件包含重复编号')
    payload.tasks.forEach((task) => { if (!task.id || !task.title || (task.listId && !lists.has(task.listId)) || (task.parentTaskId && !tasks.has(task.parentTaskId)))
      throw new Error('备份任务数据无效'); this.tasks.validateTask(task); })
    const rules = new Set(payload.recurrenceRules.map((x) => x.id))
    if (rules.size !== payload.recurrenceRules.length || payload.recurrenceRules.some((x) => !tasks.has(x.taskId)))
      throw new Error('备份重复规则无效')
    if (payload.tasks.some((x) => (x.recurrenceRuleId && !rules.has(x.recurrenceRuleId)) || (x.generatedFromTaskId && !tasks.has(x.generatedFromTaskId))))
      throw new Error('备份任务关联无效')
    if (payload.version >= 2) {
      const tags = new Set((payload.tags ?? []).map((x) => x.id))
      if ((payload.taskTags ?? []).some((x) => !tasks.has(x.taskId) || !tags.has(x.tagId)))
        throw new Error('备份标签关联无效')
      ;(payload.savedFilters ?? []).forEach((x) => this.organization.validateCriteria(x.criteria))
    }
    if (payload.version >= 3) {
      if (!Array.isArray(payload.flowDays) || !Array.isArray(payload.videoReflections))
        throw new Error('心流备份数据缺失')
      const dayDates = new Set(payload.flowDays.map((x) => x.date))
      const videoDates = new Map(payload.videoReflections.map((x) => [x.id, x.date]))
      if (dayDates.size !== payload.flowDays.length || videoDates.size !== payload.videoReflections.length)
        throw new Error('心流备份包含重复记录')
      payload.flowDays.forEach((x) => { if (!validCalendarDate(x.date) || !Number.isInteger(x.videoLimit) || x.videoLimit < 0 || x.videoLimit > 10 || !['none', 'video', 'other'].includes(x.inputType) || (x.inputType === 'video') !== Boolean(x.inputVideoId) || (x.inputVideoId && videoDates.get(x.inputVideoId) !== x.date))
        throw new Error('心流复盘数据无效'); })
      payload.videoReflections.forEach((x) => { if (!x.id || !dayDates.has(x.date) || typeof x.title !== 'string')
        throw new Error('视频复盘数据无效'); normalizeHttpUrl(x.sourceUrl); })
    }
  }
}
