# Stage 7D 手动 QA

Status: `Wheel pending; POI not started`

Date: 2026-07-22

本清单用于受控、可回滚的真实浏览器验证。自动化证据和当前阻塞项见
[Stage 7D.1 wheel QA 记录](../../qa/2026-07-22-controlled-colleague-beta-stage7d-wheel.md)；
行为边界见[幸运餐厅大转盘说明](../features/lucky-restaurant-wheel.md)。

除非条目标为已完成并附有证据，否则不得把它描述为通过。不要在文档、截图或日志中
记录 identity token、group session token、邀请码或生产变量值。

## Wheel 测试前置条件

- [x] 普通推荐同分顺序隔离已用 TDD 修复；Server 306 tests 和 typecheck 通过。
- [x] code review 的 pending acceptance 重试和 stale reconnect 阻塞项均已修复并有
  回归测试。
- [x] `pnpm test`、`pnpm typecheck`、`pnpm build` 和其余
  [测试与发布门禁](../testing-and-release.md)在同一 candidate commit 通过。
- [x] `0.3.0` internal Extension 已从干净 worktree 严格打包；source commit 为
  `395ccb0fda52c1a625c490e1ad5a5ca7036bc798`，SHA-256 为
  `ab671c5703a92b5ac6942bd3b40b5435a887b9e8a5f69271085cef27d6219702`，stable ID 为
  `bbkeaogleldgfnkgebdhdbiohlmonbkk`。
- [ ] Server 先以 `LUCKY_RESTAURANT_WHEEL_ENABLED=false` 和空 group allowlist 部署。
- [ ] `/api/health`、`/api/ready`、runtime revision 和只读数据库 verifier 通过。
- [ ] 选择一个明确批准的测试 group ID；当前没有批准值。
- [ ] 准备 0、1、2、8 和超过 8 家 active 候选的可恢复测试数据，不删除生产数据。

## 安装与 feature gate

- [x] 操作者已加载 unpacked candidate、点击 **Reload** 并成功打开一次 Popup；Chrome
  可见的设置页 URL 确认 Extension ID 为 `bbkeaogleldgfnkgebdhdbiohlmonbkk`。
- [ ] 在 `chrome://extensions` 开启 Developer mode，以 **Load unpacked** 加载
  `apps/extension/dist`，确认名称、`0.3.0` 和权限。ID 已按上一条确认。
- [ ] flag 全关时打开 Popup：不显示「转一下」，且 DevTools Network 中没有 wheel
  candidate 请求。
- [ ] 全局 flag 开、allowlist 空时仍关闭；非 allowlisted group 仍关闭。
- [ ] 只加入批准的 group ID 后 capability 与 wheel route 开启；切换到其他 group
  立即恢复关闭语义。
- [ ] 无效、过期或被移除 membership 无法通过直接 route 调用读取候选。

## 候选与模式

- [ ] 0 家候选显示无可用候选提示，不能抽签。
- [ ] 1 家候选显示候选不足提示，不能抽签。
- [ ] 2 家和 8 家候选能正常显示、抽签和接受。
- [ ] 超过 8 家时只显示 Server 稳定排序后的前 8 家；普通推荐仍保持 3 家和原有顺序。
- [ ] 当前成员当日 `skip` / `avoid` 的餐厅不会入盘；其他成员反馈不会被误当作当前成员
  的硬排除。
- [ ] 「纯手气」每家签数和概率一致。
- [ ] 「懂你一点」只显示 1–3 张签，最高/最低概率不超过 3:1；同分候选概率相同。
- [ ] 7 天内已决定去过的餐厅降低一档；其余推荐理由仍来自 Server 候选。
- [ ] 盘内编号、扇区大小与盘下签数/概率一致，概率总和为 100%（允许显示舍入误差）。

## 结果、会话与失败恢复

- [ ] 点击抽签后业务结果立即锁定，约 3 秒动画停止在同一候选；无第二次随机。
- [ ] 首次抽签后模式不可更改，只能再转一次；第二次后按钮明确显示次数耗尽。
- [ ] 排除仅从本轮候选移除并重新计算概率；餐厅和长期反馈没有被写入或删除。
- [ ] 「就这家」仅在 participation PUT 成功后显示已接受；现有推荐视图同步显示决定。
- [ ] 模拟首次 participation 响应丢失/失败后，重试会对同一 pending acceptance 对账，
  不重新开放抽签。
- [ ] 抽签、排除和接受各阶段关闭并重新打开 Popup，结果、次数和模式按
  `luckyWheelSession.v1` 恢复。
- [ ] 同 group 正常 session token 续期保留 wheel 会话；切换 group、identity、
  membership 或 API origin 清理旧会话。
- [ ] reset/reconnect 前发起的迟到 candidate 或 participation response 被丢弃，不污染
  新上下文。
- [ ] 网络错误、无 batch、候选状态变化和 Server 关闭 capability 均显示可恢复提示，
  cached recommendation 不允许新抽签、排除或接受。

## 键盘、辅助技术与 reduced motion

- [ ] 只使用键盘可在「给我推荐 / 转一下」、模式、抽签、接受、重转、排除和返回之间
  移动并触发；焦点顺序可预测且始终可见。
- [ ] 模式由 screen reader 宣告为有 legend 的 radio group，并读出选中/禁用状态。
- [ ] 抽签期间 screen reader 获知 busy 状态；结果只宣告一次，焦点移至结果标题。
- [ ] 候选编号、名称、签数和概率可被辅助技术读取；结果和状态不只依赖颜色。
- [ ] 在系统启用 reduced motion 后重新打开 Popup：同一业务结果直接出现，不播放长旋转
  或纸屑，功能和焦点行为不变。
- [ ] 在 390–412 × 600 Popup 尺寸验证入口首屏可见、8 家列表可滚动、按钮无截断或遮挡。

## 原有功能回归

- [ ] 「给我推荐」返回已加载推荐，不隐式 refresh。
- [ ] fresh、empty、cached、loading、error 和未连接 Popup 状态保持原语义。
- [ ] 推荐卡、详情、participation、反馈、QuickAdd 和 Options 导航仍正常。
- [ ] background reminder、通知点击打开 Popup 和 `lunchState` 恢复不受影响。
- [ ] Extension 重载和同版本目录替换后身份、group、提醒、推荐缓存与 wheel 会话符合
  [内部 Extension 分发说明](../extension-internal-distribution.md)。

## 受控 rollout 与回滚

- [ ] 在同一 candidate commit 保存自动化、构建、包校验、Chrome 版本和手工 QA 证据。
- [ ] 只在上述条目通过且获得明确批准后设置一个 cohort group ID；不记录实际 ID。
- [ ] 验证 allowlisted group 可用、非 allowlisted group 不可用，并观察 Server 4xx/5xx、
  接受失败、重转和排除反馈。
- [ ] 先验证从 allowlist 移除 group 或关闭全局 flag 能立即停止新请求。
- [ ] 若仍需 application rollback，恢复 Stage 7C deployment
  `03d744f6-a5bd-486c-ba65-3541dbfe9096`，重载匹配的 `0.2.0` Extension，并按
  [rollback runbook](../runbooks/rollback.md)完成 health、ready 和 verifier 检查。

## POI

Stage 7D.2 尚未开始。POI 手动 QA 必须在独立 `spike/poi-reference-search` 分支实现后
补充；不得把本节 wheel 验证当作 POI 数据源、保存边界或高德 Key 的验证。
