import { getDatabase } from './db'
import { timestamp, newId, mapList, mapTag } from './common'
import type { CreateSavedFilterInput, CreateTagInput, CreateTaskListInput, SavedFilter, Tag, TaskFilterCriteria, TaskList, UpdateSavedFilterInput, UpdateTagInput, UpdateTaskListInput } from '../../src/shared/contracts'
export class OrganizationRepository {
  listLists(): TaskList[] { return (getDatabase().prepare('SELECT * FROM task_lists ORDER BY is_pinned DESC,sort_order,name').all() as any[]).map(mapList); }
  createList(input: CreateTaskListInput): TaskList { if (!input.name?.trim())
    throw new Error('清单名称不能为空'); if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean')
    throw new Error('清单置顶状态无效'); const id = newId(); const createdAt = timestamp(); getDatabase().prepare('INSERT INTO task_lists(id,name,color,sort_order,is_pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, input.name.trim(), input.color ?? null, input.sortOrder ?? 0, input.isPinned ? 1 : 0, createdAt, createdAt); return mapList(getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(id)); }
  updateList(id: string, input: UpdateTaskListInput): TaskList { const current = getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(id) as any; if (!current)
    throw new Error('清单不存在'); if (input.isPinned !== undefined && typeof input.isPinned !== 'boolean')
    throw new Error('清单置顶状态无效'); getDatabase().prepare('UPDATE task_lists SET name=?,color=?,sort_order=?,is_pinned=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.color === undefined ? current.color : input.color, input.sortOrder ?? current.sort_order, input.isPinned === undefined ? current.is_pinned : input.isPinned ? 1 : 0, timestamp(), id); return mapList(getDatabase().prepare('SELECT * FROM task_lists WHERE id=?').get(id)); }
  reorderLists(ids: string[]): void { const db = getDatabase(); const update = db.prepare('UPDATE task_lists SET sort_order=?,updated_at=? WHERE id=?'); db.transaction(() => ids.forEach((id, index) => { if (update.run(index, timestamp(), id).changes !== 1)
    throw new Error('清单不存在'); }))(); }
  organizeList(id: string, input: {
    isPinned: boolean
    orderedIds: string[]
  }): TaskList {
    if (!Array.isArray(input.orderedIds) || input.orderedIds.some((item) => typeof item !== 'string') || !input.orderedIds.includes(id))
      throw new Error('清单顺序无效')
    if (typeof input.isPinned !== 'boolean')
      throw new Error('清单分组无效')
    const db = getDatabase()
    db.transaction(() => {
      if (db.prepare('UPDATE task_lists SET is_pinned=?,updated_at=? WHERE id=?').run(input.isPinned ? 1 : 0, timestamp(), id).changes !== 1)
        throw new Error('清单不存在')
      const groupIds = (db.prepare('SELECT id FROM task_lists WHERE is_pinned=?').all(input.isPinned ? 1 : 0) as Array<{
        id: string
      }>).map((item) => item.id)
      if (new Set(input.orderedIds).size !== input.orderedIds.length || groupIds.length !== input.orderedIds.length || groupIds.some((item) => !input.orderedIds.includes(item)))
        throw new Error('清单顺序不完整')
      this.reorderLists(input.orderedIds)
    })()
    return mapList(db.prepare('SELECT * FROM task_lists WHERE id=?').get(id))
  }
  removeList(id: string, policy: 'keep' | 'delete' = 'keep'): void { const db = getDatabase(); db.transaction(() => { if (policy === 'delete')
    db.prepare('UPDATE tasks SET deleted_at=?,updated_at=? WHERE list_id=?').run(timestamp(), timestamp(), id)
  else
    db.prepare('UPDATE tasks SET list_id=NULL,updated_at=? WHERE list_id=?').run(timestamp(), id); if (db.prepare('DELETE FROM task_lists WHERE id=?').run(id).changes !== 1)
    throw new Error('清单不存在'); })(); }
  listTags(): Tag[] { return (getDatabase().prepare('SELECT * FROM tags ORDER BY name').all() as any[]).map(mapTag); }
  createTag(input: CreateTagInput): Tag { if (!input.name?.trim())
    throw new Error('标签名称不能为空'); const id = newId(); const createdAt = timestamp(); try {
    getDatabase().prepare('INSERT INTO tags(id,name,color,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, input.name.trim(), input.color ?? null, createdAt, createdAt)
  }
  catch {
    throw new Error('标签名称已存在')
  } return mapTag(getDatabase().prepare('SELECT * FROM tags WHERE id=?').get(id)); }
  updateTag(id: string, input: UpdateTagInput): Tag { const current = getDatabase().prepare('SELECT * FROM tags WHERE id=?').get(id) as any; if (!current)
    throw new Error('标签不存在'); getDatabase().prepare('UPDATE tags SET name=?,color=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.color === undefined ? current.color : input.color, timestamp(), id); return mapTag(getDatabase().prepare('SELECT * FROM tags WHERE id=?').get(id)); }
  removeTag(id: string): void { if (getDatabase().prepare('DELETE FROM tags WHERE id=?').run(id).changes !== 1)
    throw new Error('标签不存在'); }
  validateCriteria(criteria: TaskFilterCriteria): void { if (!criteria || typeof criteria !== 'object' || (criteria.status && !['active', 'completed', 'all'].includes(criteria.status)) || (criteria.due && !['today', 'overdue', 'next7', 'none', 'any'].includes(criteria.due)))
    throw new Error('筛选条件无效'); }
  listSavedFilters(): SavedFilter[] { return (getDatabase().prepare('SELECT * FROM saved_filters ORDER BY sort_order,name').all() as any[]).map((row) => ({ id: row.id, name: row.name, criteria: JSON.parse(row.criteria_json), sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })); }
  createSavedFilter(input: CreateSavedFilterInput): SavedFilter { if (!input.name?.trim())
    throw new Error('筛选名称不能为空'); this.validateCriteria(input.criteria); const id = newId(); const createdAt = timestamp(); getDatabase().prepare('INSERT INTO saved_filters(id,name,criteria_json,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, input.name.trim(), JSON.stringify(input.criteria), input.sortOrder ?? 0, createdAt, createdAt); return this.listSavedFilters().find((item) => item.id === id)!; }
  updateSavedFilter(id: string, input: UpdateSavedFilterInput): SavedFilter { const current = getDatabase().prepare('SELECT * FROM saved_filters WHERE id=?').get(id) as any; if (!current)
    throw new Error('筛选不存在'); if (input.criteria)
    this.validateCriteria(input.criteria); getDatabase().prepare('UPDATE saved_filters SET name=?,criteria_json=?,sort_order=?,updated_at=? WHERE id=?').run(input.name?.trim() ?? current.name, input.criteria ? JSON.stringify(input.criteria) : current.criteria_json, input.sortOrder ?? current.sort_order, timestamp(), id); return this.listSavedFilters().find((item) => item.id === id)!; }
  removeSavedFilter(id: string): void { if (getDatabase().prepare('DELETE FROM saved_filters WHERE id=?').run(id).changes !== 1)
    throw new Error('筛选不存在'); }
}
