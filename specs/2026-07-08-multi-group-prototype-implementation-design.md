# 多干饭小组与原型真实化设计

Status: `Approved for Planning`

Date: 2026-07-08

## 概述

本设计把 `demo-design/` 中的 Open Designer 原型升级为下一阶段产品规格。上一阶段优先跑通了单团队工程竖切：Chrome MV3 插件、Fastify 后端、PostgreSQL/Prisma、真实天气、推荐生成、反馈和轻量管理后台。本阶段目标是在保留已跑通闭环的基础上，把产品升级为支持多个“干饭小组”的真实数据产品，并让原型中的插件端与管理后台页面全部接入真实 API。

这不是餐饮发现平台、外卖平台或正式账号系统。产品目标仍然是帮助小团队更快决定午饭，并把小组真实推荐沉淀下来。变化是：一个用户可能属于多个干饭小组，例如固定团队、临时约饭组、楼下约饭组；每个小组有自己的餐厅库、成员、推荐、参与状态、历史复盘和设置。

## 已确认的产品决策

- 支持多个干饭小组。
- 一个轻量身份可以加入多个小组，并在后台和插件里切换当前小组。
- 不做邮箱、密码、OAuth 或正式账号系统。
- 用户用姓名建立轻量身份，使用邀请码加入小组。
- 任何人可以自助创建小组，创建者自动成为该小组管理员。
- 每个小组有独立餐厅库、推荐、反馈、成员、设置、评分权重和历史批次。
- 后续预留“复制/分享餐厅到另一个小组”的扩展点，但本阶段不做全局餐厅平台。
- 每天每个成员可以标记参与状态：参与、不吃、已决定。
- 所有成员可以新增餐厅、补充推荐、反馈、标记参与状态。
- 管理员可以管理小组设置、评分权重、成员角色和成员状态。
- Open Designer 原型中的 extension 和 admin 页面要成为真实产品页面，而不是静态演示页。

## 非目标

本阶段不做以下能力：

- 邮箱注册、密码登录、OAuth、找回密码或正式账号系统。
- 全局餐厅库、跨小组餐厅去重或公开分享广场。
- 外卖、支付、地图导航、排队状态或第三方餐饮平台集成。
- 复杂权限体系、企业组织架构或多级审批。
- 机器学习推荐模型。
- 面向公开 SaaS 的计费、租户管理、审计后台。
- 自动弹窗或强打扰式参与询问。

## 实施节奏

规格描述完整目标，但实现计划应按纵切推进：

1. 多小组地基：轻量身份、小组、成员关系、角色、session、当前小组切换。
2. 核心午饭闭环：小组餐厅库、今日推荐、参与状态、反馈、决定、缓存兜底。
3. 原型页面真实化：`popup`、`detail`、`settings`、admin 登录/今日推荐/餐厅库/dashboard/设置全部接真实 API。
4. 复盘与配置：历史批次、dashboard 统计、成员贡献、评分权重配置。
5. 部署硬化：server 托管 admin production build，完善迁移、种子、回归检查和手动 smoke test。

## 系统架构

仓库结构保持不变：

- `apps/extension/`：Chrome Manifest V3 插件，负责提醒、当前小组推荐查看、参与/决定/反馈、缓存兜底和插件设置。
- `apps/admin/`：React + Vite 管理后台，负责建组/加入小组、餐厅库维护、今日推荐管理、历史复盘、成员与设置。
- `apps/server/`：Fastify API，负责认证、权限、小组隔离、推荐算法、天气、统计聚合和 Prisma 数据访问。
- `packages/shared/`：共享 API contract、类型、评分纯函数和 schema。

server 从单团队 API 升级为多小组租户边界。所有会污染数据的资源必须带 `groupId`，包括餐厅、推荐、反馈、每日批次、参与状态、设置、权重、成员关系和天气快照。

## 数据模型

### `identities`

轻量身份，不是正式账号。

- `id`
- `display_name`
- `created_at`
- `last_seen_at`

一个浏览器可保存当前 identity 和 session。换设备时用户重新用姓名和邀请码加入小组。

### `lunch_groups`

干饭小组。

- `id`
- `name`
- `subtitle`
- `invite_code_hash`
- `created_by_identity_id`
- `office_timezone`
- `office_city`
- `created_at`
- `updated_at`

邀请码只在创建或重置时明文展示一次，数据库只保存哈希。

