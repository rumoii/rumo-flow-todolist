# 稳定化与模块化验证记录

验证日期：2026-09-07。以下稳定化验证针对 main 分支基线 1a21c0b 之上的改造，当时版本号为 0.6.1，尚未提交、推送、安装或发布。该状态描述验证当时的快照，不代表后续发布状态。0.7.0-rc.1 候选包的独立验证见文末。

## 环境与数据边界

- Windows，Node 24.16.0；通过进程 PATH 选择运行时，COREPACK_ENABLE_AUTO_PIN=0。
- SQLite 测试仅使用临时目录。真实 Electron 测试通过 --user-data-dir 指定独立目录，包含正常重启和 app.exit(0) 强制退出场景。
- 没有读取或迁移个人安装实例的数据库，没有操作线上服务。
- 浏览器 E2E 注入内存接口；不能证明 SQLite、IPC、系统快捷键或跨进程持久化。

## 最终命令与结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | pnpm typecheck | 通过，分别检查 web 与 node 项目 |
| 单元和 SQLite | pnpm test | 14 个文件、77 个用例通过 |
| 浏览器 | RUMO_E2E_PORT=5186 下执行 pnpm test:e2e | 18 个用例通过，25.3 秒 |
| 构建与真实桌面 | pnpm test:desktop | 生产构建成功，2 个用例通过，10.4 秒 |
| Windows 包 | pnpm exec electron-builder --win nsis --config.directories.output=test-results/package --config.artifactName=rumo-flow-stabilization-test.exe | NSIS 与 win-unpacked 构建成功 |
| 打包程序 | 设置 RUMO_TEST_EXECUTABLE 为 test-results/package/win-unpacked/Rumo-Flow.exe，再执行 pnpm exec playwright test --config tests/electron.config.ts | 2 个用例通过，10.7 秒 |
| 补丁检查 | git diff --check | 通过；仅有工作区换行转换提示 |

PowerShell 环境设置示例：

```powershell
$env:COREPACK_ENABLE_AUTO_PIN='0'
$env:PATH='D:\nvm\v24.16.0;'+$env:PATH
$env:RUMO_E2E_PORT='5186'
pnpm test:e2e
$env:RUMO_TEST_EXECUTABLE=(Resolve-Path 'test-results/package/win-unpacked/Rumo-Flow.exe').Path
pnpm exec playwright test --config tests/electron.config.ts
```

默认浏览器端口仍为 5173，可通过 RUMO_E2E_PORT 指定其他端口。配置启用 strictPort 且不复用现有服务，避免误测其他项目。一次最终流水线因 5173 被其他项目占用而超时，未运行后续步骤；改用独立端口后，浏览器、桌面、打包和打包程序测试已重新全部完成。没有停止占用端口的其他项目。

## 关键行为证据

- tests/drafts.test.ts：独立草稿、正式提交与清理同事务、修订号和数据代际冲突、对象删除、引用清理、v4 往返与事务失败回滚、版本 7 测试库升级到迁移 8。
- tests/draft-coordinator.test.ts：500 毫秒防抖、串行写入、提交后不复活、失败保留和重试、准备备份时暂停、恢复后失效、未修改复盘不自动变成正式数据。
- tests/window-barrier.test.ts：核对确认消息发送方、超时中止、拒绝重叠操作、成功及失败后恢复编辑。
- tests/desktop.test.ts：数据操作准备期间不打开主窗口、心流或捕获窗，避免新窗口漏过草稿确认。最终复核还在退出入口拒绝与正在进行的屏障重叠；补充后重新通过类型、全部 Vitest、真实桌面及打包程序检查。渲染源码未变化，浏览器证据仍有效。
- tests/global-create.test.ts：心流页触发全局新建进入捕获入口，不切换主页面。
- tests/e2e/app.spec.ts：原有任务、标签、排序、筛选、主题与布局回归；新增详情键盘打开/焦点恢复和心流切页输入保留。
- tests/electron/drafts.spec.ts：真实 preload、IPC 与 SQLite 上验证复盘导航/重启/v4 导出恢复/手动提交，以及任务备注后台刷新、视频和捕获草稿强制退出恢复、保存后清理、重复标签去重。同一组测试在构建源码和打包 EXE 上各通过一次。

故障注入用例断言的是拒绝过期写入、保留失败草稿及回滚正式数据，不把报错视为成功路径。未保存输入只有收到“草稿已保留”才保证跨强制退出恢复。

