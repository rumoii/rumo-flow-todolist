# rumo-Flow-todolist

简洁、专注、离线优先的桌面待办清单应用。Rumo-Flow 使用 Vue 3、TypeScript、Electron 和 SQLite 构建，帮助你把注意力放在下一件重要的事上。

[简体中文](README.md) · [English](README.en.md)

## 功能

- 收集箱、今天、即将到期、本周、已完成和自定义清单视图
- 快速添加、任务搜索、拖拽排序，以及按清单、优先级或标签分组
- Quick Add Magic：通过 `#标签`、`!p1`、`@明天`、`~清单名` 等标记快速补充任务属性
- 截止日期与时间、提醒、无/低/中/高优先级、标签和备注
- “心流”每日复盘：短视频额度、来源与思考记录、六问复盘、月历和七日趋势
- 每天、每周、每月重复任务，并自动生成下一项
- 子任务与任务详情抽屉
- 完成、恢复和删除任务后的限时撤销
- 系统托盘、`Ctrl+Alt+Space` 全局快捷捕获和 Windows 本地通知
- 浅色/深色主题、舒适/紧凑密度和快捷键帮助
- SQLite 本地持久化，数据默认只保存在当前设备
- JSON 备份导出与恢复；恢复前自动保存当前数据，导入失败时保持现有数据不变
- Electron 桌面窗口状态记忆

## 技术栈

- Vue 3 + TypeScript
- Electron 44
- Vite / electron-vite
- SQLite（better-sqlite3）
- Vitest + Playwright

## 开发

环境要求：Node.js 22+、pnpm 9+。

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm typecheck       # TypeScript 类型检查
pnpm test            # 单元与 SQLite 集成测试
pnpm test:e2e        # Playwright 浏览器测试
pnpm build           # 生产构建
pnpm package         # 构建 Windows 安装包
```

## 安装包

Windows 安装包在 GitHub Releases 提供，不纳入源码仓库。当前 `v0.5.3` 安装包为未签名版本，Windows SmartScreen 可能显示提示；请从项目 Release 页面下载并核对发布页提供的 SHA-256 校验值。

## 数据与备份

应用数据保存在 Electron 的用户数据目录中，数据库文件名为 `rumo-daiban.sqlite`。推荐使用应用内“设置与数据”导出 JSON 备份，不要直接复制正在运行中的 SQLite 文件。恢复备份前会自动生成 `backups/pre-import-*.json`，用于在导入前保留当前快照。

当前导出格式为 `rumo-flow-backup` v3，包含标签、保存的筛选、心流复盘和视频思考；恢复功能同时兼容 v1、v2、v3 以及历史的 `rumo-daiban-backup` v1 文件。旧数据库会在应用启动时自动执行兼容迁移。

## 项目结构

```text
electron/              Electron 主进程、IPC、窗口状态和 SQLite 数据层
src/                   Vue 渲染进程、页面和共享类型
tests/                 Vitest 与 Playwright 测试
electron.vite.config.ts
package.json
```

## 许可证

本项目采用 [MIT License](LICENSE)。
