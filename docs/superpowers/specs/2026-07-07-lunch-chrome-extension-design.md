# 中午吃点啥 Chrome 插件设计

## 概述

“中午吃点啥”是一个面向小团队的 Chrome 插件和轻量后端系统。它在工作日午饭前提醒同事，并根据星期、天气、距离、历史推荐和同事积累的饭馆数据给出 2-3 个午饭建议。第一版目标不是做复杂餐饮平台，而是让团队每天少纠结几分钟，并把大家的真实推荐沉淀下来。

第一版由一个 monorepo 管理三部分：

- `extension/`：Chrome Manifest V3 插件。
- `server/`：Railway 上部署的 Fastify API，同时托管管理网页静态资源。
- `shared/`：插件、后端、管理网页共享的 TypeScript 类型和少量纯函数。

后端部署在 Railway，数据库使用 Railway PostgreSQL。正式分发目标是 Chrome Web Store 不公开发布，开发和内测阶段使用 unpacked extension。

## 已确认的产品决策

- 推荐数据使用后端稳定存储，而不是只放在插件本地。
- 后端部署优先使用现有 Railway 账号。
- 同事和饭馆数据通过单独管理网页维护，插件只负责提醒和查看推荐。
- 管理网页使用同事姓名和团队邀请码识别身份，不做正式账号系统。
- 第一版接入真实天气 API，并把天气作为推荐加权因素。
- 11:30 交互使用 Chrome 系统通知，点击通知后打开插件详情。
- 技术栈使用 TypeScript、Fastify、Prisma、PostgreSQL、React 和 Vite。

## 非目标

第一版不做以下能力：

- 正式账号、邮箱登录、OAuth 或复杂权限系统。
- 地图导航、实时排队、外卖平台集成或支付。
- 复杂社交关系、评论流、排行榜。
- 机器学习推荐模型。
- 多城市、多办公室的完整租户体系。
- 自动打开新标签页或强打扰式弹窗。

这些能力可以在 MVP 稳定后按实际使用情况追加。

## 用户体验

### Chrome 插件

插件在工作日 11:30 通过 `chrome.alarms` 触发提醒。Service worker 调用后端 `GET /api/today-recommendations`，拿到当天推荐后使用 `chrome.notifications` 弹出系统通知。

通知标题使用固定基调：

```text
吃饭才是正事，中午吃点啥呢？
```

通知内容展示 2-3 个推荐摘要。点击通知或插件图标后打开 popup，popup 显示：

- 今日推荐列表。
- 每个推荐的饭馆名、推荐菜、距离或用餐方式、推荐理由。
- 天气解释，例如“今天有雨，优先推荐近一点、热乎一点的选择。”
- 手动刷新按钮。
- 基础设置入口：API 地址、提醒时间、是否启用工作日提醒。

插件只缓存最近一次成功推荐。当后端不可用时，popup 和通知可以展示缓存结果，并提示这是上一次推荐。

### 管理网页

管理网页由后端服务托管，适合团队内部录入和维护数据。用户第一次进入时输入团队邀请码和自己的姓名。通过后，浏览器本地记住同事身份，后续新增推荐会自动关联推荐人。

管理网页第一版包含：

- 饭馆列表：查看、搜索、筛选启用/暂停/避雷状态。
- 饭馆表单：名称、区域、地址、距离、菜系、价格区间、堂食/外卖、标签、状态。
- 推荐表单：推荐菜、推荐理由、适合天气、适合星期、适合心情或场景。
- 简单反馈入口：想吃、不想吃、已吃过、避雷。

管理页不做复杂权限。邀请码是团队门钥匙，主要防止公开 URL 被随意写入。

## 系统架构

```text
Chrome Extension
  | GET /api/today-recommendations
  | POST /api/feedback
  v
Fastify API on Railway
  | Prisma
  v
Railway PostgreSQL

Management Web App
  | REST API
  v
Fastify API on Railway
```

### `extension/`

职责：

