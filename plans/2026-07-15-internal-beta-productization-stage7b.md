# Stage 7B：轻量身份统一与内测前安全加固

Status: `Completed 2026-07-16`

## Summary

- 执行前先接受身份 ADR、建立术语表，再修改运行时。
- 让 Admin、Extension 和其他设备通过一次性连接码使用同一个轻量身份，避免管理员在 Extension 中变成重复成员。
- 增加身份级 Token 续期与“重置所有连接”，关闭 Extension/Server legacy 路径，完成限流、CORS、安全错误上下文、PII 支持工具、依赖修复和真实 PostgreSQL 并发验证。
- Stage 7B 结束后仅把 Stage 7C 标为 `Ready for Planning`；不创建同事分发版本，也不启动普通同事内测。

## Domain、数据模型与公开接口

### 领域语言与 ADR

- 新增根目录 `CONTEXT.md`，仅定义领域术语，不作为需求来源：轻量身份、身份连接码、小组邀请码、本机断开、重置所有连接、小组成员资格、移除成员、匿名化身份、operator 恢复。明确避免把连接码称为恢复码、把 display name 称为账号。
- 将 `docs/decisions/0001-lightweight-identity.md` 标为 `Accepted`，记录：
  - 姓名不唯一且不证明现实身份；Admin 角色属于 membership。
  - 有任一有效设备时用一次性连接码跨端连接；所有 Token 都丢失时创建新身份并重新加入。
  - 唯一管理员丢失全部 Token 时，由 operator 在核验已知同事关系后完成管理员替换。
  - 设备泄露通过身份级“重置所有连接”处理，不支持只撤销单台设备。
  - 不引入邮箱、OAuth、长期恢复码、账号合并或正式账号体系。
- Stage 7D 的账号体系触发线：任何确认的身份误用/越权立即暂停扩容；首批用户中出现至少 2 次 operator 身份恢复，或任一周超过 20% 活跃用户需要重复身份/恢复支持时，必须形成正式账号 ADR。

### Prisma 迁移

- `Identity` 增加：
  - `authVersion Int @default(0)`：旧 Token 未携带版本时按 `0` 处理，避免部署后强制登出；所有新 Token 必须携带版本。
  - `anonymizedAt DateTime?`：匿名化后禁止续期、连接、建组、加入和使用 membership。
- 新增 `IdentityLinkCode`：关联 Identity，保存 HMAC hash、创建/到期/消费时间；不保存明文。
- 为 `LunchGroup.inviteCodeHash` 增加索引，加入小组时按 hash 查询，不再加载全部小组逐个校验。
- 保留 `Teammate`、legacy recommendation 数据表、迁移历史和 verifier；不得因关闭路由而删除历史归因。

### API 与共享契约

| 接口 | 行为 |
| --- | --- |
| `POST /api/identities` | 建立新身份；返回 identity ID、display name、Token 和到期时间。 |
| `POST /api/identities/session` | 使用尚未过期且版本匹配的 Identity Token 滑动续期；90 天无有效使用才自然失效。 |
| `POST /api/identities/link-codes` | Identity Token 保护；生成 `LINK-XXXX-XXXX-XXXX`，60-bit 随机度、10 分钟、单次使用；新代码使旧未使用代码失效。 |
| `POST /api/identities/link-codes/redeem` | 兑换同一 Identity 的新 Token；过期、已用和不存在统一返回 `invalid_identity_link_code`。 |
| `POST /api/identities/sessions/reset` | 原子递增 `authVersion`、清除连接码并返回当前设备的新 Token；所有旧 Identity/Group Token 立即失效。 |
| `POST /api/groups` | 删除 `displayName` 兼容字段，必须提供 Identity Token；生产关闭时继续返回 `group_creation_disabled`。 |
| `POST /api/groups/join` | 删除隐式身份创建，必须提供 Identity Token 和邀请码。 |
| `POST /api/groups/:groupId/session` | 返回新版 Identity/Group Token 及各自到期时间。 |

- `CreateGroupRequest` 仅保留 `groupName/subtitle`；`JoinGroupRequest` 仅保留 `inviteCode`。
- 所有 membership 授权同时验证 route group、membership ID、claims identity ID、数据库 identity、`authVersion`、active status 和当前 role。
- `ApiErrorResponse` 增加可选 `retryAfterSeconds`；429 固定使用 `rate_limit_exceeded`。

