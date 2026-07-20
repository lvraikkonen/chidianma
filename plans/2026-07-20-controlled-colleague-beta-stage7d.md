# Stage 7D：受控同事内测实施计划

Status: `Approved — Stage 7D.0 Complete, Stage 7D.1 Ready`

Date: 2026-07-20

## Goal

在已验证的 Stage 7C 架构上按两个独立工作流交付：先实现幸运餐厅大转盘，再在独立
分支验证 Mock + 高德附近餐厅候选搜索。保持现有推荐、身份、提醒、餐厅录入和生产
回滚语义，不引入数据库 migration、复杂推荐模型或第三方数据批量持久化。

## Stage 7D.0 — Baseline freeze

1. 确认 clean main、本地/远程 SHA 和远程 tag 冲突。
2. 在 Node 22.23.1 下运行 test、typecheck、build、Railway build 和发布检查。
3. 创建并推送 `v0.2.0-internal`，验证远程 peeled commit 为 `072ce70...`。
4. 记录当前生产 deployment、source commit、image digest、数据库 migration 和 storage
   版本；明确 main/production SHA 差异来自 docs-only skipped deployment。
5. 创建 `feat/lucky-restaurant-wheel`，新增当前 Stage 7D 规格、计划和 release note。
6. 运行文档链接、secret 和 diff 检查，提交 `chore: record stage 7d beta baseline`。

完成状态：步骤 1–5 已执行；提交前质量检查作为本 slice 最后门禁。

## Stage 7D.1 — Lucky restaurant wheel

### 1. Group capabilities

- 在 `packages/shared` 增加 capabilities response 和 route builder；
- 在 Server `env.ts` 增加默认关闭的全局开关和 group ID allowlist；
- 新增 group-session 认证的 capabilities route；
- Extension 每次打开/切换 group 获取 capabilities，失败默认关闭；
- wheel route 独立 gate，防止绕过 UI。

第一提交：`feat: add group scoped beta capabilities`，包含 shared/server/extension tests。

### 2. Wheel 纯算法（TDD）

在 `packages/shared/src/wheel.ts` 集中实现：

- 0–8 候选验证；
- equal 和 weighted 票数；
- 同分相等、min/max 分档、rolling-7 降档、1–3 clamp；
- 概率和累计扇区；
- 注入 `RandomSource` 的确定性选择；
- 排除后重算；
- 生产 crypto random source 的薄封装。

测试覆盖 0、1、2、8、超过 8、同分、3:1、固定随机边界、排除和无随机分布断言。

第二提交：`feat: add wheel candidate and ticket calculation`。

### 3. Server candidate API

- 将现有推荐候选构造提取为可配置 limit 的内部服务；
- 当前 refresh 继续 `limit=3`；wheel 使用 `limit=8`；
- 从当前 batch 读取 office date、天气、权重和算法版本，不创建 batch；
- 查询当前 membership rolling-7 decided restaurant IDs；
- active-only，分数降序，同分 `restaurantId` 升序；
- 入盘前硬过滤当前 membership 在当前 office date 的 `skip` 和 `avoid`；其他成员与
  历史负反馈仍仅作为现有评分信号；
- 新增 `GET /api/groups/:groupId/today-recommendations/wheel-candidates`；
- 复用 group bearer session、membership revalidation 和现有 route error 风格。

测试覆盖无 batch、0/1/2/8/>8、inactive、当前成员当日 `skip/avoid` 硬排除、其他成员
反馈不误排除、group 隔离、office timezone、flag off、确定性截断和不改变当前 3 条推荐。

第三提交：`feat: add group wheel candidate endpoint`。

### 4. Extension controller、client 和 storage

- 新增 wheel client，复用 group session retry 与上下文失效保护；
- 新增纯 controller/state machine：loading、ready、spinning、result、insufficient、error；
- 新增 `luckyWheelSession.v1`，边界为 group + office date + batch；
- group/API origin/batch 变化或断开身份时清理；
- 第一次抽签后锁定模式，最多两次抽签；
- 排除只影响本轮，不调用 feedback 或餐厅写 API；
- 「就这家」复用 participation PUT。

测试覆盖 Popup 重开、重转限制、排除、上下文切换、cached 状态禁止新抽签和接受失败。

第四提交：`feat: add reroll exclusion and accepted decision flow`。

### 5. Popup UI 和可访问性

- 在现有 popup 增加推荐/转盘切换，不修改 Manifest 或 background；
- 票数比例扇区、编号图例、概率和中奖理由保持一致；
- 业务结果先决定，再将目标扇区中心交给约 3 秒动画；
- reduced-motion 跳过长动画但复用相同结果；
- 原生按钮/单选语义、明确 label、`aria-live`、结果焦点、非颜色信息；
- 0/1 候选、网络错误、次数耗尽和餐厅状态变化都有明确文案。

Extension internal 版本提升到 `0.3.0`，稳定 ID、权限和生产 host 不变。

第五、六提交：

- `feat: add lucky restaurant wheel UI`
- `feat: support reduced motion and wheel accessibility`

### 6. Wheel 验证与 rollout

运行 package tests、full test/typecheck/build、dev/internal extension builds、Railway build、
docs/artifact/secret checks。真实 Chrome 手动验证键盘、screen reader announcement、
reduced motion、Popup 重开、概率/扇区一致和原推荐回归。

