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
}

export function closeDatabase(): void {
  db?.close()
  db = undefined
}
