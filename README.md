# 中午吃点啥

一个帮助小团队更快决定午饭的内部产品：把同事真实推荐变成每天 2–3 个有理由、
可参与、可反馈的选择。

## 当前状态

- 阶段：Stage 7 Internal Beta Productization；7A 已完成，7B Ready for Planning。
- Admin 与 API 已部署在
  [Railway production](https://lunchserver-production.up.railway.app)，同源提供页面和 API。
- 生产 QA 基线：`v0.1.0-internal` →
  `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`。
- Chrome 扩展目前仍使用 Developer Mode 加载 unpacked build，普通同事分发被 Stage 7B/7C
  的安全和分发门阻塞。
- 当前是轻量身份：显示名不是可验证账号，身份 Token 保存在本机，没有跨设备恢复或
  账号合并。

## 核心体验

1. 创建轻量身份并创建或加入一个“干饭小组”。
2. 维护小组自己的餐厅、菜品和推荐理由。
3. 每天生成 2–3 个解释性推荐，查看天气、距离、星期和团队信号。
4. 标记参加、请假或决定餐厅，并提交想吃/避雷反馈。
5. 在 Admin 查看历史、Dashboard、成员贡献、提醒和评分权重。
6. 通过 Chrome 扩展接收克制的午饭提醒和条件式第二次提醒。

## 快速开始

### 使用已部署 Admin

1. 打开 [生产 Admin](https://lunchserver-production.up.railway.app)。
2. 输入显示名创建本机轻量身份。
3. 创建小组，或使用小组管理员提供的一次性邀请码加入。
4. 选择当前小组后维护餐厅并生成今日推荐。

不要把邀请码、身份 Token 或小组会话 Token 写入文档、聊天或工单。

### 加载 Chrome 扩展（当前仅开发者/审查者）

```bash
pnpm --filter @lunch/extension build
```

在 `chrome://extensions` 开启 Developer mode，选择 **Load unpacked** 并加载
`apps/extension/dist`。进入扩展设置，把 API 地址设为生产 Railway origin 或本地
Server，再创建身份并加入小组。

当前 build 仍保留待 Stage 7B 移除的 legacy fallback，因此尚不是普通同事内测分发包。

## 本地开发

要求：Node.js 22、pnpm 9.15.0、PostgreSQL，以及可选的 Docker（迁移 rehearsal）。

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm --filter @lunch/server prisma:generate
pnpm --filter @lunch/server prisma:migrate -- --name local
pnpm --filter @lunch/server prisma:seed
pnpm dev:server
```

另开终端启动 Admin：

```bash
VITE_API_BASE_URL=http://localhost:3000 pnpm dev:admin
```

开发环境变量只在本地 `.env` 中赋值：

- `DATABASE_URL`：PostgreSQL 连接。
- `SESSION_SECRET`：签名身份和小组会话；生产至少 32 字符。
- `ALLOW_PUBLIC_GROUP_CREATION`：是否允许公开创建小组。
- `IDENTITY_TOKEN_TTL_DAYS`、`GROUP_SESSION_TTL_DAYS`：轻量身份/会话有效期。
- `WEATHER_API_BASE_URL`：Server 使用的天气 API。
- `OFFICE_CITY`、`OFFICE_LATITUDE`、`OFFICE_LONGITUDE`、`OFFICE_TIMEZONE`：办公室信号。
- `PUBLIC_API_BASE_URL`：公开 API origin；生产必须 HTTPS。
- `TEAM_INVITE_CODE`、`EXTENSION_READ_TOKEN`：仅 legacy compatibility，Stage 7B 待移除/停用。
- `NODE_ENV`、`PORT`、`RAILWAY_GIT_COMMIT_SHA`：运行环境与发布标识。

真实值不得提交。生产禁止运行 `prisma:seed`。

## 仓库结构

- `apps/admin/`：React 管理页面，生产由 Fastify 同源托管。
- `apps/server/`：Fastify API、Prisma schema、迁移和数据库 verifier。
- `apps/extension/`：Chrome Manifest V3 扩展。
- `packages/shared/`：Admin、Server、Extension 共用的 API contracts 与评分类型。
- `specs/`、`plans/`：当前 Stage 的规格和执行计划。
- `docs/`：当前产品、架构、安全、运维和发布文档。
- `docs/archive/stages/`：Stage 1–6 历史规格、计划与 QA 证据。

## 身份与安全边界

- 显示名不是登录凭证，也不保证唯一。
- 身份 Token 代表一台浏览器中的轻量身份；清除存储或换设备可能生成新身份。
- 小组会话在每次受保护请求时重新检查 active membership 和当前角色。
- 邀请码允许加入特定小组，但不能证明现实世界身份。
- 移除成员只撤销对应 membership；不能阻止同一个人换设备/显示名创建新身份。
- legacy unscoped routes、共享 read token 和无 rate limit 是已确认的 Stage 7B 内测阻塞项。

完整说明见 [身份与安全](docs/identity-and-security.md)。

## 测试与发布

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm build:railway
pnpm check:release-artifacts
pnpm check:release-secrets
```

Server 迁移 rehearsal：

```bash
pnpm --filter @lunch/server migration:rehearse
```

Extension 行为变化还需要用 `apps/extension/dist` 做真实 Chrome 手工 QA。详细门禁见
[测试与发布](docs/testing-and-release.md)。

## 部署与运维

Railway 使用 `railway.json`：

- build：`pnpm build:railway`
- pre-deploy：`pnpm predeploy:railway`
- start：`pnpm start:railway`
- liveness：`GET /api/health`
- readiness + revision：`GET /api/ready`

部署、迁移、数据库验证、回滚和数据保留见 [运维说明](docs/operations.md) 与
[RELEASE.md](RELEASE.md)。

## 已知限制

- 没有正式账号、跨设备恢复或账号合并。
- Stage 7B 前仍存在 legacy API/fallback 和公开 API 保护缺口。
- Chrome 扩展没有最终分发/自动升级机制。
- 独立详情页、品牌一致性、Modal 键盘体验和 QuickAdd 重试仍待 Stage 7C。
- 生产保留明确命名的 Stage 6 Demo/QA fixture 和旧 rollback database；都禁止无审批删除。

## Roadmap

Stage 1–6 已完成。Stage 7A 正在收口可信基线；7B 完成轻量身份加固，7C 完成品牌和
分发，7D 进行受控同事内测。详见 [roadmap.md](roadmap.md)。
