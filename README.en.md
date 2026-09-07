# rumo-Flow-todolist

A focused, offline-first desktop todo list. Rumo-Flow is built with Vue 3, TypeScript, Electron, and SQLite to keep attention on the next important action.

[简体中文](README.md) · [English](README.en.md)

## Features

- Inbox, today, upcoming, this week, completed, and custom list views
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

Windows installers are published as GitHub Releases rather than committed to the repository. The stable release is `v0.6.1`; this source targets the `v0.7.0-rc.1` prerelease, which does not replace the latest stable release. The RC is for trying draft persistence and modularization; installation, in-place upgrade and uninstallation still require acceptance. Installers are unsigned, so Windows SmartScreen may display a warning. Download from the project Release page and verify the published SHA-256 value. See the [RC release notes](docs/releases/v0.7.0-rc.1.md) for changes and upgrade precautions.

## Data and backups

Application data is stored in Electron's user-data directory in a database named `rumo-daiban.sqlite`. Use “Settings & Data” inside the app to export a JSON backup; avoid copying a live SQLite file while the app is running. Before a restore, Rumo-Flow writes a snapshot to `backups/pre-import-*.json` so the previous state is retained.

The current source exports `rumo-flow-backup` v4, including saved data and unfinished drafts. Restore accepts v1 through v4 and historical `rumo-daiban-backup` v1 files. Restoring replaces both data and drafts; an older backup without drafts restores an empty draft set. Pre-import snapshots include drafts. Older applications cannot import v4 backups.

Task details, daily reviews, video edits and quick capture preserve drafts after roughly 500 ms without input. Only “draft preserved” confirms persistence. Explicit Save still commits formal data; drafts do not count as completed reviews. Navigation, window closing and normal exit wait for pending writes. Forced termination or power loss may lose input that has not reached disk.

Migration 8 adds draft storage and reference cleanup without changing existing task identifiers. Before upgrading, export a backup using the old version and close it normally. For rollback, use that older backup rather than importing v4 into an older application. Workspace changes do not update an existing Release automatically.

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