### `group_memberships`

identity 与 group 的关系。

- `id`
- `group_id`
- `identity_id`
- `role`: `admin` 或 `member`
- `status`: `active` 或 `removed`
- `joined_at`
- `removed_at`

一个 identity 可以加入多个 group。session token 内应包含 `identityId`、`groupId`、`membershipId`、`role` 和过期时间。

### `group_settings`

小组设置。

- `group_id`
- `reminder_time`
- `weekday_reminder_enabled`
- `second_reminder_enabled`
- `notification_title`
- `notification_group_label`
- `created_at`
- `updated_at`

第一版继续使用温和提醒，不增加强制参与询问。

### `scoring_weights`

小组级评分权重。

- `group_id`
- `weekday_match`
- `weather_match`
- `distance`
- `teammate_recommendation`
- `recent_duplicate_penalty`
- `negative_feedback_penalty`
- `created_at`
- `updated_at`

权重调整只影响之后生成的新批次，旧批次保留当时的分数和拆解。

### `restaurants`

餐厅从单团队表升级为小组隔离。

- `group_id`
- `name`
- `area`
- `address`
- `distance_minutes`
- `cuisine`
- `price_band`
- `average_price_cents`
- `supports_dine_in`
- `supports_takeout`
- `tags`
- `status`: `active`、`paused`、`blocked`
- `created_by_membership_id`
- `created_at`
- `updated_at`

不同小组允许有同名餐厅。后续分享/复制餐厅时，可以从一组复制为另一组的新餐厅记录。

### `recommendations`

同事对餐厅的推荐。

- `group_id`
- `restaurant_id`
- `membership_id`
- `dish`
- `reason`
- `weather_tags`
- `weekday_tags`
- `mood_tags`
- `created_at`
- `updated_at`

推荐评分仍以 `restaurant + recommendation` 为候选粒度，再按餐厅去重。

### `daily_participation`

每天每个成员在某小组的午饭状态。

- `group_id`
- `office_date`
- `membership_id`
- `status`: `undecided`、`joining`、`away`、`decided`
- `restaurant_id`
- `recommendation_id`
- `decided_at`
- `updated_at`

只有 `joining` 和 `decided` 计入“今日参与人数”。`away` 不计入分母。`undecided` 表示尚未表态。

### `daily_recommendations`

每天每个小组的推荐批次。

- `group_id`
- `office_date`
- `batch_id`
- `restaurant_id`
- `recommendation_id`
- `score`
- `score_breakdown`
- `reason`
- `is_current`
- `created_at`

同一 `groupId + officeDate` 默认幂等返回当前批次；`forceRefresh=true` 创建新批次并把旧批次标记为非当前。

### `feedback`

成员反馈。

- `group_id`
- `office_date`
- `restaurant_id`
- `recommendation_id`
- `membership_id`
- `type`: `want`、`skip`、`ate`、`blocked`
- `created_at`

反馈影响当前小组之后的推荐，不跨组传播。

### `weather_snapshots`

天气快照按小组和日期缓存。

- `group_id`
- `office_date`
- `city`
- `temperature_c`
- `condition`
- `precipitation_probability`
- `wind_level`
- `summary`
- `raw_payload`
- `created_at`

本阶段可以多个小组配置同一城市，但模型需要支持不同小组后续使用不同办公室城市。

## 认证与权限

### 轻量身份

用户通过姓名创建或复用本地 identity。identity 只用于标记“谁推荐/谁决定/谁反馈”，不承担正式账号安全承诺。

### 建组与加入

- 创建小组时，服务端创建 group、settings、weights、admin membership，并返回 session token 和邀请码。
- 加入小组时，用户输入邀请码和姓名。若本地已有 identity，复用 identity；否则创建新 identity。加入成功后创建或恢复 membership，并返回 session token。
- 当前小组切换时，客户端切换 active group，并使用对应 session 访问该小组数据。

### 权限规则

- active member 可以读取小组数据、新增餐厅、新增推荐、反馈、标记参与状态、决定今日午饭、请求新推荐批次。
- admin 可以修改小组设置、评分权重、成员角色、移除或恢复成员、管理餐厅状态。
- removed member 保留历史贡献，但不能继续写入小组数据。
- 前端可以隐藏无权限控件，但服务端必须始终校验 membership 和 role。
- `EXTENSION_READ_TOKEN` 仍是轻量公开读取 guard，不是强安全机制；成员写操作优先使用 session token。

