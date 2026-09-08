import type { FlowHistoryPage, FlowHistoryQuery } from '../../src/shared/contracts'
import { getDatabase } from './db'
import { localDate, validCalendarDate } from './common'

export function listFlowHistory(query: FlowHistoryQuery): FlowHistoryPage {
  if (!validCalendarDate(query.from) || !validCalendarDate(query.to) || query.from > query.to || query.to > localDate()) throw new Error('请选择有效的历史日期范围')
  if (typeof query.keyword !== 'string' || query.keyword.length > 500 || typeof query.pendingOnly !== 'boolean' || typeof query.reviewedOnly !== 'boolean') throw new Error('历史筛选条件无效')
  if (query.before !== undefined && (!validCalendarDate(query.before) || query.before < query.from || query.before > query.to)) throw new Error('历史分页位置无效')
  const pattern = `%${query.keyword.trim().replace(/[\\%_]/g, '\\$&')}%`
  const rows = getDatabase().prepare(`
    SELECT day.entry_date,day.video_limit,day.saved_at,
      (SELECT COUNT(*) FROM flow_videos WHERE entry_date=day.entry_date) AS video_count,
      (SELECT COUNT(*) FROM flow_videos WHERE entry_date=day.entry_date AND TRIM(thought)='') AS pending_count,
      COALESCE(CASE WHEN day.saved_at IS NOT NULL THEN COALESCE(NULLIF(TRIM(day.reflection),''),NULLIF(TRIM(day.did_well),''),NULLIF(TRIM(day.did_not_well),''),NULLIF(TRIM(day.input_text),''),NULLIF(TRIM(day.output_text),''),NULLIF(TRIM(day.tomorrow_expectation),'')) END,
        (SELECT thought FROM flow_videos WHERE entry_date=day.entry_date AND TRIM(thought)<>'' ORDER BY created_at,rowid LIMIT 1),'') AS excerpt,
      (SELECT json_group_array(title) FROM (SELECT COALESCE(NULLIF(TRIM(title),''),'待补充标题') AS title FROM flow_videos WHERE entry_date=day.entry_date ORDER BY created_at,rowid LIMIT 2)) AS titles
    FROM flow_days AS day
    WHERE day.entry_date BETWEEN @from AND @to AND (@before IS NULL OR day.entry_date<@before)
      AND (day.saved_at IS NOT NULL OR EXISTS(SELECT 1 FROM flow_videos WHERE entry_date=day.entry_date))
      AND (@reviewed=0 OR day.saved_at IS NOT NULL)
      AND (@pending=0 OR EXISTS(SELECT 1 FROM flow_videos WHERE entry_date=day.entry_date AND TRIM(thought)=''))
      AND (@empty=1 OR (day.saved_at IS NOT NULL AND (day.did_well||' '||day.did_not_well||' '||day.reflection||' '||day.input_text||' '||day.output_text||' '||day.tomorrow_expectation) LIKE @pattern ESCAPE '\\')
        OR EXISTS(SELECT 1 FROM flow_videos WHERE entry_date=day.entry_date AND (title||' '||author||' '||thought) LIKE @pattern ESCAPE '\\'))
    ORDER BY day.entry_date DESC LIMIT 31
  `).all({ from: query.from, to: query.to, before: query.before ?? null, reviewed: Number(query.reviewedOnly), pending: Number(query.pendingOnly), empty: Number(!query.keyword.trim()), pattern }) as Array<{ entry_date: string; video_limit: number; saved_at: string | null; video_count: number; pending_count: number; excerpt: string; titles: string }>
  const entries = rows.slice(0, 30).map(row => ({ date: row.entry_date, videoLimit: row.video_limit, videoCount: row.video_count, pendingThoughtCount: row.pending_count, reviewSaved: !!row.saved_at, overLimit: row.video_count > row.video_limit, excerpt: row.excerpt.slice(0, 240), videoTitles: JSON.parse(row.titles) as string[] }))
  return { entries, nextCursor: rows.length > 30 ? entries[entries.length - 1].date : null }
}
