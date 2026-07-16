# Stage 7：内部发布产品化（Internal Beta Productization）

Status: `In Progress; Stage 7A Complete, Stage 7B Ready for Planning`

Date: 2026-07-15

## 背景与目标

Stage 1–6 已经形成可信的生产基线：Admin 与 Server 已部署到 Railway，
数据库迁移、推荐流程、跨小组隔离、Chrome 通知与第二次提醒、成员权限和
回滚路径均已通过生产 QA。Stage 7 不再以继续扩展功能面为中心，而是把项目
从“开发模式”切换为“内部产品运营模式”。

生产验证基线固定为提交
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`。该提交之后的
`32d414a` 只补充 Stage 6 QA、plan 和 roadmap 记录，不改变已部署运行时。
Stage 7A 应为生产基线创建 `v0.1.0-internal` 标签；在标签真正创建并核验前，
不得把版本冻结标记为完成。

Stage 7 的完成目标是：同事可以在理解当前身份和安全边界的前提下，获得
一致、可安装、可支持、可回滚的内部版本；团队可以观察真实使用、收集反馈，
再决定是否需要正式账号体系。Stage 7 不提前定义 Stage 8 的具体实现。

## 推进顺序与阻塞关系

| 子阶段 | 目标 | 是否阻塞同事内测 | 当前状态 |
| --- | --- | --- | --- |
| Stage 7A | 冻结当前基线、文档收口、Claude Code 多角度审查 | 是 | Done：退出门与 QA 已通过 |
| Stage 7B | 明确身份模型，并完成轻量身份加固 | 是 | Ready for Planning |
| Stage 7C | 品牌、图标、体验一致性与分发材料 | 是 | Defined：等待 7B 完成后写详细计划 |
| Stage 7D | 小范围同事内测、监控、反馈和账号体系决策 | 否，属于内测过程 | Defined：7A–7C 通过后启动 |

执行必须保持 7A → 7B → 7C → 7D 的顺序。7A、7B、7C 的退出门未通过前，
不把版本交给普通同事作为正式内测入口。必要的开发者或审查者验证不算进入
Stage 7D。

## Stage 7A：当前状态收尾与可信基线

### 版本冻结

- 在精确提交 `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9` 上创建并核验
  `v0.1.0-internal` 标签，不把标签错误地指向其后的文档提交。
- 保持 roadmap 中 Stage 1–6 为 `Done`，新增 Stage 7，但不提前规划
  Stage 8 的实现。
- 新增根目录 `CHANGELOG.md`，用用户可理解的语言记录内部版已经具备的能力。
- 新增短版根目录 `RELEASE.md`，只记录版本/部署标识、数据库服务、发布核验、
  回滚步骤和已知问题。不得写入邀请码、Token、Secret 或数据库连接信息。
- 标签推送、发布物上传或远端 release 创建属于明确的发布动作，应在本地内容
  review 通过后单独确认；本设计本身不代表这些动作已经发生。
- `v0.1.0-internal` 只标记生产 QA 基线，不代表 7B/7C 阻塞项已修复，也不是同事
  内测分发版本。通过 7B/7C 后的可分发构建必须建立新的版本边界。

### 当前文档收口

Stage 1–6 文档包含测试证据、迁移说明和历史决策，不能直接删除。Stage 7A
应将文档整理为以下长期结构：

```text
README.md
docs/
  product.md
  architecture.md
  identity-and-security.md
  operations.md
  testing-and-release.md
  decisions/
    0001-lightweight-identity.md
    0002-extension-distribution.md
  archive/
    stages/
      README.md
      stage-1/
      stage-2/
      ...
      stage-6/
