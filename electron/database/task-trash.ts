import { getDatabase } from './db'
import { newId, timestamp } from './common'

function descendants(id: string): string[] {
  return (getDatabase().prepare('WITH RECURSIVE tree(id) AS (SELECT id FROM tasks WHERE id=? UNION SELECT tasks.id FROM tasks JOIN tree ON tasks.parent_task_id=tree.id) SELECT id FROM tree').all(id) as { id: string }[]).map(row => row.id)
}
export function removeTasks(ids: string[]): void {
  const db = getDatabase()
  db.transaction(() => {
    const roots = [...new Set(ids)].filter(id => !ids.some(other => other !== id && descendants(other).includes(id)))
    for (const id of roots) {
      const batch = newId()
      for (const child of descendants(id))
        db.prepare('UPDATE tasks SET deleted_at=?,deletion_batch=?,updated_at=? WHERE id=? AND deleted_at IS NULL').run(timestamp(), batch, timestamp(), child)
    }
  })()
}
export function recoverTasks(ids: string[]): void {
  const db = getDatabase()
  db.transaction(() => {
    const ordered = [...new Set(ids)].sort((first, second) => descendants(second).length - descendants(first).length)
    for (const id of ordered) {
      const row = db.prepare('SELECT deletion_batch,deleted_at FROM tasks WHERE id=?').get(id) as { deletion_batch: string; deleted_at: string | null } | undefined
      if (!row?.deleted_at) continue
      for (const child of descendants(id)) {
        db.prepare('UPDATE tasks SET deleted_at=NULL,deletion_batch=NULL,updated_at=? WHERE id=? AND deletion_batch=?').run(timestamp(), child, row.deletion_batch)
        db.prepare('UPDATE tasks SET parent_task_id=NULL WHERE id=? AND deleted_at IS NULL AND parent_task_id IN (SELECT id FROM tasks WHERE deleted_at IS NOT NULL)').run(child)
      }
    }
  })()
}
export function purgeTasks(ids: string[]): number {
  const db = getDatabase()
  return db.transaction(() => {
    const selected = [...new Set(ids.flatMap(descendants))]
    if (selected.some(id => !(db.prepare('SELECT deleted_at FROM tasks WHERE id=?').get(id) as { deleted_at: string | null })?.deleted_at)) throw new Error('只能永久删除回收站任务')
    for (const id of selected) {
      db.prepare('UPDATE tasks SET generated_from_task_id=NULL WHERE generated_from_task_id=?').run(id)
      db.prepare('DELETE FROM tasks WHERE id=?').run(id)
    }
    return selected.length
  })()
}
export function purgeExpiredTasks(before: string): number {
  const db = getDatabase()
  return db.transaction(() => {
    const expired = (db.prepare('SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at<?').all(before) as { id: string }[]).map(task => task.id)
    for (const id of expired) {
      db.prepare('UPDATE tasks SET parent_task_id=NULL WHERE parent_task_id=? AND (deleted_at IS NULL OR deleted_at>=?)').run(id, before)
    }
    for (const id of expired) {
      db.prepare('UPDATE tasks SET generated_from_task_id=NULL WHERE generated_from_task_id=?').run(id)
      db.prepare('DELETE FROM tasks WHERE id=?').run(id)
    }
    return expired.length
  })()
}
