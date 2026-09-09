import type Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function migrateComposers(database: Database.Database, applied: number): void {
  if (applied >= 10) return
  if (applied >= 9) {
    const directory = path.join(path.dirname(database.name), 'backups')
    fs.mkdirSync(directory, { recursive: true })
    database.prepare('VACUUM INTO ?').run(path.join(directory, `pre-editors-${Date.now()}-${crypto.randomUUID()}.sqlite`))
  }
  database.transaction(() => {
    const triggers = database.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%editor_drafts%'").all() as { name: string; sql: string }[]
    for (const trigger of triggers) database.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`)
    database.exec(`
      CREATE TABLE editor_drafts_new (
        kind TEXT NOT NULL CHECK(kind IN ('task','review','video','capture','quickTask','subtask','videoLink')),
        entity_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 2,
        revision INTEGER NOT NULL DEFAULT 0, base_updated_at TEXT,
        payload TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(kind, entity_key)
      );
      INSERT INTO editor_drafts_new SELECT * FROM editor_drafts;
      DROP TABLE editor_drafts;
      ALTER TABLE editor_drafts_new RENAME TO editor_drafts;
    `)
    for (const trigger of triggers) database.exec(trigger.sql)
    database.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES (10,?)').run(new Date().toISOString())
  })()
}
