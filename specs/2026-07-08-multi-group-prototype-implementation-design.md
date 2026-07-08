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

## 关键不变量

- 所有 `/api/groups/:groupId/*` 新 API 默认要求 group session。`EXTENSION_READ_TOKEN` 不授予跨组读取能力。
- `EXTENSION_READ_TOKEN` 只用于 legacy 单团队兼容 API、health/readiness 或开发环境调试。
- 新 extension 的当前小组推荐、参与、决定、反馈都使用 group session。
- `identityToken` 和 `groupSessionToken` 必须是服务端签名 token，例如 HMAC/JWT signed token。
- 服务端必须验证 token 签名和 `exp`；签名无效或过期返回 401。
- token payload 中的 `identityId`、`groupId`、`membershipId` 只作为查库线索，不能作为最终权限来源。
- 服务端权限以数据库当前 membership 为准，不信任 token 中的 `role` 或 `status`。
- `membership.status=removed` 的用户不能通过邀请码自助恢复，必须由 admin 恢复。
- 每个 active group 必须至少保留一个 active admin。
- 禁止移除、降级或停用最后一个 active admin。
- 所有写操作必须校验 path `groupId` 与 `restaurantId`、`recommendationId`、`membershipId` 所属 group 一致。
- extension 的 session、active group 和最近推荐缓存必须按 `groupId` 分桶。
- 新多小组 GET 接口不得产生新推荐批次；手动刷新使用 `POST /refresh`。
- `GET /api/groups/:groupId/today-recommendations` 在没有 current batch 时返回 404/`no_current_batch`。
- 同一 `groupId + officeDate` 同一时刻最多有一个 current batch，通过事务和测试保证。

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
- `invite_code_rotated_at`
- `invite_code_version`
- `created_by_identity_id`
- `office_timezone`
- `office_city`
- `office_latitude`
- `office_longitude`
- `created_at`
- `updated_at`

邀请码只在创建或重置时明文展示一次，数据库只保存最新哈希。`invite_code_version` 和 `invite_code_rotated_at` 用于后台展示“邀请码最近重置时间”和排查加入问题。真实天气优先使用小组坐标；第一版建组可使用环境变量中的默认坐标，后台设置页后续可改。

### `group_memberships`

identity 与 group 的关系。

- `id`
- `group_id`
- `identity_id`
- `role`: `admin` 或 `member`
- `status`: `active` 或 `removed`
- `joined_at`
- `removed_at`

一个 identity 可以加入多个 group。group session token 内应包含 `identityId`、`groupId`、`membershipId`、`role` 和过期时间。

`role` 只作为前端快速展示的 claim。服务端每次处理 group API 时，必须用 token 中的 `membershipId` 回查数据库。

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

权重字段为 number，默认值来自 `packages/shared` 常量。UI slider 范围建议为 0-100。penalty 字段存正数，计算时减去 penalty。生成 batch 时必须把完整 `scoringWeightsSnapshot` 写入 batch。

### `restaurants`

餐厅从单团队表升级为小组隔离。

- `id`
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

- `id`
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

- `id`
- `group_id`
- `office_date`
- `membership_id`
- `status`: `undecided`、`joining`、`away`、`decided`
- `restaurant_id`
- `recommendation_id`
- `decided_at`
- `updated_at`

只有 `joining` 和 `decided` 计入“今日参与人数”。`away` 不计入分母。`undecided` 表示尚未表态。

### `daily_recommendation_batches`

每天每个小组的推荐批次头。

- `id`
- `group_id`
- `office_date`
- `batch_no`
- `source`: `auto`、`manual` 或 `legacy`
- `generated_by_membership_id`，自动批次可为空
- `weather_snapshot_id`
- `scoring_weights_snapshot`
- `algorithm_version`
- `is_current`
- `created_at`

批次级元数据必须独立保存，以便后台展示批次号、生成时间、生成来源、生成者、当时天气、当时权重和算法版本。

### `daily_recommendation_items`

每天每个小组的推荐批次明细。

- `id`
- `batch_id`
- `rank`
- `restaurant_id`
- `recommendation_id`
- `score`
- `score_breakdown`
- `reason`
- `created_at`

同一 `groupId + officeDate` 默认幂等返回当前批次。`POST /api/groups/:groupId/today-recommendations/refresh` 创建新 current batch，并把旧批次标记为非当前。

### `feedback`

成员反馈。

- `id`
- `group_id`
- `office_date`
- `restaurant_id`
- `recommendation_id`
- `membership_id`
- `type`: `want`、`skip`、`ate`、`avoid`
- `created_at`

