# Stage 7C：内部测试版品牌、视觉与体验质量收口

Status: `Implementation Complete — Final Candidate QA Pending`

Date: 2026-07-16

## Goal

在不扩大产品功能、身份模型或后端 API 的前提下，交付 production-ready 的
`0.2.0` Chrome 内部测试版：

- 使用“暖碗热气、克制友好”的正式品牌；
- 深度打磨 Popup、设置页、详情页和通知图标，Admin 只同步品牌；
- 修复 Modal 键盘焦点和 QuickAdd 丢响应重复写入风险；
- 通过固定生产服务、稳定 Extension ID、版本化 ZIP 和回滚说明进行受控
  unpacked 分发；
- 将 Chrome Web Store、宣传素材和大版本依赖升级延后到首轮同事内测之后。

## Source-of-truth decisions

- 正式名称为「中午吃点啥」，界面保持中文。
- 品牌母题为暖橙圆角底、米白饭碗和两道热气，不使用文字、筷子或表情。
- Extension 使用统一色板：
  `#E86F3D`、`#8C3213`、`#FDE6D7`、`#F6F0E7`、`#FFFDF8`、
  `#2F2923`、`#786F66`、`#E6D9CA`。
- Internal build 固定
  `https://lunchserver-production.up.railway.app`，隐藏 API 地址编辑，只声明准确
  host permission。
- Dev build 保留 localhost、自定义 API 地址和独立开发版名称。
- Internal build 包含公开 manifest key 以稳定 Extension ID；私钥不进入仓库。
- 公共 REST API、共享 wire contract、Prisma schema 和 Chrome 权限种类不变。

## Implementation

### 1. Brand and visual system

- 创建唯一 SVG 母版，并用固定版本的 SVG renderer 生成
  `16/32/48/128px` PNG。
- 16px 使用同一几何的光学校正版；所有图标至少保留 12.5% 安全边距。
- Extension 共享 token、按钮、品牌、图标和焦点样式；页面 CSS 只保留布局与状态。
- Popup 保持 390px 和现有信息架构，统一 header、卡片、状态和 QuickAdd。
- Options 使用「Chrome 扩展设置」，Detail 使用同一品牌头和正式设置按钮。
- Admin 新增 `BrandLockup`，只同步 Logo、名称、色板、焦点环和基础图标。
- 删除 `♨`、独立「餐」字、系统字体齿轮/关闭符号以及内部 Stage 文案。

### 2. Reliability

- Admin Modal 动态查询可聚焦控件，实现 Tab/Shift+Tab 循环、外部焦点回收、空弹窗
  fallback、Escape/pending 和关闭后焦点恢复。
- Admin 与 Extension QuickAdd 在餐厅/推荐 POST 报错后先读取当前餐厅库：
  - 通过当前成员、规范化字段和提交前 ID 集合确认 lost response；
  - `confirmed-saved` 直接完成；
  - `confirmed-missing` 才开放安全重试；
  - 读取失败或多候选进入 `uncertain`，禁止写重试；
  - 每次重试报错后重新核对；
  - 小组或身份上下文变化废弃恢复状态。

### 3. Build and distribution

- `build:dev`：开发版名称、localhost + 准确生产 host、可编辑 API、无 internal key。
- `build:internal` 与默认 `build`：内部测试名称、`0.2.0`、固定生产 API、准确 host、
  只读版本/服务信息、稳定 key。
- 输出：

```text
artifacts/extension/
  chidianma-extension-0.2.0-internal.zip
  chidianma-extension-0.2.0-internal.sha256
  chidianma-extension-0.2.0-internal.release.json
```

- ZIP 根目录直接包含 manifest；metadata 记录 commit、profile、Extension ID、权限、
  host、文件数、SHA-256 和构建时间，不记录秘密。
- 打包要求干净且已提交的 worktree；候选制品默认保持 ignored。
- 安装文档覆盖固定目录、Load unpacked、升级、Reload、回滚和首次使用身份连接码。

## Tests and exit gates

- 图标尺寸、透明通道、安全边距、非占位像素和 manifest 引用。
- Extension/Admin 品牌 markup 禁止旧 glyph 标记。
- dev/internal profile 的名称、版本、key、host、默认 API 和高级设置矩阵。
- QuickAdd 成功、lost response、confirmed missing、uncertain、其他成员、多候选和上下文
  切换。
- Modal 正反向循环、外部/空焦点、disabled/hidden、Escape/pending 和恢复。
- Release gate 校验 ZIP 结构、hash、版本、准确 host、稳定 ID、最小权限和秘密/legacy
  residue。

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @lunch/extension build:dev
pnpm build:railway
pnpm check:docs
pnpm check:release-artifacts
pnpm check:release-secrets
pnpm check:stage7c-release
git diff --check
```

没有 Server/Prisma 行为变化，因此不要求重新执行 migration rehearsal。

真实 Chrome QA 覆盖浅色/深色工具栏图标、Popup 全状态、Options、Detail、通知、
390px Admin、Modal 键盘操作、两个目录的稳定 Extension ID、覆盖升级和 storage
保留。通过 QA 和明确批准后才启动 Stage 7D 同事 cohort。