## API 设计

新 UI 应使用多小组 API。路径可以采用 `/api/groups/:groupId/...`，服务端必须校验当前 session 是否拥有该 group 的 active membership。

核心 API：

- `POST /api/identities`
- `POST /api/groups`
- `POST /api/groups/join`
- `GET /api/groups`
- `POST /api/groups/:groupId/session`
- `GET /api/groups/:groupId/today-recommendations`
- `GET /api/groups/:groupId/today-recommendations?forceRefresh=true`
- `GET /api/groups/:groupId/restaurants`
- `POST /api/groups/:groupId/restaurants`
- `PATCH /api/groups/:groupId/restaurants/:restaurantId`
- `POST /api/groups/:groupId/recommendations`
- `GET /api/groups/:groupId/participation/today`
- `PUT /api/groups/:groupId/participation/today`
- `POST /api/groups/:groupId/feedback`
- `GET /api/groups/:groupId/dashboard`
- `GET /api/groups/:groupId/settings`
- `PATCH /api/groups/:groupId/settings`
- `GET /api/groups/:groupId/members`
- `PATCH /api/groups/:groupId/members/:membershipId`

`packages/shared` must define request/response contracts for these APIs before UI code consumes them.

## Chrome 插件体验

插件端保持“轻、快、不打扰”。

### Popup

Popup 展示当前小组、日期、天气、今日参与/已决定人数、2-3 个推荐卡片和底部操作。

推荐卡展示：

- 餐厅名
- 推荐菜
- 距离或用餐方式
- 人均或价格区间
- 标签
- 推荐理由
- 推荐人摘要
- 评分拆解摘要

卡片点击进入详情态。详情态展示更完整的推荐理由、同事推荐语、评分拆解和反馈按钮。

### 参与与决定

Popup 提供“今天参与 / 今天不吃”的状态切换。点击“就决定是你了”时，写入 `daily_participation.status=decided`，并记录餐厅和推荐。

今日进度显示为：

```text
已决定 2 / 今日参与 4 人
```

### 反馈

反馈按钮保留：

- 想吃
- 不想吃
- 已吃过
- 避雷

反馈写入当前小组，不跨小组生效。

### 设置与缓存

设置页增加当前小组选择器。用户可以在已加入的小组之间切换。API 地址、提醒时间、工作日提醒、当前小组和最近推荐缓存继续保存在 `chrome.storage`。

离线或后端不可用时，popup 展示当前小组最近一次成功推荐缓存，并清楚标记“缓存”。

## Admin 管理后台体验

Admin 从单页表单升级为原型中的多页工作台。

### 登录与小组入口

入口页支持：

- 创建新小组。
- 用邀请码加入小组。
- 查看已加入小组。
- 切换当前小组。

小组切换是顶层能力，切换后所有页面刷新为当前小组数据。

### 今日推荐

今日推荐页展示：

- 天气快照。
- 推荐策略。
- 当前批次号和生成时间。
- 推荐结果列表。
- 每个结果的总分、分数拆解和中文理由。
- 今日参与、已决定、不参与成员。
- 重新生成今日推荐。

手动重新生成会创建新批次，旧批次保留。

### 餐厅库

餐厅库页展示当前小组餐厅，支持：

- 搜索。
- 菜系筛选。
- 状态筛选。
- 新增餐厅。
- 编辑餐厅。
- 补充推荐。
- 暂停、恢复、避雷。
- 空状态引导添加 5-10 家常去餐厅。

成员可以贡献餐厅和推荐。管理员负责餐厅状态治理。

### 推荐记录与 Dashboard

Dashboard 展示当前小组真实聚合数据：

- 推荐批次记录。
- 推了什么 vs 最后吃了什么。
- 今日已决定、今日参与、未决定/不参与人数。
- 本周记录顿数。
- 团队人均，数据不足时明确显示数据不足。
- 餐厅库 active/paused/blocked 数量。
- 本周热餐厅。
- 类别分布。
- 最近新增餐厅和推荐。

### 成员与设置

设置页展示：

- 成员列表。
- 成员角色。
- 成员状态。
- 成员贡献数。
- 提醒设置。
- 评分权重。
- 小组信息。
- 邀请码重置或复制入口。