反馈影响当前小组之后的推荐，不跨组传播。`avoid` 的显示文案仍是“避雷”，但它只是成员反馈，不会把餐厅状态改为 `blocked`；餐厅 `blocked` 状态只能由 admin 设置或恢复。

### `weather_snapshots`

天气快照按小组和日期缓存。

- `id`
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

### 数据约束与索引

关键约束：

- `group_memberships`：`unique(group_id, identity_id)`。
- `group_settings`：`primary key / unique(group_id)`。
- `scoring_weights`：`primary key / unique(group_id)`。
- `restaurants`：索引 `group_id, name, area`；第一版不强制唯一，UI 新增时做重复提醒，避免同一小组内同名连锁店无法录入。
- `recommendations`：索引 `group_id, restaurant_id` 和 `group_id, membership_id`。
- `daily_participation`：`unique(group_id, office_date, membership_id)`。
- `daily_recommendation_batches`：`unique(group_id, office_date, batch_no)`。
- `daily_recommendation_batches`：同一 `group_id + office_date` 最多一个 `is_current=true`，由事务和测试保证。
- `daily_recommendation_items`：`unique(batch_id, rank)`，并索引 `batch_id`。
- `feedback`：索引 `group_id, office_date, restaurant_id`。
- `feedback`：可选 `unique(group_id, office_date, membership_id, restaurant_id, recommendation_id, type)`，避免同一成员重复刷同类反馈。

任何 Prisma 无法直接表达的 partial unique 约束，必须在 service 层事务和测试中保证。

## 认证与权限

### 轻量身份

用户通过姓名创建或复用本地 identity。identity 只用于标记“谁推荐/谁决定/谁反馈”，不承担正式账号安全承诺。

创建或复用 identity 后，服务端可返回 `identityToken`。`identityToken` 只用于查询该 identity 的小组列表和为指定 membership 换取 group session，不直接授权读取或写入小组业务数据。

`identityToken` 和 `groupSessionToken` 必须由服务端签名，使用现有 session secret 或专门的 token secret。服务端必须验证签名和过期时间。`groupSessionToken` 建议短期有效，例如 7-30 天；`identityToken` 可以稍长，但同样必须可过期。

### 建组与加入

- 创建小组时，服务端创建 group、settings、weights、admin membership，并返回 identity token、group session 和邀请码。
- 公开建组受环境变量 `ALLOW_PUBLIC_GROUP_CREATION` 控制。开发和内测可以设为 `true`；未来公开暴露范围扩大时可关闭。
- 加入小组时，用户输入邀请码和姓名。若本地已有 identity，复用 identity；否则创建新 identity。加入成功后创建 membership，并返回 identity token 和 group session。
- 如果已存在 `membership.status=removed`，join API 必须返回 403/`removed_member`，不能通过邀请码自助恢复。
- removed membership 只能由该小组 admin 通过成员管理 API 恢复。
- 当前小组切换时，客户端使用 identity token 调用 `POST /api/groups/:groupId/session` 换取该组 group session。

由于本阶段不做正式账号系统，removed member 禁止自助恢复只对同一 identity 生效。如果用户换设备或更换姓名创建新 identity，第一版不做强身份拦截，由 admin 后续移除处理。

### 权限规则

- active member 可以读取小组数据、新增餐厅、新增推荐、反馈、标记参与状态、决定今日午饭、请求新推荐批次。
- member 可以编辑自己创建的餐厅基础信息和自己写的 recommendation。
- admin 可以编辑所有餐厅基础信息、修改餐厅状态、修改小组设置、评分权重、成员角色、移除或恢复成员。
- `blocked` 和 `paused` 状态只有 admin 可以设置或恢复。
- removed member 保留历史贡献，但不能继续写入小组数据。
- 前端可以隐藏无权限控件，但服务端必须始终校验 membership 和 role。
- 服务端每次处理 `/api/groups/:groupId/*` 请求时，必须用 token 中的 `membershipId` 回查数据库：`membership.group_id` 必须等于 path `groupId`，`membership.status` 必须为 `active`，admin API 必须以数据库当前 `role` 为准。
- token 中的 `role` 仅用于前端快速展示，不作为权限来源。
- 系统必须保证每个 active group 至少有一个 active admin，禁止移除、降级或停用最后一个 active admin。
- `EXTENSION_READ_TOKEN` 只用于 legacy 单团队兼容 API、health/readiness 或开发环境调试；新多小组 API 不接受它作为跨组读取凭证。

## API 设计

新 UI 应使用多小组 API。路径采用 `/api/groups/:groupId/...`，服务端必须校验当前 session 是否拥有该 group 的 active membership。

`GET /api/groups` 使用 identity token，返回该 identity 的 active memberships。`POST /api/groups/:groupId/session` 使用 identity token 为指定 active membership 换取 group session。group session 只授权访问一个 group。

