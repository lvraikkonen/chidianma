# Stage 7D：受控同事内测（Controlled Colleague Beta）

Status: `Approved — Stage 7D.0 Complete, Stage 7D.1 In Progress`

Date: 2026-07-20

## 背景与目标

Stage 7A–7C 已完成身份加固、生产部署、品牌、真实 Chrome QA 与受控 unpacked
分发。Stage 7D 面向有限数量、自愿参与的同事，在不扩大为完整餐厅平台的前提下，
增加两个相互独立的受控工作流：

1. 优先实现「幸运餐厅大转盘」；
2. 随后在独立分支验证「附近餐厅候选搜索与辅助录入」。

本项目仍是个人开发、非盈利、无广告、无付费功能的实验项目，不是公司正式立项，
也不是官方内部管理系统。

## 范围边界

本阶段不实现：

- 完整餐厅发现、地图、外卖、评论、图片、榜单或批量导入平台；
- 美团网页抓取或 App 接口逆向；
- 自动后台同步、长期第三方 POI 缓存或 raw response 持久化；
- 正式账号、OAuth、复杂个人画像、机器学习、协同过滤或 N 天公平算法；
- 支付、积分、真实奖品或无限重转；
- 与两个工作流无关的 UI 或后端重构。

当前系统真正存在的全局候选硬条件只有 `Restaurant.status = "active"`。距离、价格、
团队当天负反馈等当前属于评分信号，不是硬上限；仓库也没有饮食禁忌、营业时间、
长期个人排除或预算上限模型。Stage 7D.1 只复用现有 active 硬条件，并在入盘前
硬过滤当前 membership 对当前 office date 已提交的 `skip` 或 `avoid`；历史负反馈和
其他成员的反馈仍按现有评分语义处理。本轮临时排除只影响 wheel session。不声称
执行不存在的规则，也不为此扩大推荐模型。

## Stage 7D.0：基线冻结

- 基线 commit：`072ce70abda268f2cdf4fea1a349c16a976e70b5`。
- annotated tag：`v0.2.0-internal`。
- tag 已推送 origin，远程 peeled commit 与基线 commit 一致。
- 当前生产运行时仍是 Stage 7C Railway deployment
  `03d744f6-a5bd-486c-ba65-3541dbfe9096`，来源 commit
  `e9912c9cc72e237b0baa1aa922b3f49c5473f66a`。
- `072ce70` 只包含文档变更；对应 Railway deployment
  `029815eb-e635-45d9-8254-289fb760e6ff` 因 watch path 无运行时变化而 skipped。
- Stage 7D.1 使用 `feat/lucky-restaurant-wheel`；Stage 7D.2 只能在 7D.1 合入后从
  更新后的 main 创建 `spike/poi-reference-search`。

## Group-scoped feature capabilities

Server 是功能开关的权威来源。新增 group-session 认证接口：

```http
GET /api/groups/:groupId/capabilities
```

```ts
interface GroupCapabilitiesResponse {
  groupId: string;
  features: {
    luckyRestaurantWheel: boolean;
    poiReferenceSearch: boolean;
    poiReferenceDraft: boolean;
    poiOfficePreset: boolean;
    poiProvider: "mock" | "amap" | null;
  };
}
```

开关默认全部关闭，有效状态必须同时满足全局开关、`groupId` allowlist 和 provider
配置。`poiOfficePreset` 还必须有当前 group 的明确坐标系配置。Extension 获取
capabilities 失败时按全部关闭处理；业务路由必须再次校验，
不能只依赖隐藏按钮。

## Stage 7D.1：幸运餐厅大转盘

### 候选来源

新增只读、group-scoped wheel candidate API。它要求当前 recommendation batch 已存在，
读取 batch 的 office date、天气快照、评分权重和算法版本，使用当前推荐 scorer 重新
生成最多 8 个候选，但不改变或持久化当前 3 条推荐批次语义。

候选规则：

- 仅包含当前 group 的 active 餐厅；
- 入盘前排除当前 membership 在当前 office date 已标记 `skip` 或 `avoid` 的餐厅；
- 复用现有可解释评分；
- 分数降序，同分按 `restaurantId` 升序；
- 0 或 1 个候选时不抽签并显示明确提示；
- 最近 7 天信号来自当前 membership 的
  `DailyParticipation(status="decided")`；
- 本轮排除只保存在 wheel session，不写成永久 `avoid` 或停用餐厅。

### 模式和票数

```ts
type WheelMode = "equal" | "weighted";
type RandomSource = () => number;
```

- 纯手气：每家 1 张签；
- 懂你一点：
  - 所有推荐分相同时全部 1 张签，近期记录不打破相等概率；
  - 否则对最小/最大分线性分档为 1、2、3 张；
  - 最近 7 天选择过的餐厅降低一档，最低 1 张；
  - 本版不增加“长时间没去提高一档”的新窗口；
- 概率严格等于 `tickets / totalTickets`，最大差不超过 3:1。

正式环境使用 `crypto.getRandomValues`。业务逻辑只抽一次并保存结果，动画使用同一
结果计算终止角度，不再次随机，也不根据帧率或停止位置决定结果。扇区角度按签数
比例生成，并同步显示编号、名称、签数和概率。

### UI、重转和可访问性

