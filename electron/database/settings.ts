import { getDatabase } from './db'
import { defaults, timestamp, validTime, localDate } from './common'
import type { AppSettings } from '../../src/shared/contracts'

export class SettingsRepository {
  getSettings(): AppSettings {
    const values = Object.fromEntries((getDatabase().prepare('SELECT key,value FROM app_settings').all() as { key: string; value: string }[]).map(row => [row.key, JSON.parse(row.value)]))
    return { ...defaults, ...values }
  }

  validateSettings(input: Partial<AppSettings>): AppSettings {
    const result = { ...this.getSettings(), ...input }
    if (typeof result.automaticUpdateChecks !== 'boolean') throw new Error('设置无效：自动检查更新')
    if (!['light', 'dark'].includes(result.theme)) throw new Error('设置无效：界面主题')
    if (!['comfortable', 'compact'].includes(result.density)) throw new Error('设置无效：内容密度')
    if (typeof result.globalShortcut !== 'string' || !result.globalShortcut.trim()) throw new Error('设置无效：全局快捷键')
    if (!Number.isInteger(result.dailyVideoLimit) || result.dailyVideoLimit < 0 || result.dailyVideoLimit > 10) throw new Error('设置无效：视频额度须为 0 至 10 的整数')
    if (typeof result.reviewReminderEnabled !== 'boolean') throw new Error('设置无效：复盘提醒开关')
    if (typeof result.reviewReminderTime !== 'string' || !validTime(result.reviewReminderTime)) throw new Error('设置无效：复盘提醒时间')
    return result
  }

  updateSettings(input: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    const result = this.validateSettings(input)
    const db = getDatabase()
    const save = db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    db.transaction(() => {
      Object.entries(result).filter(([key, value]) => current[key as keyof AppSettings] !== value).forEach(([key, value]) => save.run(key, JSON.stringify(value)))
      if (result.dailyVideoLimit !== current.dailyVideoLimit)
        db.prepare('UPDATE flow_days SET video_limit=?,updated_at=? WHERE entry_date=?').run(result.dailyVideoLimit, timestamp(), localDate())
    })()
    return result
  }
}