核心 API：

- `POST /api/identities`
- `POST /api/groups`
- `POST /api/groups/join`
- `GET /api/groups`
- `POST /api/groups/:groupId/session`
- `GET /api/groups/:groupId/today-recommendations`
- `POST /api/groups/:groupId/today-recommendations/refresh`
- `GET /api/groups/:groupId/restaurants`
- `POST /api/groups/:groupId/restaurants`
- `PATCH /api/groups/:groupId/restaurants/:restaurantId`
- `POST /api/groups/:groupId/recommendations`
- `PATCH /api/groups/:groupId/recommendations/:recommendationId`
- `GET /api/groups/:groupId/participation/today`
- `PUT /api/groups/:groupId/participation/today`
- `POST /api/groups/:groupId/feedback`
- `GET /api/groups/:groupId/dashboard`
- `GET /api/groups/:groupId/settings`
- `PATCH /api/groups/:groupId/settings`
- `GET /api/groups/:groupId/members`
- `PATCH /api/groups/:groupId/members/:membershipId`

`GET /api/groups/:groupId/today-recommendations` 永远只读当前批次。如果当天还没有 current batch，返回 404/`no_current_batch`，UI 显示“生成今日推荐”按钮。`POST /api/groups/:groupId/today-recommendations/refresh` 可用于首次生成或手动重新生成；每次成功调用都会创建新 `batchNo`，把新 batch 设为 current，并返回新结果。

Chrome alarm 或通知流程如需确保当天有推荐，必须先 GET；遇到 404/`no_current_batch` 时再显式调用 `POST /refresh`。不得通过 GET 自动创建 batch。

任何带 `restaurantId`、`recommendationId`、`membershipId` 的写操作都必须校验这些资源属于 path `groupId`。优先使用数据库复合唯一约束或复合外键；Prisma 不易表达的地方必须在 service 层显式校验。重点接口包括 feedback、participation decide、recommendations create/patch、restaurants patch、members patch 和 today refresh。

`PATCH /api/groups/:groupId/recommendations/:recommendationId` 允许 member 修改自己写的 `dish`、`reason` 和 tags；admin 可以修改或隐藏本小组内所有 recommendation。

`packages/shared` 必须先定义 request/response contracts，UI 代码不得自造类型。核心类型至少包括：

```ts
interface GroupSummary {
  groupId: string;
  name: string;
  subtitle?: string;
  role: "admin" | "member";
  membershipId: string;
}

interface GroupSessionResponse {
  identityToken: string;
  groupSessionToken: string;
  group: GroupSummary;
}

interface TodayRecommendationsResponse {
  groupId: string;
  officeDate: string;
  batchId: string;
  batchNo: number;
  generatedAt: string;
  weather?: WeatherSummary;
  weatherUnavailable?: boolean;
  participationSummary: {
    joiningCount: number;
    decidedCount: number;
    awayCount: number;
    undecidedCount: number;
  };
  items: RecommendationItem[];
  fromCache?: boolean;
}

interface ParticipationTodayResponse {
  groupId: string;
  officeDate: string;
  members: ParticipationMember[];
}

interface DashboardResponse {
  groupId: string;
  officeDate: string;
  currentWeek: DashboardWeekSummary;
  recentBatches: BatchSummary[];
  topRestaurants: DashboardRestaurantStat[];
  categoryDistribution: DashboardCategoryStat[];
  recentActivity: DashboardActivityItem[];
}

interface RestaurantListResponse {
  groupId: string;
  restaurants: RestaurantSummary[];
}

interface MembersResponse {
  groupId: string;
  members: MemberSummary[];
}

interface ApiErrorResponse {
  error: string;
  message: string;
}
```

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

反馈写入当前小组，不跨小组生效。按钮“避雷”写入 feedback type `avoid`，不直接修改餐厅状态。

### 设置与缓存

设置页增加当前小组选择器。用户可以在已加入的小组之间切换。API 地址、提醒时间、工作日提醒、当前小组和最近推荐缓存继续保存在 `chrome.storage`。

extension storage 必须按 `groupId` 分桶：

```ts
interface ExtensionStorageShape {
  apiBaseUrl: string;
  activeGroupId?: string;
  identityToken?: string;
  sessionsByGroupId: Record<string, {
    token: string;
    expiresAt?: string;
  }>;
  groupSummariesById: Record<string, GroupSummary>;
  lastRecommendationsByGroupId: Record<string, TodayRecommendationsResponse>;
  localReminderOverridesByGroupId: Record<string, {
    reminderTime?: string;
    enabled?: boolean;
  }>;
}
```