- Popup 保留 `[给我推荐] [转一下]`，默认「懂你一点」；
- 结果显示餐厅、可用辅助信息、推荐/中奖理由、就这家、再转一次、排除此餐厅；
- 第一抽为 `spinNumber=1`，最多第二抽；排除后重算概率，下一抽消耗第二次机会；
- 第二抽后可以移除结果但不允许第三抽；
- 「就这家」复用现有 group participation API；
- 使用 `luckyWheelSession.v1` 按 `groupId + officeDate + batchId` 保存最小会话，防止
  关闭 Popup 绕过次数；batch/group/API origin 变化时清理；
- `prefers-reduced-motion` 下不执行长旋转，只直接显示或短淡入；
- 所有操作可键盘完成，结果通过 `aria-live` 宣告，信息不只依赖颜色。

Stage 7D.1 不需要 Prisma migration，不新增 spin event 表，不修改 Manifest 权限、
background、alarm 或 reminder runtime。

## Stage 7D.2：POI 候选搜索与辅助录入

### Provider 策略

本轮只实现 Mock + 高德，OSM/Overpass 延后，美团保持 forbidden。

```ts
type PersistencePolicy = "allowed" | "contract_only" | "forbidden";

type CoordinateSystem = "WGS84" | "GCJ02" | "BD09";

interface GeoPoint {
  latitude: number;
  longitude: number;
  coordinateSystem: CoordinateSystem;
}
```

- Mock：`persistentImport="allowed"`，用于稳定开发、分页、错误和显式保存测试；
- 高德：`persistentImport="contract_only"`，默认只允许会话内搜索展示；
- OSM：未实现、关闭；
- 美团：未实现、`forbidden`。

高德当前只有普通账号、应用和 Web 服务 Key，没有关于把 POI 派生字段写入自有餐厅
数据库的工单或书面确认。因此 `poiReferenceDraft=false`，高德结果不得生成可保存
草稿。取得确认后，必须记录批准引用并单独开启保存开关；这属于工程风险控制，
不是绝对法律结论。高德协议和接口以当前官方文档为准：

- [POI 搜索](https://lbs.amap.com/api/webservice/guide/api-advanced/search)
- [地理编码](https://lbs.amap.com/api/webservice/guide/api/georegeo/)
- [坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)
- [开放平台服务协议](https://lbs.amap.com/pages/terms/)

### 高德调用边界

- Key 只存 Server/Railway secret，不进入 Extension、仓库、日志或响应；
- 周边搜索按用户提供的标准 Web 服务文档使用 `/v3/place/around`，固定
  `types=050000`、`sortrule=distance`、`offset=20`，本产品最多 3 页/60 条；
- 固定 `extensions=base`，不请求评分、消费、电话、图片、商业标签或导航信息；
- 地址解析使用 `/v3/geocode/geo`；
- 现有 office 经纬度没有 coordinate-system 元数据；天气集成虽将它们作为 WGS84
  使用，但 POI 不得因此无条件推定来源。只有在部署配置中为 allowlisted group
  明确记录 `WGS84` 或 `GCJ02` 后才启用 office preset；未配置或来源不明时保持关闭；
- WGS84 中心点在调用高德前通过官方 coordinate convert 转为 GCJ02；GCJ02 不重复
  转换；
- 高德返回坐标明确标记为 GCJ02，距离只在同一坐标系内计算；
- 本版不显示地图、不保存坐标、不返回高德 POI ID；
- 生产开启前核验 Web 服务 Key 的出口 IP 白名单；没有稳定、已验证出口 IP 时保持关闭；
- provider raw response 不进入 Prisma、`chrome.storage` 或普通日志。

### 搜索和草稿流程

搜索默认 office preset、3000 米，允许 500–5000 米和用户显式地址解析。支持 loading、
无结果、分页、timeout、rate limit、provider error、AbortController 取消、迟到响应丢弃、
本地名称/类型防抖过滤和距离排序。flag 关闭时不得调用 provider。

每个归一化搜索页必须包含 provider 名称、可展示 attribution 文本及必要的官方链接，
UI 在候选列表中始终展示数据来源。搜索结果只存在当前 Popup 会话。Mock 结果可以创建
内存 QuickAdd 草稿，用户仍必须
填写或确认字段并点击现有保存按钮；取消、返回或关闭 Popup 不写入。高德在许可开关
关闭时只显示「当前仅供会话内参考，暂未开放带入保存」。

本阶段不新增 `RestaurantOrigin`、provider ID、坐标或 raw payload 字段，因此不需要
Prisma migration。

## 发布顺序与退出门

1. 7D.0：冻结并记录基线；
2. 7D.1：完成 wheel 自动化、真实 Chrome QA，以 flags 全关部署，再对少量 group 开启；
3. 7D.2：从已包含 wheel 基础设施的 main 创建独立 POI 分支，先 Mock 后高德只读 spike；
4. 7D.3：小范围 rollout、人工反馈、故障修复和是否扩大 provider/个性化的决策。

实施过程必须按阶段维护
`docs/features/lucky-restaurant-wheel.md`、`docs/features/poi-reference-search.md`、
`docs/architecture/poi-provider.md` 和 `docs/manual-qa/stage-7d.md`；发布基线继续记录在
`docs/releases/stage-7d-colleague-beta-2026-07-20.md`。

任何身份授权绕过、group 数据隔离问题、静默落库、Key 泄漏或无法立即通过 flag 停止
新功能的情况，均暂停扩容并执行回滚。数据库没有本阶段 migration，首选回滚是关闭
feature flag；必要时恢复 Stage 7C application deployment 和 Extension 0.2.0。