## Playwright MCP 可视复核

使用独立测试页 http://127.0.0.1:5175/，1440×900，保留原有 5174 页不操作。稳定源码加载到新标签后复核：

- 详情显式保存后重新打开内容一致；Enter 打开详情后焦点位于抽屉内。
- 心流复盘输入离开页面再返回仍保留，无水平溢出。
- 控制台错误 0、警告 0；保存的 75 条网络记录没有失败或 HTTP 4xx/5xx。
- 截图为 test-results/stabilization-detail-final.png、test-results/stabilization-flow-final.png，网络记录为 test-results/stabilization-network.txt；真实桌面截图为 test-results/electron-flow.png。

该浏览器 fixture 没有 drafts API，因此详情未保存输入跨重新打开的持久化不在此层验证。一次手工断言误将 fixture 当作支持草稿的后端，随后明确限定为显式保存验证；持久化结论来自真实 Electron 用例。编辑期间旧标签的 HMR 临时错误不混入最终新标签控制台结果。

## 本地测试产物

- 安装包：test-results/package/rumo-flow-stabilization-test.exe
- 大小：121515383 字节。
- SHA-256：CBED4DAB864BB644C57E02FB2808560A3A2EB2ECBD83358CB1C6543898926E4E
- Authenticode：NotSigned。构建日志中的 signing 步骤不代表实际获得可信签名。
- 浏览器报告：test-results/playwright-report；桌面报告：test-results/electron-report（最后一次打包程序运行覆盖同目录报告）。

上述文件均为忽略目录内的本地测试产物，不是正式 Release。

## 尚未覆盖

未执行 NSIS 实际安装、覆盖升级、卸载、个人数据库升级、真实系统通知点击、托盘与全局快捷键的人工操作验收、断电恢复或长时间运行观察。迁移测试库与打包 EXE 验证不等同于这些验收。

新应用可恢复旧格式；旧应用不能读取 v4 备份。回退应保留升级前旧格式备份，不承诺旧程序直接操作升级后的数据库。

## v0.7.0-rc.1 发布候选包复验

2026-09-07 将源码版本调整为 0.7.0-rc.1 后重新验证，仍使用 Node 24.16.0 与独立测试数据目录；未执行个人环境安装或升级。

| 检查 | 本次结果 |
| --- | --- |
| pnpm typecheck | 通过 |
| pnpm test | 14 个文件、77 个用例通过 |
| RUMO_E2E_PORT=5186 下 pnpm test:e2e | 最终 18/18 通过，28.3 秒 |
| pnpm test:desktop | 构建成功，真实 Electron 用例 2/2 通过，10.5 秒 |
| pnpm exec electron-builder --win nsis --config.directories.output=test-results/rc-0.7.0-rc.1 | Windows x64 NSIS 构建成功 |
| 指定 RC win-unpacked/Rumo-Flow.exe 后执行 pnpm exec playwright test --config tests/electron.config.ts | 打包程序用例 2/2 通过，10.3 秒 |

复验最初出现清单拖拽排序失败；单独连续三次通过后，全套再次出现拖拽失败以及筛选下拉选项在动画期间失稳、脱离 DOM 的超时。未跳过用例或降低断言：测试改为等待侧栏过渡完成；清单拖拽使用分步鼠标移动并在释放前断言目标收到 dragover。两项用例各连续三次通过后，全套 18 项通过。改动限于测试操作同步，不宣称修复了已证实的产品缺陷；先前失败不计为通过。

候选产物：test-results/rc-0.7.0-rc.1/rumo-flow-todolist-0.7.0-rc.1-x64.exe。

- 大小：121515533 字节。
- SHA-256：28397d29b17273f936e9bb2a31ea3375b41d2153f9064bf284e35d7bc62dfe80。
- Authenticode：NotSigned。
- 配套 blockmap 为 gzip 压缩的版本 2 JSON，5807 个块；数组数量及文件边界检查通过。
- 包内 package.json 版本为 0.7.0-rc.1；app.asar 中全部 6 个 out 文件与本次构建输出逐字节相同，未发现 test-results、.env 或 .git 目录。
- 发布资产仅包含安装包、配套 .blockmap 和 .sha256；构建输出、测试数据及本地辅助脚本不纳入源码提交。

本次发布定位为 Prerelease，不替换最新正式版；前述安装、升级、卸载及系统交互未验收边界不变。