## Implementation Changes

### 身份连接、恢复与 PII

- Admin 和 Extension 启动时先续期 Identity Token，再同步小组；有 active group 时续期 group session。业务请求遇到 group-session 401 时共享 single-flight 续期并只重试一次。
- Identity Token 无效、过期或身份已匿名化：原子清除本地身份、sessions、active group 和敏感缓存，进入 onboarding。Membership 被移除：只清除对应小组 session 并重新同步小组。
- Admin 登录页和 Extension 设置页同时支持“建立新身份”与“输入连接码”；已连接状态显示身份参考号、生成连接码、“断开此设备”和“重置所有连接”。兑换另一身份前必须先显式断开当前身份。
- PII 采用 operator 导出＋匿名化，不增加自助删除 API：
  - `identity:export` 要求 identity ID 和未存在的输出文件，以 `0600` 写入该身份及其 memberships、本人创建内容、参与、反馈和批次归因；排除 Token、邀请码/hash、其他成员 PII。
  - `identity:anonymize` 默认 dry-run，`--apply` 必须二次确认；若该身份在任何小组仍是最后一位 active Admin，则整笔操作拒绝且不产生部分修改。
  - 成功匿名化时移除其全部 active memberships、清空 `lastSeenAt`、将姓名改为统一非识别标签、设置 `anonymizedAt`、递增授权版本并删除连接码；历史外键与统计记录保留。
  - `identity:recover-admin` 原子提升 replacement membership 后移除旧管理员 membership；`identity:revoke-sessions` 为无可用设备时的 operator 兜底。所有写命令默认 dry-run 并要求明确确认参数。
- 当前身份 PII 在受控 beta 期间保留至匿名化请求；默认支持目标为 7 日内完成导出/匿名化。去标识化历史继续保留，最终期限在 Stage 7D 账号决策中复查。

### 关闭 legacy 客户端与服务端

- Extension 先删除 `readToken`、`dev-read-token`、旧 recommendation/feedback 请求、旧全局缓存和 legacy reminder mode；无 active group 时只显示 onboarding、清除旧 alarm，不发网络请求或通知。
- 增加一次性 Extension storage migration：剔除旧 read token、`lunchLastRecommendation` 和 legacy alarm context，同时保留 identity、group sessions、分组缓存、提醒覆盖与当前小组。
- 随后取消 Server 对 `/api/session`、`/api/restaurants`、`/api/recommendations`、`/api/feedback`、`/api/today-recommendations` 的注册，删除共享 legacy header、legacy auth、default-group runtime recommendation/weather 死代码。
- 从环境 schema、示例和当前文档移除 `TEAM_INVITE_CODE`、`EXTENSION_READ_TOKEN`；release artifact gate 从“报告残留”改为发现任一旧 header、路径或默认值即失败。

### 公共入口保护、CORS、日志与依赖

- 新增兼容 Fastify 5 的 `@fastify/rate-limit` 10.x；单实例 beta 使用内存 store：
  - identity 创建与连接码兑换共享每 IP `5/10 分钟`；
  - 小组加入每 IP `10/10 分钟`；
  - 小组创建每 IP `3/小时`；
  - Identity/Group session 换发每 IP `30/分钟`；
  - 连接码生成和重置分别按 Identity Token 的不可逆 hash 限制为 `5/小时`、`3/小时`。
