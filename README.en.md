# rumo-Flow-todolist

A focused, offline-first desktop todo list. Rumo-Flow is built with Vue 3, TypeScript, Electron, and SQLite to keep attention on the next important action.

[简体中文](README.md) · [English](README.en.md)

## Features

- All plans, today, this week, this month, overdue, inbox, completed, and custom list views
- Quick entry, search, drag-and-drop ordering, and grouping by list, priority, or tag
- Quick Add Magic using tokens such as `#tag`, `!p1`, `@tomorrow`, and `~list-name`
- Due dates and times, reminders, none/low/medium/high priority, tags, and notes
- A Flow daily review with short-video limits, source and thought capture, guided prompts, calendar history, and seven-day trends
- Daily, weekly, and monthly recurring tasks with automatic next-instance generation
- Subtasks and a task-details drawer
- Time-limited undo after completing, restoring, or deleting tasks
- System tray, `Ctrl+Alt+Space` global quick capture, and Windows notifications
- Light/dark themes, comfortable/compact density, and keyboard-shortcut help
- Local SQLite persistence; data stays on the current device by default
- JSON backup export and restore; the current data is snapshotted before restore, and invalid imports leave existing data unchanged
- Remembered Electron window state

## Technology

- Vue 3 + TypeScript
- Electron 44
- Vite / electron-vite
- SQLite (better-sqlite3)
- Vitest + Playwright

## Development

Requirements: Node.js 22+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck       # TypeScript type checking
pnpm test            # Unit and SQLite integration tests
pnpm test:e2e        # Playwright browser tests
pnpm test:desktop    # Build and test Electron/SQLite with temporary user data
pnpm build           # Production build
pnpm package         # Build the Windows installer
```

## Installer

Windows installers are published as GitHub Releases rather than committed to the repository. The latest stable version remains `v0.8.0`; the current source version is `v0.9.0-rc.2`, a pre-release with update settings, in-list batch actions and a Flow history journal with backdated entries. Install this RC manually: the update checker only considers stable releases. A local development package has passed an authorized manual in-place installation and startup check; the real updater download/install/restart path and uninstallation remain unverified. Installers are unsigned, so Windows SmartScreen may display a warning. Download from the project Release page and verify the published SHA-256 value. See the [RC release notes](docs/releases/v0.9.0-rc.2.md) and [v0.8.0 release notes](docs/releases/v0.8.0.md) for data-format restrictions and rollback requirements.

## Data and backups

Version 0.8.0 moves tag management to its own sidebar page, video quotas to Flow input records, and reminder controls to daily reviews. Settings groups appearance, shortcuts, and backups; the Windows title bar follows the selected theme. See the [verification record](docs/EVIDENCE-preferences.md).

Application data is stored in Electron's user-data directory in a database named `rumo-daiban.sqlite`. Use “Settings → Data & Backups” inside the app to export a JSON backup; avoid copying a live SQLite file while the app is running. Before a restore, Rumo-Flow writes a snapshot to `backups/pre-import-*.json` so the previous state is retained.

The current source imports and exports only `rumo-flow-backup` v5, including saved data, execution plans, trash, action provenance and unfinished drafts. Versions 1–4 are rejected without replacing existing data. A v5 snapshot is saved before each import.

Task details, daily reviews, video edits and quick capture preserve drafts after roughly 500 ms without input. Only “draft preserved” confirms persistence. Explicit Save still commits formal data; drafts do not count as completed reviews. Navigation, window closing and normal exit wait for pending writes. Forced termination or power loss may lose input that has not reached disk.

Migration 9 creates a consistent SQLite snapshot in `backups/pre-planning-*.sqlite` before upgrading an existing database. Existing task identifiers, deadlines and drafts remain; tasks start unplanned and task drafts become v2. Rollback requires closing all application processes and restoring the pre-upgrade snapshot. Do not open the upgraded database or import v5 with an older application.

### Planning and linked actions

Execution plans use a single day, Monday-based week or calendar month independently of deadlines. Unfinished plans do not roll forward automatically. Quick Add date tokens remain deadlines; global capture creates unplanned tasks. Today separates focus tasks, other day plans, due-today notices and unfinished earlier plans.

Daily review starts with three questions and expands to six using the same draft. Saved reviews and videos can create multiple linked tasks; review actions default to tomorrow and video actions start unplanned. Search includes saved tasks, videos and reviews, excluding drafts and trash. Batch operations are atomic. Trash retains tasks for 30 days and restores only children removed with the selected parent.

Desktop tests create temporary user-data directories and exercise real Electron IPC and SQLite. Browser tests use in-memory API fixtures. Installer installation/uninstallation, operating-system notification clicks and upgrades of personal data require separate acceptance.

Browser tests start a dedicated server on port 5173 and never reuse an existing server. Set `RUMO_E2E_PORT` if that port is occupied (PowerShell: `$env:RUMO_E2E_PORT='5186'`). See the [stabilization evidence](docs/EVIDENCE-stabilization.md) for results and acceptance boundaries.

## Project structure

```text
electron/              Electron main process, IPC, window state, and SQLite layer
src/                   Vue renderer, UI, and shared types
tests/                 Vitest and Playwright tests
electron.vite.config.ts
package.json
```

## License

This project is released under the [MIT License](LICENSE).
