import type Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function snapshotBeforePlanning(database: Database.Database, applied: number): void {
  if (applied >= 9) return
  if (applied > 0) {
    const directory = path.join(path.dirname(database.name), 'backups')
    fs.mkdirSync(directory, { recursive: true })
    const snapshot = path.join(directory, `pre-planning-${Date.now()}-${crypto.randomUUID()}.sqlite`)
    database.prepare('VACUUM INTO ?').run(snapshot)
  }
}
export function migratePlanning(database: Database.Database, applied: number): void {
  if (applied >= 9) return
  database.transaction(() => {
    database.exec(`
      ALTER TABLE tasks ADD COLUMN plan_json TEXT CHECK(plan_json IS NULL OR json_valid(plan_json));
      ALTER TABLE tasks ADD COLUMN focus_date TEXT;
      ALTER TABLE tasks ADD COLUMN deletion_batch TEXT;
      UPDATE tasks SET deletion_batch=id WHERE deleted_at IS NOT NULL;
      CREATE INDEX idx_tasks_deletion_batch ON tasks(deletion_batch);
      CREATE TABLE action_links (
        request_id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        source_kind TEXT NOT NULL CHECK(source_kind IN ('review','video')), source_key TEXT NOT NULL,
        source_label TEXT NOT NULL, source_date TEXT NOT NULL, created_at TEXT NOT NULL,
        source_deleted INTEGER NOT NULL DEFAULT 0 CHECK(source_deleted IN (0,1))
      );
      CREATE INDEX idx_action_links_source ON action_links(source_kind,source_key);
      CREATE TRIGGER action_video_removed AFTER DELETE ON flow_videos BEGIN
        UPDATE action_links SET source_deleted=1 WHERE source_kind='video' AND source_key=OLD.id;
      END;
      CREATE TRIGGER action_review_removed AFTER DELETE ON flow_days BEGIN
        UPDATE action_links SET source_deleted=1 WHERE source_kind='review' AND source_key=OLD.entry_date;
      END;
      UPDATE editor_drafts SET payload=json_set(payload,'$.plan',NULL,'$.focusDate',NULL)
        WHERE kind='task' AND payload IS NOT NULL;
      UPDATE editor_drafts SET version=2;
    `)
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES (9,?)').run(new Date().toISOString())
  })()
}
