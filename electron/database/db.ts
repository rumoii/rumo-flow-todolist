import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

let db: Database.Database | undefined
let testDatabasePath: string | undefined

export function getDatabase(databasePath?: string): Database.Database {
  if (db) return db
  const selectedPath = databasePath ?? testDatabasePath
  const directory = selectedPath ? path.dirname(selectedPath) : app.getPath('userData')
  fs.mkdirSync(directory, { recursive: true })
  db = new Database(selectedPath ?? path.join(directory, 'rumo-daiban.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

/** Test-only hook: call before first repository operation to use a temporary database. */
export function useDatabaseForTests(databasePath: string): void {
  closeDatabase()
  testDatabasePath = databasePath
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  `)
  const applied = database.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get() as { version?: number } | undefined
  if ((applied?.version ?? 0) < 1) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS task_lists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          list_id TEXT REFERENCES task_lists(id) ON DELETE SET NULL,
          due_date TEXT,
          priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high')),
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
          sort_order INTEGER NOT NULL DEFAULT 0,
          parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
          recurrence_rule_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS recurrence_rules (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
          interval INTEGER NOT NULL DEFAULT 1,
          weekdays TEXT NOT NULL DEFAULT '[]',
          end_date TEXT,
          next_due_date TEXT
        );
        CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id, sort_order);
      `)
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString())
    })()
  }
  if ((applied?.version ?? 0) < 2) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE tasks ADD COLUMN generated_from_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_generated_from ON tasks(generated_from_task_id) WHERE generated_from_task_id IS NOT NULL;
      `)
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString())
    })()
  }
  if ((applied?.version ?? 0) < 3) {
    database.transaction(() => {
      database.exec('ALTER TABLE recurrence_rules ADD COLUMN month_day INTEGER;')
      database.exec("UPDATE recurrence_rules SET month_day = CAST(strftime('%d', next_due_date) AS INTEGER) WHERE frequency = 'monthly' AND next_due_date IS NOT NULL;")
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(3, new Date().toISOString())
    })()
  }
  if ((applied?.version ?? 0) < 4) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE task_lists ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
      `)
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(4, new Date().toISOString())
    })()
  }
  if ((applied?.version ?? 0) < 5) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE tasks ADD COLUMN due_time TEXT;
        ALTER TABLE tasks ADD COLUMN reminder_minutes_before INTEGER;
        ALTER TABLE tasks ADD COLUMN reminder_notified_at TEXT;
        ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
        CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(status, deleted_at, due_date, due_time, reminder_notified_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
      `)
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(5, new Date().toISOString())
    })()
  }
  if ((applied?.version ?? 0) < 6) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          color TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_tags (
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY(task_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS saved_filters (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          criteria_json TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id, task_id);
        CREATE INDEX IF NOT EXISTS idx_saved_filters_order ON saved_filters(sort_order, name);
      `)
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(6, new Date().toISOString())
    })()
  }
  if ((applied?.version ?? 0) < 7) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS flow_videos (
          id TEXT PRIMARY KEY,
          entry_date TEXT NOT NULL,
          title TEXT NOT NULL,
          source_url TEXT NOT NULL,
          author TEXT NOT NULL DEFAULT '',
          thought TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS flow_days (
          entry_date TEXT PRIMARY KEY,
          video_limit INTEGER NOT NULL DEFAULT 3 CHECK(video_limit BETWEEN 0 AND 10),
          did_well TEXT NOT NULL DEFAULT '',
          did_not_well TEXT NOT NULL DEFAULT '',
          reflection TEXT NOT NULL DEFAULT '',
          input_type TEXT NOT NULL DEFAULT 'none' CHECK(input_type IN ('none','video','other')),
          input_video_id TEXT REFERENCES flow_videos(id) ON DELETE SET NULL,
          input_text TEXT NOT NULL DEFAULT '',
          output_text TEXT NOT NULL DEFAULT '',
          tomorrow_expectation TEXT NOT NULL DEFAULT '',
          saved_at TEXT,
          reminder_notified_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_flow_videos_date ON flow_videos(entry_date, created_at);
        CREATE INDEX IF NOT EXISTS idx_flow_days_saved ON flow_days(saved_at, entry_date);
      `)
      database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(7, new Date().toISOString())
    })()
  }
}

export function closeDatabase(): void {
  db?.close()
  db = undefined
}
