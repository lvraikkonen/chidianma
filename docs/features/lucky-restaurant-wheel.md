# 幸运餐厅大转盘

Status: `Stage 7D.1 verified source/package candidate; default off; rollout blocked`

Date: 2026-07-22

幸运餐厅大转盘是现有午餐推荐旁的游戏化选择入口。它只在 Server 已经应用现有硬约束、
评分和稳定排序后返回的至多 8 家候选中抽取，不扩大推荐引擎，也不表示博彩、金钱、
实物奖品或长期用户画像。

当前 source candidate 已通过全仓自动化、双轴 source review 和严格 `0.3.0` 打包，
但尚未部署或分发给同事 cohort。完整范围以
[Stage 7D 规格](../../specs/2026-07-20-controlled-colleague-beta-stage7d-design.md)和
[实施计划](../../plans/2026-07-20-controlled-colleague-beta-stage7d.md)为准。

## 用户流程

1. Popup 在 fresh recommendation 状态下向 Server 获取当前 group capabilities。
2. 只有 capability 开启时才显示「给我推荐 / 转一下」入口；cached、未连接或失败状态
   不允许发起新抽签。
3. Server 从当前 recommendation batch 只读生成 0–8 家候选，不创建或刷新 batch。
4. 用户选择「纯手气」或默认的「懂你一点」，再开始抽签。
5. 业务层先确定结果，UI 再播放约 3 秒动画；动画停止位置不决定结果。
6. 用户可以接受、排除本轮候选，或在首次结果后再转一次。排除不会写入长期偏好。
7. 「就这家」复用现有 participation 写路径；Server 返回成功前不显示已接受。

0 或 1 家候选时给出明确提示，不进入转盘。现有「给我推荐」、QuickAdd、缓存、提醒和
详情流程保持不变。

## 候选、签数和概率

- Server 复用现有推荐候选构造，当前普通推荐仍取 3 家，wheel 最多取 8 家。
- 候选保持 active-only、分数降序；同分按 `restaurantId` 升序，超过 8 家在 Server
  稳定截断。
- 当前成员在当日对餐厅提交 `skip` 或 `avoid` 时，该餐厅不会进入本次转盘。其他成员
  反馈和历史负反馈仍只作为现有评分信号。
- 「纯手气」为每家 1 张签。
- 「懂你一点」根据现有推荐分分配 1–3 张签；分数完全相同时签数相同，最近 7 天已决定
  去过的餐厅降低一档，最终概率差不超过 3:1。
- 概率为候选签数除以总签数。转盘扇区、候选列表中的签数和概率使用同一份累计概率，
  不存在独立的隐藏随机。
- shared 算法接收注入的 `RandomSource`；生产使用 `crypto.getRandomValues`，测试使用
  固定随机值。

## 权威边界和会话状态

capability 与 wheel candidate route 都由 Server 以 group session、active membership、
全局开关和精确 group allowlist 独立校验。Extension 获取失败时 fail closed；仅隐藏 UI
不能绕过 Server gate。

Extension 使用独立的 `luckyWheelSession.v1` 保存 group、office date、batch、算法版本、
抽签次数、最小签数映射、最后结果绑定和单个被选候选的 normalized 展示快照。它不保存
bearer token、完整候选响应、全部候选快照或新个人敏感信息。既有 `lunchState` 只新增
additive、migrate-on-read 的 `authorizationRevision`，没有引入新的全局 storage schema
版本。

首次抽签后模式锁定；最多允许两次抽签。接受采用
`acceptancePending → participation PUT → accepted` 两阶段状态，避免网络不确定时重新
开放抽签。待确认或已接受结果可以用单个选中候选快照在同日 batch/算法/候选变化后恢复；
待确认状态只能重试原选择，不能重转或排除。group、identity、membership 或 API origin
改变时清理 wheel session；同一 group 的正常 token 续期不清理。新身份连接、reset、
disconnect 和 API replacement 会推进 `authorizationRevision`，阻止旧异步响应继续写入。

本功能没有 Prisma migration、spin event 表或 Manifest 权限变化。Extension source
candidate 为 `0.3.0`，稳定 ID、`alarms / notifications / storage` 权限和精确生产 host
保持不变。

## 可访问性

- 模式使用原生 `fieldset` 和 radio，所有操作均为可键盘访问的原生控件。
- 转盘图形对辅助技术隐藏；相邻结构化列表提供候选编号、名称、签数和概率。
- 抽签期间容器使用 `aria-busy`，结果通过启动时已存在的 polite live region 宣告，并
  把焦点移到结果标题。
- 状态不只依赖颜色；按钮和模式有明确可读标签。
- `prefers-reduced-motion: reduce` 时跳过长旋转和纸屑，直接完成同一个已预选结果。

真实 Chrome 键盘和 screen reader 验证仍是发布阻塞项，见
[Stage 7D 手动 QA](../manual-qa/stage-7d.md)和
[Stage 7D.1 wheel QA 记录](../../qa/2026-07-22-controlled-colleague-beta-stage7d-wheel.md)。

## Feature flags 与 rollout

```text
LUCKY_RESTAURANT_WHEEL_ENABLED=false
LUCKY_RESTAURANT_WHEEL_GROUP_IDS=
```

两项必须同时满足才会为某个 group 开启。生产当前保持 unset/empty，因此等价于关闭；
当前没有批准的 cohort group ID。

rollout 顺序：

1. 已完成 source review、完整自动化退出门和严格 `0.3.0` Extension 打包。
2. 以 flags 全关部署 Server，验证 health、ready 和只读数据库 verifier。
3. 在真实 Chrome 完成键盘、screen reader、reduced-motion 和原功能回归手动 QA。
4. 经明确批准后只加入一个测试 group ID，观察接受、重转、排除和错误反馈。
5. 出现授权绕过、group 隔离、结果不一致或无法立即关闭时，先移除 allowlist 或关闭
   全局 flag；必要时按[运维说明](../operations.md)恢复 Stage 7C Server deployment 和
   `0.2.0` Extension。

Extension 安装、升级和回滚遵循
[内部 Extension 分发说明](../extension-internal-distribution.md)。当前工程实现按最小
数据保存原则设计；第三方数据使用权限仍以适用条款和书面确认结果为准。

## 当前已知限制

- 三项 source review 问题均已用回归测试修复；rollout 仍被真实 Chrome、辅助技术、
  flags-off 部署/验证和 cohort 审批门禁阻塞。
- 极少数两个 Popup 同时接受同一持久化结果时，第二个 Popup 可能保留旧的内存
  participation 摘要，重新打开后恢复；Server 决定和持久化 wheel session 仍为权威，
  且不会重新开放抽签。
- 现有推荐硬约束只覆盖仓库当前已经实现的状态和反馈边界；本阶段不假装新增距离、预算、
  营业状态或饮食禁忌数据。