```

整理原则：

- `README.md` 只作为“产品是什么、如何使用、如何运行”的入口。
- `docs/*.md` 描述当前仍有效的产品、系统、安全、运维和发布行为。
- `docs/archive/stages/` 保存历史过程、旧计划和 QA 证据，并提供索引和原路径
  映射；移动文件时必须同步修复仓库内链接。
- 当前行为不应要求读者先阅读 Stage 1–6 才能理解。
- 历史 Stage 文档只作为审计证据。历史计划与现状冲突时，先通过代码、测试、
  生产 QA 和当前产品文档确认现状，再修正文档；不得让已归档计划覆盖当前行为。
- 文档重组必须同步更新 `AGENTS.md`、协作协议和 source-of-truth 说明，明确区分
  “现行规格”与“历史归档”。

README 应保持短小，并覆盖：当前 Internal Beta 状态、核心体验、已部署 Admin
与扩展加载方式、身份创建和加入小组、本地开发、仓库结构、身份与安全边界、
测试与发布、Railway 运维、已知限制和 roadmap。环境变量只列名称和用途。

### 多角度审查

在进入身份改造前，使用 Claude Code / gstack 对冻结基线进行产品、UX、架构、
QA/发布、文档五个角度的审查。审查结果保存在 `qa/`，每项发现必须有严重级别、
证据、负责人/处置方式和目标阶段。阻塞内部发布的问题必须在 7A–7C 内解决；
非阻塞问题可以明确接受并进入受控 backlog，但不能静默忽略。

本轮 review 已完成并按
[`qa/2026-07-15-production-baseline-review-triage.md`](../qa/2026-07-15-production-baseline-review-triage.md)
有条件接受。最终 triage 覆盖原始严重级别：legacy 路径、rate limit/CORS 与错误
部署文档是确认的内测阻塞项；“无结构化日志”被修正为业务上下文/告警/提醒可见性
缺口；database verifier 未运行真实 PostgreSQL 的判断被关闭为不可复现。

Stage 7A 只处理其中的 README/runbook/当前文档、review 证据、依赖/构建检查和风险
登记。rate limit、CORS、Extension legacy fallback 与 Server legacy 路径均改变运行
行为，必须进入 Stage 7B 详细计划和 TDD gate，不能以“7A immediate”名义旁路规格。

### 已知技术债登记

- 生产依赖审计有两个 `@fastify/static` moderate 提示：确认兼容升级路径，或记录
  限时接受理由、影响面和复查日期。
- 旧 Railway `Postgres` 服务仍作为回滚数据库：补充保留期限和删除前置条件；
  删除继续作为单独的破坏性操作审批，Stage 7A 不默认删除。
- 生产环境保留 Stage 6 QA 身份、小组、餐厅和行为记录：同事入场前明确标记为
  Demo 数据，或通过经过 review、可预演、可核验的定向脚本清理；不得手工盲删。
- 仓库存在 unreachable loose objects 与 `.git/gc.log`：先做只读 `git fsck`、
  对象/引用检查和仓库备份，再决定温和的 Git 维护；不得直接 destructive prune。
- 扩展独立详情页功能正常但视觉弱于其他界面：登记到 Stage 7C 的体验一致性范围。

### 7A 退出门

- 内部版本标签精确指向生产验证提交并已核验。
- Stage 1–6 仍为 `Done`；Stage 7 及其边界可从 roadmap 和本规格直接理解。
- `CHANGELOG.md`、`RELEASE.md`、入口 README 和五份当前文档完成 review，所有链接
  与秘密扫描通过。
- Stage 1–6 历史资料可从归档索引追溯，QA 证据没有丢失。
- 多角度审查完成，所有内测阻塞项均有明确处置。
- 五项已知技术债均有 owner/决定/复查条件，不要求全部在 7A 内消失。

完成证据：
[`qa/2026-07-15-internal-beta-productization-stage7a.md`](../qa/2026-07-15-internal-beta-productization-stage7a.md)。

## Stage 7B：身份模型与轻量加固

Stage 7B 必须先把当前真实语义写清楚，再修改实现。当前“姓名 + 本地身份 Token +
小组会话 + 邀请码”是轻量身份，不是可验证的个人账号；姓名不是唯一标识，也不能
证明现实身份。换浏览器、清除存储或换设备可能创建新身份，当前没有跨设备恢复或
账号合并。成员移除只撤销对应 membership/session 的能力，不能阻止同一个人换姓名
或换设备再次创建身份。

Stage 7B 应完成：

- `identity-and-security.md` 与 `decisions/0001-lightweight-identity.md`，记录威胁模型、
  能力边界、明确不承诺的能力和本阶段接受的风险。
- 梳理身份创建、会话签发/过期、邀请码轮换、成员移除、设备丢失、存储清理和重新
  加入的完整状态流，并为关键边界补测试。
- 在不引入正式账号系统的前提下完成必要的轻量加固，例如清晰的身份确认/重置 UX、
  会话失效处理、敏感值不落日志/文档、移除后的授权复验和管理员可解释操作。
- Extension 在没有 active group 时只进入 onboarding，不再携带默认
  `dev-read-token` 或回退到 legacy recommendation/feedback API。
- 先停用/移除共享 legacy session、read token 和默认小组路由，再清理由此成为死代码
  的环境变量与认证模块。`Teammate` 默认继续作为历史推荐归因记录；删除模型必须另有
  现行规格、迁移与历史保存验证。
- 为公开身份/小组/加入入口增加 Railway proxy-aware、按路由风险分级的 rate limit；
  建立覆盖同源 Admin、本地 Vite、unpacked/unlisted Extension 的 CORS 测试矩阵。
  CORS 不能代替认证或 rate limit。
- 核验生产 `ALLOW_PUBLIC_GROUP_CREATION` 的非敏感布尔状态，明确 beta 策略并让环境
  文档、默认值、启动校验和路由测试一致；不能仅凭本地默认值推断生产已开放。
- 为关键 Server 错误增加不泄露 Token/PII 的业务上下文，并补一个真实 PostgreSQL
  并发 refresh 集成测试。现有 partial unique index 和 verifier 的真实数据库证据保留。
- 先通过 ADR 决定 PII 保留、导出、删除/匿名化及 last-admin、历史归因影响；本规格
  不预先批准自助删除 endpoint 或 cascade 策略。
- 明确哪些问题必须等正式账号体系解决；Stage 7B 不以 OAuth、邮箱登录或账号合并
  作为默认方案。

退出门：普通同事在加入内测前能理解“我是谁、数据存在哪里、换设备会怎样、被移除
意味着什么”，且高风险授权边界有自动化验证和可执行的恢复/支持说明。新安装不得
请求 legacy API；legacy public endpoints 必须关闭或具有明确、限时且经过测试的保护；
rate limit、Origin 策略、生产小组创建策略和真实 PostgreSQL 并发测试均有证据。

## Stage 7C：品牌、体验一致性与分发

Stage 7C 将已验证的产品能力包装成一致的内部产品，而不是扩大产品范围：

- 确认产品名称、Logo、Chrome 扩展全套图标、颜色/排版与空态/错误态语言。
- 统一 Admin、Popup、设置页和独立详情页；修复详情页原生按钮、品牌标记、重复设计
  token、内部 `Stage 5C` 文案、默认 API onboarding 和重复 `<h1>`。
- 补齐 Admin Modal 键盘 focus trap，并让 Admin/Extension QuickAdd 的 lost-response
  retry 不会静默创建重复推荐。
- 在 `decisions/0002-extension-distribution.md` 中决定本轮使用版本化 unpacked 包还是
  Chrome Web Store unlisted，并记录更新、撤回、权限和维护成本。
- 产出版本化扩展构建物、校验值、安装/升级/卸载说明、权限说明、隐私边界、反馈入口
  和必要的截图/分发文案。构建物不得包含真实邀请码、Token、Secret 或开发地址。
- 进行真实 Chrome 安装、升级、通知、详情页、390px Admin 和回滚烟测。

分发验收必须随 ADR 分支：unpacked 方案提供受控人工升级、版本核对和撤回流程；只有
unlisted/store 方案要求自动更新到现有安装。Stage 7C 使用 7B 加固后的新版本，不把
`v0.1.0-internal` 基线标签冒充成可分发版本。

退出门：内测者不需要开发仓库背景也能独立安装、理解权限、完成核心午饭循环并知道
如何反馈或退出；版本与服务端兼容边界可追溯。

## Stage 7D：小范围同事内测与运营闭环

Stage 7D 是内测过程，不阻塞内测启动。先限定小规模真实同事和明确时间窗，再扩大：

- 在现有 Fastify/Pino 结构化日志、健康/就绪、部署 revision 和数据库 verifier 基础上
  建立最小监控与运维节奏；补充告警和提醒送达/失败观察，而不是误报为“当前没有
  结构化日志”。遥测不得收集 Token、邀请码或与午饭决策无关的个人数据。
- 建立单一反馈入口和分类：安装、身份、推荐质量、解释、提醒、权限、数据维护和体验。
- 记录关键运营信号：成功加入率、首次获得推荐的时间、推荐/决定/反馈完成情况、提醒
  打扰投诉、身份重复或恢复请求；具体口径在 7D 计划中定义。
- 约定支持、故障响应、回滚和停止内测条件，并定期回顾已知问题。
- 用真实身份摩擦和支持成本决定是否需要正式账号体系。决策结果写入 ADR；只做决策，
  不在本规格中预先承诺下一阶段实现。

7D 的监控、告警和提醒观察是 beta 期间必须建立并持续验证的运营能力，不倒置为
7A–7C 的启动前退出门；一旦达到预先定义的停止条件，应暂停扩容并执行支持/回滚流程。

Stage 7 完成的证据包括：7A–7C 全部退出门通过，一轮受控同事内测完成，问题与指标
有记录，账号体系形成明确的继续/不继续/延后决定，并留下可运营、可回滚的内部版本。

## 非目标

- 不建设餐厅发现、地图、外卖、支付或社交评价平台。
- 不因“产品化”默认引入 OAuth、邮箱登录、复杂权限或机器学习排序。
- 不在 Stage 7A 文档重组中顺便重写业务模块。
- 不在没有单独审批的情况下删除旧数据库、清理生产数据或 destructive prune Git 对象。
- 不提前写 Stage 8 的详细实现计划。
