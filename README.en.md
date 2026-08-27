# rumo-Flow-todolist

A focused, offline-first desktop todo list. Rumo-Flow is built with Vue 3, TypeScript, Electron, and SQLite to keep attention on the next important action.

[简体中文](README.md) · [English](README.en.md)

## Features

- Today, upcoming, this week, completed, and custom list views
- Quick task entry, task search, and drag-and-drop ordering
- Due dates, none/low/medium/high priority, and notes
- Daily, weekly, and monthly recurring tasks with automatic next-instance generation
- Subtasks and a task-details drawer
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

The Windows installer is published as a GitHub Release instead of being committed to the source repository. The current `v0.2.0` installer is unsigned, so Windows SmartScreen may display a warning. Download it from the project Release page and verify the SHA-256 value published with the release.

## Data and backups

Application data is stored in Electron's user-data directory in a database named `rumo-daiban.sqlite`. Use “Settings & Data” inside the app to export a JSON backup; avoid copying a live SQLite file while the app is running. Before a restore, Rumo-Flow writes a snapshot to `backups/pre-import-*.json` so the previous state is retained.

The current backup format is `rumo-flow-backup` v1. Historical `rumo-daiban-backup` v1 files are also accepted.

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