popup fallback 只能读取 `lastRecommendationsByGroupId[activeGroupId]`。从 A 组切到 B 组后，B 组请求失败时不得展示 A 组缓存。

小组设置中的 `reminder_time` 是默认提醒时间；插件本地 `reminderTime` 是用户本机 override。首次加入小组时用小组默认值初始化本地设置，之后用户本地设置优先，后台修改不得静默覆盖用户本地 override。

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

生成 batch 时必须保存完整 `scoringWeightsSnapshot`、`weatherSnapshotId` 和 `algorithmVersion`。旧 batch 的分数、拆解、权重快照不能因为之后调整权重而改变。

参与状态机：

- 无记录视为 `undecided`。
- `undecided -> joining | away | decided`
- `joining -> away | decided`
- `away -> joining | decided`
- `decided -> joining | away | decided`
- 当 `status=decided` 时必须带 `restaurantId`；`recommendationId` 可选。
- 当 `status!=decided` 时必须清空 `restaurantId`、`recommendationId`、`decidedAt`。

历史复盘以 `daily_participation.status=decided` 为事实来源。多人选择不同店时，历史展示多店分布，不强行折叠成单一胜者。

成员贡献数由新增餐厅数、推荐数和有效反馈数组成，用于小组内运营参考，不做公开排行榜。

dashboard 统计窗口：

- “本周”按 `group.office_timezone` 的自然周计算。
- 团队人均只统计 `status=decided` 且餐厅有 `average_price_cents` 的记录。
- 少于 3 次 decided 或少于 2 名成员参与时，团队人均和偏好分布应显示“数据不足”。
- 本周热餐厅按近 7 天 decided 次数排序。
- 类别分布按近 7 天 decided 记录的 `cuisine` 聚合。

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
- 现有 restaurants、recommendations、feedback 增加 `groupId` 并关联默认小组。
- 现有 feedback type `blocked` 迁移为 `avoid`；餐厅状态 `blocked` 保持不变。
- 现有 daily recommendation 记录迁移为 `daily_recommendation_batches` 和 `daily_recommendation_items`；每个旧 `batch_id` 生成一个 batch header，旧行迁移为 items。
- 迁移旧 batch 时，`source=legacy`，`generated_by_membership_id=null`，`algorithm_version=legacy-v1`。
- 迁移旧 batch 的 `scoring_weights_snapshot` 使用迁移时默认权重，并标记 `migrated=true`。
- 旧 batch 没有 weather snapshot 时，`weather_snapshot_id=null`，UI 显示“历史天气不可用”。
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
- identity token 和 group session token 必须验证签名和 `exp`。
- 伪造、过期或签名无效 token 返回 401。
- role 权限。
- 餐厅隔离。
- 推荐幂等。
- `GET /today-recommendations` 无 current batch 时返回 404/`no_current_batch`，且不写入数据库。
- `POST /today-recommendations/refresh` 新批次。
- 参与状态。
- 反馈写入与权限。
- member 只能 patch 自己写的 recommendation，admin 可以 patch 本组所有 recommendation。
- `avoid` feedback 不会把 restaurant status 改成 `blocked`。
- dashboard 聚合。
- 迁移验证。
- legacy batch 迁移后 `source=legacy`、`algorithm_version=legacy-v1`、权重快照带 `migrated=true`。
- 天气不可用 fallback。
- A 组 session 不能读写 B 组 restaurants、recommendations、feedback、participation。
- feedback 和 participation 中传入其他组 `restaurantId` 时返回 400 或 403。
- removed member 不能读写；role 降级或移除后旧 token 立即失效。
- 不能移除或降级最后一个 active admin。
- removed membership 不能通过 join 自助恢复。
- 并发 `POST /today-recommendations/refresh` 后只有一个 current batch。
- 权重修改后，旧 batch 的 `score_breakdown` 和 `scoringWeightsSnapshot` 不变。
- `group.office_timezone` 下跨日边界正确。

### Extension

- 不从测试导入 side-effectful `background.ts`。
- storage 配置和当前小组。
- recommendation client 多小组请求。
- 缓存 fallback。
- active group 切换后只读取对应 group 的 cache。
- B 组请求失败时不会展示 A 组 cache。
- session 过期时提示重新连接当前组。
- notification 使用 active group。
- 参与状态和决定操作。
- options 页保存设置。
- build 后 manifest 仍输出到 `apps/extension/dist/manifest.json`。

### Admin

- API client session header。
- 登录/建组/加入小组状态转换。
- 小组切换。
- 餐厅表单校验。
- 权限控件。
- 普通成员看得到设置但不能修改。
- 切换小组后所有页面刷新为新 group 数据。
- 餐厅库、今日推荐、dashboard 不泄露其他 group 数据。
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