普通成员只读设置，管理员可编辑。

## 推荐与统计规则

推荐生成仍保持可解释评分，不引入机器学习。

候选评分因素：

- 星期匹配。
- 天气匹配。
- 距离。
- 同事推荐数。
- 近期去重。
- 负反馈。
- 餐厅状态过滤。

天气不可用时返回 `weatherUnavailable=true`，天气分为 0，并用文案说明“先按距离、星期和同事推荐来挑”。

历史复盘以 `daily_participation.status=decided` 为事实来源。多人选择不同店时，历史展示多店分布，不强行折叠成单一胜者。

成员贡献数由新增餐厅数、推荐数和有效反馈数组成，用于小组内运营参考，不做公开排行榜。

## 视觉与交互原则

保留 `demo-design/` 的温暖日常办公室风：

- 暖纸感中性背景。
- 食欲暖橙主色。
- 雨天、热乎、想吃、已吃过、避雷等语义色。
- 紧凑、可扫描的信息密度。
- 卡片、表格、筛选、modal、chip、switch、slider 等控件按原型风格组件化。

不直接照搬原型中的 review 辅助元素：

- 插件真实 popup 不显示 faux Chrome 工具栏。
- 原型总览页不进入产品。
- 静态假数据和原型导航不进入生产实现。

后台用 React 组件化复用 sidebar、topbar、panel、table、modal、form、chip、button。插件端可以继续使用无框架 DOM 实现，除非计划明确批准引入前端框架。

## 错误处理

- 插件推荐请求失败时，优先展示当前小组缓存；没有缓存时显示温和空态和设置入口。
- 当前 identity 没有加入小组时，popup 引导创建或加入小组。
- 当前小组餐厅不足时，推荐页提示先添加常去餐厅。
- 天气不可用时推荐照常生成，天气分为 0。
- session 过期时，admin 回到登录/选择小组页；插件提示重新连接小组。
- 成员被移除时，保留历史贡献但禁止写入。
- 权限不足时 API 返回 403；前端隐藏控件不能替代服务端校验。

## 迁移策略

现有单团队数据迁移到默认小组，例如：

```text
Dev团队 · 干饭小分队
```

迁移要求：

- 现有 teammate 迁移为 identity 和默认小组 membership。
- 现有 restaurants、recommendations、daily_recommendations、feedback 增加 `groupId` 并关联默认小组。
- 现有天气快照关联默认小组或在首次推荐时重建。
- 旧单团队 API 可以短期兼容，但新 UI 必须走多小组 contract。
- 迁移验证必须确认默认小组能看到旧餐厅、旧推荐、旧批次和旧反馈。

## 测试策略

### Shared

- 多小组 API contract 类型。
- 评分权重纯函数。
- 评分拆解和推荐理由生成。

### Server

- 创建小组。
- 加入小组。
- 切换小组 session。
- role 权限。
- 餐厅隔离。
- 推荐幂等。
- `forceRefresh=true` 新批次。
- 参与状态。
- 反馈写入与权限。
- dashboard 聚合。
- 迁移验证。
- 天气不可用 fallback。

### Extension

- 不从测试导入 side-effectful `background.ts`。
- storage 配置和当前小组。
- recommendation client 多小组请求。
- 缓存 fallback。
- 参与状态和决定操作。
- options 页保存设置。
- build 后 manifest 仍输出到 `apps/extension/dist/manifest.json`。

### Admin

- API client session header。
- 登录/建组/加入小组状态转换。
- 小组切换。
- 餐厅表单校验。
- 权限控件。
- dashboard 空态和数据状态。

### 常规检查

实现阶段完成前应运行相关检查：

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
pnpm --filter @lunch/admin typecheck
```

涉及 Chrome extension 时，尽量手动加载 `apps/extension/dist` 做 smoke test。

## 文档与协作要求

- 本规格接续 `specs/2026-07-07-lunch-chrome-extension-design.md` 和 `plans/2026-07-07-lunch-vertical-slice.md`。
- 实现计划必须存放在项目根目录 `plans/`。
- 重大行为变化必须先更新规格或计划。
- Codex 如需创建 subagent，必须显式使用 GPT-5.5；如果工具无法保证 GPT-5.5，则不得创建 subagent。
- Codex 交付必须说明 changed files、tests added、tests run、known issues、source-of-truth updates 和 subagent disclosure。