- 配置 Chrome Manifest V3。
- 在安装或设置变更时注册 `chrome.alarms`。
- 到点后请求后端推荐。
- 展示 Chrome 系统通知。
- 提供 popup 查看今日详情和手动刷新。
- 使用 `chrome.storage` 保存 API 地址、提醒时间、开关和最近一次推荐。

插件不负责核心推荐算法，也不持久保存饭馆库。

### `server/`

职责：

- 暴露 REST API。
- 执行推荐算法。
- 调用天气 API 并缓存天气快照。
- 通过 Prisma 读写 PostgreSQL。
- 校验团队邀请码。
- 托管管理网页构建产物。
- 为 Railway 提供健康检查接口。

Fastify 是第一版后端框架。选择 Fastify 的原因是插件、管理网页、共享类型和后端都可以保持 TypeScript 生态，减少语言边界和部署复杂度。

### `shared/`

职责：

- 定义推荐响应、天气标签、饭馆标签、价格区间等共享类型。
- 存放无副作用的推荐评分辅助函数。
- 存放 API contract 常量和轻量 schema。

`shared/` 不连接数据库、不调用网络，避免变成跨层杂物区。

## 数据模型

### `teammates`

记录同事身份。

- `id`
- `name`
- `created_at`
- `last_seen_at`

### `restaurants`

饭馆主表。

- `id`
- `name`
- `area`
- `address`
- `distance_minutes`
- `cuisine`
- `price_band`
- `supports_dine_in`
- `supports_takeout`
- `tags`
- `status`: `active`、`paused`、`blocked`
- `created_at`
- `updated_at`

### `recommendations`

同事推荐内容。

- `id`
- `restaurant_id`
- `teammate_id`
- `dish`
- `reason`
- `weather_tags`
- `weekday_tags`
- `mood_tags`
- `created_at`
- `updated_at`

### `daily_recommendations`

每天实际推荐记录。

- `id`
- `date`
- `restaurant_id`
- `recommendation_id`
- `score`
- `reason`
- `created_at`

### `weather_snapshots`

天气缓存。第一版天气适配器按办公室经纬度查询，默认面向 Open-Meteo 这类无需账号的天气 API；如后续需要更本地化的天气源，可以替换适配器而不改推荐算法。

- `id`
- `date`
- `city`
- `temperature_c`
- `condition`
- `precipitation_probability`
- `wind_level`
- `raw_payload`
- `created_at`

### `feedback`

简单反馈记录。

- `id`
- `date`
- `restaurant_id`
- `recommendation_id`
- `teammate_id`
- `type`: `want`、`skip`、`ate`、`blocked`
- `created_at`

## 推荐逻辑

第一版使用可解释的加权评分，不使用黑盒模型。

候选饭馆需要满足：

- 饭馆状态为 `active`。
- 至少有一条可用推荐，或者饭馆本身信息足够完整。
- 不在最近推荐去重窗口内，除非可用候选过少。

评分因素：

- 星期匹配：例如周五可以提高“奖励餐”或聚餐类标签。
- 天气匹配：雨天提高近距离、热乎、可外带；热天提高清爽、近距离。
- 距离：默认偏好步行较近的饭馆。
- 同事推荐数量：多人推荐略加分。
- 历史去重：最近几天推荐过的饭馆降权。
- 反馈：`skip` 和 `blocked` 降权，`want` 和 `ate` 作为后续优化信号。

推荐 API 返回 2-3 个结果，并包含一句可读解释。

示例响应：

```json
{
  "date": "2026-07-07",
  "headline": "吃饭才是正事，中午吃点啥呢？",
  "weatherSummary": "今天有雨，优先推荐近一点、热乎一点的选择。",
  "items": [
    {
      "restaurantName": "某某牛肉面",
      "dish": "红烧牛肉面",
      "reason": "雨天热乎，离办公室近，李雷推荐过。",
      "tags": ["雨天", "热乎", "近"]
    }
  ]
}
```

## API 草案

公开给插件的 API：

- `GET /api/health`
- `GET /api/today-recommendations`
- `POST /api/feedback`

管理网页 API：