- 生产客户端 IP 只采用经格式校验的 Railway `X-Real-IP`，缺失或异常时保守回退到 socket IP；开发/测试直接使用 `request.ip`。Railway 明确提供该客户端 IP header，[官方网络规格](https://docs.railway.com/networking/public-networking/specs-and-limits)作为实现依据。
- CORS 不再反射任意 Origin：
  - 允许 `PUBLIC_API_BASE_URL` 的精确 origin；
  - 非生产额外允许 `http://localhost:5173` 和 `http://127.0.0.1:5173`；
  - 允许严格格式 `chrome-extension://[a-p]{32}`，兼容 unpacked/unlisted，且明确它不是认证；
  - 仅允许 `GET/POST/PUT/PATCH/OPTIONS` 与 `Authorization/Content-Type`，不启用 credentials，preflight 缓存 600 秒；其他网页 Origin 不返回允许头。
- 增加统一安全错误处理：500 响应固定为 `internal_error`；日志只记录 request ID、Railway request ID、method、route template、groupId、officeDate、业务 operation、重试次数和归类后的数据库错误码。禁止记录 headers、body、query、display name、Token、邀请码/连接码、数据库 URL 和原始 Prisma message。
- 推荐刷新失败使用具名安全错误上下文，使日志能定位 group/date/retry/constraint；提醒送达遥测仍留在 7D。
- 将 `@fastify/static` 升到 `^9.1.1` 以上的 9.x 补丁线，并保留 Admin 静态路由、缓存及 API 404 回归测试。

## Test Plan and Rollout

### 自动化验证

- Shared：新 route builders、请求/响应结构、Token 到期字段和 legacy contract 消失。
- Server identity：旧无版本 Token 与数据库版本 0 兼容；滑动续期、版本不匹配、匿名化、expired/missing identity；claims identity 与 membership identity 不一致必须拒绝；连接码 hash-at-rest、10 分钟过期、单次并发兑换仅一次成功、旧码失效；重置后所有旧 Identity/Group Token 失效，新 Token 可重新换发 group session。
- PII/operator：导出范围与秘密排除、拒绝覆盖；last-admin 跨组原子阻塞；匿名化不删除历史；管理员恢复和 session revoke dry-run/apply 边界。
- 边缘保护：各路由达到阈值返回 429 和 `Retry-After`，不同 IP/route bucket 隔离；无效 `X-Real-IP` 回退；完整 Origin/preflight 矩阵；日志中的伪 Token、姓名和数据库 URL 均不可出现。
- Legacy：所有旧 API 返回 JSON 404；Extension 无 active group 零网络请求、零提醒；构建物不含旧路径/header/default token。
- Extension/Admin：跨端连接后 identity ID、membership ID 和 admin role 相同；并发 401 只换发一次；403 只移除受影响小组；storage migration 保留 group cache。
- PostgreSQL：扩展现有 Docker PostgreSQL 16 rehearsal，在 fresh schema 中预置 weather 和最小小组数据，同时执行两次真实 refresh；两次调用均成功、产生两个 batch，且最终恰有一个 current batch。Fresh/legacy migration、verifier repeatability 和 Stage 6 overlap abort 继续通过。
- 完整门禁：package tests/typechecks/builds、`pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm build:railway`、migration rehearsal、docs/artifact/secret gates、fresh OSV production scan 和 `git diff --check`。

### 手工与生产验证

- 真实 Chrome 验证：首次安装 onboarding、Admin→Extension 和 Extension→Admin 连接、管理员角色保持、重置所有连接、过期 session 自动恢复、removed member、无小组时无 alarm、缓存恢复。
- 生产部署先保留旧环境变量并部署新 Server；健康/就绪、Admin hosting 和新身份接口通过后，再经单独外部变更批准将 `ALLOW_PUBLIC_GROUP_CREATION=false`，删除两个 legacy 环境变量并验证第二次部署。
- 生产证据包括：旧 API 404、允许/拒绝 Origin、无数据写入的无效连接码请求触发 429、同一管理员身份跨端 smoke、sanitized live group-creation boolean 为 false。
- 不在生产执行真实匿名化 apply；只对 Demo 数据做 dry-run，写操作在临时 PostgreSQL 验证。
- 生成 Stage 7B QA 报告并更新当前安全/产品/架构/运维/发布文档、CHANGELOG、RELEASE、roadmap 和 Stage 7 设计状态。通过所有退出门后才把 Stage 7C 标为 `Ready for Planning`。

## Assumptions and Non-goals

- Railway beta 保持单 Server replica；增加副本前必须改用共享 rate-limit store。
- 任意合法 Chrome Extension origin 被 CORS 接受是为了支持未确定的 7C 分发 ID；Bearer Token、membership revalidation 和限流仍是安全边界。
- 生产建组默认关闭；任何临时开放均属于独立审批的运维动作，完成后立即恢复 false。
- Stage 7B 不提供正式账号、个人身份验证、单设备 session 管理、账号合并、自助删除、`Teammate` 删除、品牌/分发版本或提醒遥测。
- `v0.1.0-internal` 继续只是 Stage 6 审计基线；Stage 7B 不冒充 7B/7C 后的可分发版本。
