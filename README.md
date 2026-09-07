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
- 任务详情、心流复盘、视频思考与快捷捕获草稿自动保留，切页和重启后可恢复
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
pnpm test:desktop    # 构建后使用临时用户目录验证真实 Electron 与 SQLite
pnpm build           # 生产构建
pnpm package         # 构建 Windows 安装包
```

## 安装包

Windows 安装包在 GitHub Releases 提供，不纳入源码仓库。正式版为 `v0.6.1`，当前源码对应预发布版 `v0.7.0-rc.1`，不替代最新正式版。RC 用于试用草稿与模块化改造，实际安装、覆盖升级和卸载仍待验收。安装包未签名，Windows SmartScreen 可能显示提示；请从项目 Release 页面下载并核对发布页提供的 SHA-256 校验值。更新内容和升级注意事项见 [RC 发布说明](docs/releases/v0.7.0-rc.1.md)。

## 数据与备份

应用数据保存在 Electron 的用户数据目录中，数据库文件名为 `rumo-daiban.sqlite`。推荐使用应用内“设置与数据”导出 JSON 备份，不要直接复制正在运行中的 SQLite 文件。恢复备份前会自动生成 `backups/pre-import-*.json`，用于在导入前保留当前快照。

当前源码导出格式为 `rumo-flow-backup` v4，包含正式数据和未完成草稿；恢复功能兼容 v1、v2、v3、v4 以及历史的 `rumo-daiban-backup` v1 文件。恢复会替换当前数据与草稿，恢复没有草稿的旧版备份后草稿为空。导入前的自动快照也包含草稿。旧版应用不支持读取 v4 备份。

草稿在停止输入约 500 毫秒后自动保留，界面显示“草稿已保留”才表示已经落盘。正式任务修改、视频思考和复盘仍需手动保存；草稿不计入已完成复盘。正常切页、关闭窗口和退出会等待草稿写入，失败时可以重试或明确放弃。强制结束或断电无法保证最后尚未落盘的输入。

本轮源码新增数据库迁移 8，仅增加草稿表与关联清理规则。升级前请使用旧版应用导出备份并正常退出；需要回退时使用旧版备份恢复，不要用旧应用直接导入 v4。安装包版本与当前工作区代码应分开核对，本轮源码更改不会自动更新既有 Release。

## 项目结构

```text
electron/              Electron 主进程、IPC、窗口状态和 SQLite 数据层
electron/database/     按任务、组织、心流、设置、草稿拆分；备份服务统一处理事务
electron/ipc/          按业务域注册 IPC，统一处理写入后通知
src/                   Vue 渲染进程、页面和共享类型
src/features/          任务工作区、详情、排序、偏好与心流状态
src/composables/        草稿协调与共享界面逻辑
tests/                 Vitest 与 Playwright 测试
electron.vite.config.ts
package.json
```

桌面测试只使用任务创建的临时 `userData`，不会访问个人数据库。浏览器测试注入内存接口，不能替代真实桌面测试。安装包安装、卸载、系统通知点击和个人数据升级应另行验收。

浏览器测试默认使用独立的 5173 端口，不复用已有服务；占用时可设置 `RUMO_E2E_PORT`，例如 PowerShell 中执行 `$env:RUMO_E2E_PORT='5186'`。本轮结果和未验收边界见 [稳定化验证记录](docs/EVIDENCE-stabilization.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。
