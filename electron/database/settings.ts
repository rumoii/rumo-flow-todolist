import { getDatabase } from './db'
import { defaults } from './common'
import { timestamp, validTime, localDate } from './common'
import type { AppSettings } from '../../src/shared/contracts'
export class SettingsRepository {
  getSettings(): AppSettings { const values = Object.fromEntries((getDatabase().prepare('SELECT key,value FROM app_settings').all() as any[]).map((row) => [row.key, JSON.parse(row.value)])); return { ...defaults, ...values }; }
  validateSettings(input: Partial<AppSettings>): AppSettings { const result = { ...this.getSettings(), ...input }; if (!['light', 'dark'].includes(result.theme) || !['comfortable', 'compact'].includes(result.density) || !result.globalShortcut.trim() || !Number.isInteger(result.dailyVideoLimit) || result.dailyVideoLimit < 0 || result.dailyVideoLimit > 10 || typeof result.reviewReminderEnabled !== 'boolean' || !validTime(result.reviewReminderTime))
    throw new Error('设置无效'); return result; }
  updateSettings(input: Partial<AppSettings>): AppSettings { const result = this.validateSettings(input); const db = getDatabase(); const save = db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'); db.transaction(() => { Object.entries(result).forEach(([key, value]) => save.run(key, JSON.stringify(value))); db.prepare('UPDATE flow_days SET video_limit=?,updated_at=? WHERE entry_date=?').run(result.dailyVideoLimit, timestamp(), localDate()); })(); return result; }
}
