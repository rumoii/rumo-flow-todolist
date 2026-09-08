import { getDatabase } from './db'
import { timestamp, newId, localDate, shiftDate, validCalendarDate, normalizeHttpUrl, platformForUrl } from './common'
import type { CreateVideoReflectionInput, DailyReview, FlowDay, FlowDaySummary, FlowSummary, SaveDailyReviewInput, UpdateVideoReflectionInput, VideoReflection } from '../../src/shared/contracts'
import { SettingsRepository } from './settings'
import { listFlowHistory } from './flow-history'
import type { FlowHistoryQuery } from '../../src/shared/contracts'
export class FlowRepository {
  constructor(private readonly settings: SettingsRepository) { }
  history(query: FlowHistoryQuery) { return listFlowHistory(query) }
  mapFlowDay(row: any): DailyReview {
    const inputVideoId = row.input_video_id ?? null
    return { date: row.entry_date, videoLimit: row.video_limit, didWell: row.did_well, didNotWell: row.did_not_well, reflection: row.reflection, inputType: row.input_type === 'video' && !inputVideoId ? 'none' : row.input_type, inputVideoId, inputText: row.input_text, outputText: row.output_text, tomorrowExpectation: row.tomorrow_expectation, savedAt: row.saved_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at }
  }
  mapFlowVideo(row: any): VideoReflection { return { id: row.id, date: row.entry_date, title: row.title, sourceUrl: row.source_url, sourcePlatform: platformForUrl(row.source_url), author: row.author, thought: row.thought, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private ensureFlowDay(date: string): DailyReview {
    if (!validCalendarDate(date))
      throw new Error('心流日期无效')
    const db = getDatabase()
    const createdAt = timestamp()
    const currentLimit = this.settings.getSettings().dailyVideoLimit
    db.prepare('INSERT OR IGNORE INTO flow_days(entry_date,video_limit,created_at,updated_at) VALUES (?,?,?,?)').run(date, currentLimit, createdAt, createdAt)
    if (date === localDate())
      db.prepare('UPDATE flow_days SET video_limit=? WHERE entry_date=?').run(currentLimit, date)
    return this.mapFlowDay(db.prepare('SELECT * FROM flow_days WHERE entry_date=?').get(date))
  }
  getFlowDay(date: string): FlowDay {
    if (!validCalendarDate(date)) throw new Error('心流日期无效')
    const row = getDatabase().prepare('SELECT * FROM flow_days WHERE entry_date=?').get(date)
    const currentLimit = this.settings.getSettings().dailyVideoLimit
    const now = timestamp()
    const review: DailyReview = row ? this.mapFlowDay(row) : { date, videoLimit: currentLimit, didWell: '', didNotWell: '', reflection: '', inputType: 'none', inputVideoId: null, inputText: '', outputText: '', tomorrowExpectation: '', savedAt: null, createdAt: now, updatedAt: now }
    if (date === localDate()) review.videoLimit = currentLimit
    const videos = (getDatabase().prepare('SELECT * FROM flow_videos WHERE entry_date=? ORDER BY created_at,rowid').all(date) as any[]).map(row => this.mapFlowVideo(row))
    return { review, videos }
  }
  saveFlowReview(input: SaveDailyReviewInput): DailyReview {
    if (!validCalendarDate(input.date) || input.date > localDate()) throw new Error('请选择今天或过去的日期')
    const review = this.ensureFlowDay(input.date)
    const inputType = input.inputType ?? 'none'
    if (!['none', 'video', 'other'].includes(inputType))
      throw new Error('输入类型无效')
    let inputVideoId = inputType === 'video' ? input.inputVideoId ?? null : null
    if (inputVideoId) {
      const video = getDatabase().prepare('SELECT entry_date FROM flow_videos WHERE id=?').get(inputVideoId) as {
        entry_date: string
      } | undefined
      if (!video || video.entry_date !== input.date)
        throw new Error('关联的视频不存在')
    }
    if (inputType === 'video' && !inputVideoId)
      throw new Error('请选择当天的视频')
    const savedAt = new Date(Math.max(Date.now(), Date.parse(review.updatedAt) + 1)).toISOString()
    getDatabase().prepare('UPDATE flow_days SET did_well=?,did_not_well=?,reflection=?,input_type=?,input_video_id=?,input_text=?,output_text=?,tomorrow_expectation=?,saved_at=?,updated_at=? WHERE entry_date=?').run(input.didWell ?? '', input.didNotWell ?? '', input.reflection ?? '', inputType, inputVideoId, input.inputText ?? '', input.outputText ?? '', input.tomorrowExpectation ?? '', savedAt, savedAt, review.date)
    return this.mapFlowDay(getDatabase().prepare('SELECT * FROM flow_days WHERE entry_date=?').get(review.date))
  }
  createFlowVideo(input: CreateVideoReflectionInput): VideoReflection {
    if (!validCalendarDate(input.date) || input.date > localDate())
      throw new Error('请选择今天或过去的日期')
    const sourceUrl = normalizeHttpUrl(input.sourceUrl)
    this.ensureFlowDay(input.date)
    const id = newId()
    const createdAt = timestamp()
    getDatabase().prepare('INSERT INTO flow_videos(id,entry_date,title,source_url,author,thought,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id, input.date, input.title?.trim() ?? '', sourceUrl, input.author?.trim() ?? '', '', createdAt, createdAt)
    return this.mapFlowVideo(getDatabase().prepare('SELECT * FROM flow_videos WHERE id=?').get(id))
  }
  updateFlowVideo(id: string, input: UpdateVideoReflectionInput): VideoReflection {
    const db = getDatabase()
    const current = db.prepare('SELECT * FROM flow_videos WHERE id=?').get(id) as any
    if (!current)
      throw new Error('视频记录不存在')
    const title = input.title === undefined ? current.title : input.title.trim()
    const sourceUrl = input.sourceUrl === undefined ? current.source_url : normalizeHttpUrl(input.sourceUrl)
    db.prepare('UPDATE flow_videos SET title=?,source_url=?,author=?,thought=?,updated_at=? WHERE id=?').run(title, sourceUrl, input.author === undefined ? current.author : input.author.trim(), input.thought === undefined ? current.thought : input.thought, new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString(), id)
    return this.mapFlowVideo(db.prepare('SELECT * FROM flow_videos WHERE id=?').get(id))
  }
  removeFlowVideo(id: string): void { if (getDatabase().prepare('DELETE FROM flow_videos WHERE id=?').run(id).changes !== 1)
    throw new Error('视频记录不存在'); }
  listFlowMonth(month: string): FlowDaySummary[] {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new Error('月份格式无效')
    return (getDatabase().prepare(`SELECT d.entry_date,d.video_limit,d.saved_at,COUNT(v.id) AS video_count,SUM(CASE WHEN v.id IS NOT NULL AND TRIM(v.thought)='' THEN 1 ELSE 0 END) AS pending_count FROM flow_days d LEFT JOIN flow_videos v ON v.entry_date=d.entry_date WHERE d.entry_date LIKE ? GROUP BY d.entry_date ORDER BY d.entry_date`).all(`${month}-%`) as any[]).map((row) => ({ date: row.entry_date, videoLimit: row.video_limit, videoCount: row.video_count, pendingThoughtCount: row.pending_count, reviewSaved: Boolean(row.saved_at), overLimit: row.video_count > row.video_limit }))
  }
  getFlowSummary(days = 7, reference = new Date()): FlowSummary {
    if (!Number.isInteger(days) || days < 1 || days > 366)
      throw new Error('统计天数无效')
    const to = localDate(reference)
    const from = shiftDate(to, 1 - days)
    const row = getDatabase().prepare(`SELECT COALESCE(SUM(CASE WHEN saved_at IS NOT NULL THEN 1 ELSE 0 END),0) AS reviewed_days,COALESCE(SUM(video_count),0) AS video_count,COALESCE(SUM(CASE WHEN video_count>video_limit THEN 1 ELSE 0 END),0) AS over_limit_days,COALESCE(SUM(pending_count),0) AS pending_thoughts FROM (SELECT d.*,COUNT(v.id) AS video_count,SUM(CASE WHEN v.id IS NOT NULL AND TRIM(v.thought)='' THEN 1 ELSE 0 END) AS pending_count FROM flow_days d LEFT JOIN flow_videos v ON v.entry_date=d.entry_date WHERE d.entry_date BETWEEN ? AND ? GROUP BY d.entry_date)`).get(from, to) as any
    return { from, to, reviewedDays: row.reviewed_days, videoCount: row.video_count, overLimitDays: row.over_limit_days, pendingThoughts: row.pending_thoughts }
  }
  nextFlowReviewReminder(reference = new Date()): {
    date: string
    remindAt: Date
  } | null {
    const settings = this.settings.getSettings()
    if (!settings.reviewReminderEnabled)
      return null
    const date = localDate(reference)
    const day = this.ensureFlowDay(date)
    const remindAt = new Date(`${date}T${settings.reviewReminderTime}:00`)
    if (!day.savedAt && !(getDatabase().prepare('SELECT reminder_notified_at FROM flow_days WHERE entry_date=?').get(date) as {
      reminder_notified_at: string | null
    } | undefined)?.reminder_notified_at)
      return { date, remindAt: remindAt <= reference ? reference : remindAt }
    const nextDateValue = shiftDate(date, 1)
    return { date: nextDateValue, remindAt: new Date(`${nextDateValue}T${settings.reviewReminderTime}:00`) }
  }
  claimFlowReviewReminder(date: string): boolean {
    if (date !== localDate())
      return false
    this.ensureFlowDay(date)
    return getDatabase().prepare('UPDATE flow_days SET reminder_notified_at=?,updated_at=? WHERE entry_date=? AND saved_at IS NULL AND reminder_notified_at IS NULL').run(timestamp(), timestamp(), date).changes === 1
  }
}