- `POST /api/session`
- `GET /api/me`
- `GET /api/restaurants`
- `POST /api/restaurants`
- `PATCH /api/restaurants/:id`
- `GET /api/recommendations`
- `POST /api/recommendations`
- `PATCH /api/recommendations/:id`

第一版使用后端签发的 session token。用户提交团队邀请码和姓名后，后端创建或复用 `teammates` 记录，并返回带签名的 token；管理网页把 token 保存在浏览器本地。团队邀请码只在创建 session 时提交，后续写操作用 token 识别推荐人。

## 错误处理

天气 API 失败：

- 后端使用当天已有 `weather_snapshots`。
- 没有缓存时退化为按星期、距离、历史去重推荐。
- 响应中标记天气不可用，popup 显示温和提示。

后端不可用：

- 插件使用最近一次成功推荐缓存。
- 通知和 popup 标注这是缓存结果。

饭馆数据太少：

- 后端返回已有候选。
- 管理页显示需要补充饭馆和推荐的提示。

邀请码错误：

- 管理页拒绝写入。
- 插件查看推荐不强制登录。

数据库不可用：

- API 返回明确错误码。
- Railway 日志保留错误详情，响应不泄露数据库连接信息。

## 配置

Railway 环境变量：

- `DATABASE_URL`
- `TEAM_INVITE_CODE`
- `SESSION_SECRET`
- `WEATHER_API_BASE_URL`
- `OFFICE_CITY`
- `OFFICE_LATITUDE`
- `OFFICE_LONGITUDE`
- `PUBLIC_API_BASE_URL`
- `NODE_ENV`

插件配置：

- API base URL。
- 提醒时间，默认 `11:30`。
- 是否启用工作日提醒。
- 最近一次推荐缓存。

## 部署与分发

本地开发：

- 使用 monorepo scripts 分别启动后端、管理页和插件构建。
- 插件开发阶段加载 `extension/dist`。
- 后端可连接本地 PostgreSQL 或 Railway PostgreSQL 开发环境。

Railway 部署：

- Railway 部署 `server/` 服务。
- Railway PostgreSQL 作为同一 project 内数据库。
- `DATABASE_URL` 引用 PostgreSQL 服务变量。
- 迁移在部署流程中执行。
- Railway public domain 作为插件 API 地址。

插件分发：

- 开发阶段：开发者模式加载 unpacked extension。
- 内测阶段：同事加载同一个构建产物。
- 正式阶段：Chrome Web Store 不公开发布，通过链接分发并获得自动更新。

插件权限保持最小化：

- `alarms`
- `notifications`
- `storage`
- Railway API 域名的 host permission

## 测试策略

单元测试：

- 推荐评分和排序。
- 天气标签映射。
- 历史去重。
- API 响应结构。

后端集成测试：

- 饭馆和推荐 CRUD。
- 邀请码 session。
- 天气失败退化。
- 数据不足退化。

前端测试：

- 管理页登录。
- 新增饭馆。
- 新增推荐。
- 修改饭馆状态。

插件测试：

- alarm 注册逻辑。
- 推荐请求和缓存。
- 通知内容构造。
- 后端不可用时的缓存退化。

## 里程碑

1. 建立 monorepo、TypeScript、基础 lint/test/build。
2. 实现 Prisma schema 和数据库迁移。
3. 实现 Fastify API 和推荐算法第一版。
4. 实现管理网页基础录入和维护流程。
5. 实现 Chrome 插件 alarm、通知、popup。
6. 接入天气 API 和缓存。
7. 完成本地测试和 Railway 部署文档。
8. 内测分发 unpacked extension。
9. 准备 Chrome Web Store 不公开发布材料。

## 成功标准

- 工作日 11:30 插件能稳定弹出推荐通知。
- 至少能返回 2-3 个有理由的午饭建议。
- 管理网页可以让同事通过邀请码录入饭馆和推荐。
- 后端数据持久化在 Railway PostgreSQL。
- 天气 API 失败、后端短暂不可用、数据较少时都有可用退化路径。
- 第一版可以通过开发者模式给同事内测，并具备后续上架 Chrome Web Store 的路径。