Server 先以 flag 全关部署并通过 health/ready/verifier，再只为明确 group ID 开启。
回滚首先关闭 flag；必要时恢复 Stage 7C deployment 和 Extension 0.2.0。

新增 `docs/features/lucky-restaurant-wheel.md` 并创建
`docs/manual-qa/stage-7d.md` 的 wheel QA 部分。

文档提交：`docs: document lucky restaurant wheel and beta qa`。

## Stage 7D.2 — POI reference search spike

7D.1 合入 main 后创建 `spike/poi-reference-search`，不得从未合入的 wheel feature branch
直接继续开发。

### 1. Provider contract 和 Mock

- shared 定义 `GeoPoint`、coordinate system、normalized candidate/page/error；每页包含 provider
  label、attribution 文本和可选官方链接；
- Server 定义 provider capabilities、persistence policy 和 registry；
- Mock 支持 geocode、默认 3km、500–5000m、过滤、确定性分页、取消和错误注入；
- 添加所有 provider 共用 contract suite；
- Server capabilities 区分 `poiReferenceSearch`、`poiReferenceDraft` 和需要已验证坐标系的
  `poiOfficePreset`。

提交：`feat: add poi provider contract and mock provider`。

### 2. Search UI 和 QuickAdd draft

- 新增 group-scoped geocode/search routes；
- Popup 支持 office preset、地址、半径、loading/empty/error/rate-limit/timeout/load-more；
- 候选列表显示 provider 名称和 attribution，测试不得只依赖 provider ID；
- 地址和 provider 网络请求只在显式提交时发起；候选名称/类型使用 250ms 本地防抖；
- AbortController 取消前一请求并丢弃迟到响应；
- Mock 候选只创建内存 draft；QuickAdd 增加 `address` 并沿用显式保存和 recovery；
- 取消、返回或关闭 Popup 均不写入。

提交：

- `feat: add nearby restaurant reference search`
- `feat: connect mock candidate to quick add draft`
- `test: cover explicit save and provider failure boundaries`

### 3. Gated Amap adapter

- `AMAP_WEB_SERVICE_KEY` 只从 Server env 读取并从日志/错误中 redaction；
- 按用户提供的文档调用 v3 around，固定 `types=050000`、`sortrule=distance`、
  `offset=20`、`extensions=base`、最多 3 页；
- v3 geocode 和官方 WGS84→GCJ02 convert；
- 增加 allowlisted group 的显式 office-coordinate-system 部署配置；只有配置为 WGS84
  或 GCJ02 才开放 office preset，未配置时 provider 调用次数必须为 0；
- WGS84 中心点转换一次，GCJ02 中心点不转换，测试防止二次偏移；
- 同坐标系直线距离；不保存或返回 Amap POI ID；
- 归一化 infocode 为 rate-limit/timeout/unavailable/configuration errors；
- 自动化全部 mock fetch，真实 Key 只用于少量手动 QA；
- 高德 `contract_only`：没有 approval ref 时只显示，不允许生成 QuickAdd draft；
- 生产启用前验证 Web 服务 Key 类型、出口 IP 白名单和配额。

提交：

- `spike: add gated amap web service provider`
- `feat: add amap coordinate and error normalization`
- `docs: document amap provider policy and limitations`

新增 `docs/features/poi-reference-search.md`、`docs/architecture/poi-provider.md`，并完成
`docs/manual-qa/stage-7d.md` 的 POI QA 部分；文档要求属于 Stage 7D.2 退出门。

如果后续书面确认允许最小字段持久化，再单独调整
`POI_AMAP_REFERENCE_SAVE_ENABLED` 和允许字段；本计划不预建 `RestaurantOrigin` 或坐标列。

## Stage 7D.3 — Controlled rollout

- 所有新 flags 默认关闭并按 group allowlist 开启；
- Wheel 先于 POI 扩大；Mock 先于 Amap；Amap save gate 保持关闭直到有许可引用；
- 观察 health/readiness、结构化错误、提醒投诉、身份恢复摩擦和人工接受/重转/排除反馈；
- 不新增个人行为事件表；
- 任何身份绕过、跨 group 泄漏、静默落库或 Key 泄漏均立即停止扩容并回滚；
- cohort 结束后记录是否扩大功能、provider 或正式账号的决策。

## Schema、storage 与 public interfaces

- Prisma：无 migration；
- Admin storage：继续 `lunchAdminSessionState.v2`；
- Extension：现有 `lunchState` 保持兼容；仅增加 versioned wheel session key；
- Manifest：权限种类和 host permission 不变；
- 新 public interfaces：group capabilities、wheel candidates、POI geocode/search 和 shared
  normalized provider types；
- 所有新 route 使用 active group bearer session，禁止 read-token 或 unscoped fallback。

## Final gates and handoff

```bash
fnm exec --using=22.23.1 pnpm test
fnm exec --using=22.23.1 pnpm typecheck
fnm exec --using=22.23.1 pnpm build
fnm exec --using=22.23.1 pnpm build:railway
fnm exec --using=22.23.1 pnpm check:docs
fnm exec --using=22.23.1 pnpm check:release-artifacts
fnm exec --using=22.23.1 pnpm check:release-secrets
git diff --check
```

仓库没有 lint script 或 CI workflow；交付时标记为未配置，不声称通过。每个阶段的
handoff 必须列出实际修改、migration、flags、测试/build、手动 QA、未执行项、风险、
分支/commit SHA、tag 和回滚点。
