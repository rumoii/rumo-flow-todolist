# rumo-Flow-todolist

A focused, offline-first desktop todo list. Rumo-Flow is built with Vue 3, TypeScript, Electron, and SQLite to keep attention on the next important action.

[简体中文](README.md) · [English](README.en.md)

## Features

- Inbox, today, upcoming, this week, completed, and custom list views
- Quick entry, search, drag-and-drop ordering, and grouping by list, priority, or tag
- Quick Add Magic using tokens such as `#tag`, `!p1`, `@tomorrow`, and `~list-name`
- Due dates and times, reminders, none/low/medium/high priority, tags, and notes
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
pnpm build           # Production build
pnpm package         # Build the Windows installer
```

## Installer

The Windows installer is published as a GitHub Release instead of being committed to the source repository. The current `v0.5.3` installer is unsigned, so Windows SmartScreen may display a warning. Download it from the project Release page and verify the SHA-256 value published with the release.

## Data and backups

Application data is stored in Electron's user-data directory in a database named `rumo-daiban.sqlite`. Use “Settings & Data” inside the app to export a JSON backup; avoid copying a live SQLite file while the app is running. Before a restore, Rumo-Flow writes a snapshot to `backups/pre-import-*.json` so the previous state is retained.

New exports use `rumo-flow-backup` v2 and include tags and saved filters. Restore accepts both v1 and v2 backups, including historical `rumo-daiban-backup` v1 files. Existing databases are upgraded through compatible migrations when the app starts.

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
