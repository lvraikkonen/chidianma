import type {
  DashboardResponse,
  RecommendationHistoryBatch,
  ScoreBreakdown,
  ScoringWeightsSnapshot
} from "@lunch/shared";
import { useEffect, useRef, useState } from "react";
import { AdminApiError } from "../api";
import { createRequestGate } from "../app/requestGate";
import { getDashboard, getHistory } from "../clients/operations";
import type { AdminGroupContext } from "../clients/today";
import { StatusPanel } from "../components/StatusPanel";
import {
  appendHistory,
  loadDashboardWorkspace,
  markHistoryLoading,
  type DashboardWorkspaceState
} from "../features/dashboard/dashboardModel";

export function DashboardPage(props: {
  context: AdminGroupContext;
  onMembershipInvalid: (error: unknown) => void | Promise<void>;
  onOpenToday: () => void;
  onOpenRestaurants: () => void;
}) {
  const [state, setState] = useState<DashboardWorkspaceState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const gate = useRef(createRequestGate());

  useEffect(() => {
    const context = { ...props.context };
    const request = gate.current.begin();
    setState({ kind: "loading" });
    setExpandedBatchIds(new Set());
    void loadDashboardWorkspace({
      getDashboard: () => getDashboard(context),
      getHistory: (cursor) => getHistory(context, cursor)
    }).then((next) => {
      if (!gate.current.isCurrent(request)) return;
      if (next.kind === "session-expired" || next.kind === "forbidden") {
        void props.onMembershipInvalid(membershipError(next.kind));
        return;
      }
      setState(next);
    });
    return () => gate.current.invalidate();
  }, [props.context.groupId, props.context.token, reload]);

  async function handleLoadMore() {
    if (state.kind !== "ready" || state.history.kind !== "ready" || !state.history.nextCursor) return;
    const context = { ...props.context };
    const loading = markHistoryLoading(state);
    setState(loading);
    const request = gate.current.begin();
    const next = await appendHistory(loading, (cursor) => getHistory(context, cursor));
    if (!gate.current.isCurrent(request)) return;
    if (next.kind === "session-expired" || next.kind === "forbidden") {
      await props.onMembershipInvalid(membershipError(next.kind));
      return;
    }
    setState(next);
  }

  return (
    <DashboardView
      state={state}
      expandedBatchIds={expandedBatchIds}
      onToggleBatch={(batchId) => setExpandedBatchIds((current) => {
        const next = new Set(current);
        if (next.has(batchId)) next.delete(batchId);
        else next.add(batchId);
        return next;
      })}
      onRetry={() => setReload((value) => value + 1)}
      onLoadMore={handleLoadMore}
      onOpenToday={props.onOpenToday}
      onOpenRestaurants={props.onOpenRestaurants}
    />
  );
}

export function DashboardView(props: {
  state: DashboardWorkspaceState;
  expandedBatchIds: Set<string>;
  onToggleBatch: (batchId: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenToday?: (() => void) | undefined;
  onOpenRestaurants?: (() => void) | undefined;
}) {
  if (props.state.kind === "loading") {
    return <StatusPanel title="推荐记录" message="正在读取团队概览和推荐批次…" />;
  }
  if (props.state.kind === "session-expired" || props.state.kind === "forbidden") {
    return <StatusPanel title="当前小组连接不可用" message="正在返回小组入口…" tone="error" />;
  }

  const timezone = props.state.dashboard.kind === "ready"
    ? props.state.dashboard.value.officeTimezone
    : undefined;

  return (
    <section className="dashboard-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">批次复盘 + 团队概览</span>
          <h1>推荐记录</h1>
          <p className="lead">查看团队最近吃了什么，以及每一批推荐当时为什么这样排序。</p>
        </div>
        {props.onOpenToday ? (
          <button className="button primary" type="button" onClick={props.onOpenToday}>查看今日推荐</button>
        ) : null}
      </header>

      {props.state.dashboard.kind === "error" ? (
        <StatusPanel title="团队概览加载失败" message={props.state.dashboard.message} tone="error" action={
          <button className="button secondary" type="button" onClick={props.onRetry}>重试</button>
        } />
      ) : (
        <DashboardSummary
          response={props.state.dashboard.value}
          {...(props.onOpenRestaurants ? { onOpenRestaurants: props.onOpenRestaurants } : {})}
        />
      )}

      <section className="history-panel panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">完整批次快照</span>
            <h2>推荐批次记录</h2>
          </div>
        </div>
        {props.state.history.kind === "error" ? (
          <StatusPanel title="推荐记录加载失败" message={props.state.history.message} tone="error" action={
            <button className="button secondary" type="button" onClick={props.onRetry}>重试</button>
          } />
        ) : props.state.history.items.length === 0 ? (
          <div className="empty-state"><h2>还没有推荐批次</h2><p>生成今日推荐后，批次会保存在这里。</p></div>
        ) : (
          <div className="history-list">
            {props.state.history.items.map((batch) => (
              <BatchDisclosure
                batch={batch}
                timezone={timezone}
                expanded={props.expandedBatchIds.has(batch.batchId)}
                onToggle={() => props.onToggleBatch(batch.batchId)}
                key={batch.batchId}
              />
            ))}
            {props.state.history.loadMoreError ? <p className="inline-error">{props.state.history.loadMoreError}</p> : null}
            <div className="history-footer">
              {props.state.history.nextCursor ? (
                <button className="button secondary" type="button" disabled={props.state.history.loadingMore} onClick={props.onLoadMore}>
                  {props.state.history.loadingMore ? "正在加载…" : "加载更多"}
                </button>
              ) : <span className="muted-note">已经看到全部批次</span>}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function DashboardSummary(props: { response: DashboardResponse; onOpenRestaurants?: (() => void) | undefined }) {
  const { response } = props;
  const difference = response.currentWeek.decidedCount - response.previousWeek.decidedCount;
  const totalRestaurants = response.restaurantCounts.active
    + response.restaurantCounts.paused
    + response.restaurantCounts.blocked;
  return (
    <>
      <div className="dashboard-kpis">
        <Metric label="今日已决定" value={`${response.today.decidedCount} / ${response.today.activeMemberCount} 人`} detail={`参与 ${response.today.joiningCount} · 不参与 ${response.today.awayCount} · 未决定 ${response.today.undecidedCount}`} />
        <Metric label="本周决定记录" value={`${response.currentWeek.decidedCount} 条`} detail={weekDifference(difference)} />
        <Metric
          label="团队人均"
          value={response.currentWeek.averagePrice.status === "ready"
            ? `¥${Math.round(response.currentWeek.averagePrice.averagePriceCents / 100)}`
            : "数据不足"}
          detail={response.currentWeek.averagePrice.status === "ready"
            ? `${response.currentWeek.averagePrice.pricedDecisionCount} 条有价格记录`
            : "至少需要 3 次决定和 2 名成员"}
        />
        <Metric label="餐厅库" value={`${totalRestaurants} 家`} detail={`${response.restaurantCounts.active} 启用 · ${response.restaurantCounts.paused} 暂停 · ${response.restaurantCounts.blocked} 避雷`} />
      </div>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="section-heading"><h2>近 7 天热餐厅</h2><span>最多 5 家</span></div>
          {response.topRestaurants.length === 0 ? <p className="muted-note">最近还没有已决定的餐厅。</p> : (
            <BarList items={response.topRestaurants.map((item) => ({
              label: item.restaurantName,
              detail: `${item.cuisine}${item.averagePriceCents === undefined ? "" : ` · ¥${Math.round(item.averagePriceCents / 100)}`}`,
              value: item.decisionCount,
              text: `${item.decisionCount} 次`
            }))} />
          )}
        </section>
        <section className="panel chart-panel">
          <div className="section-heading"><h2>类别分布</h2><span>近 7 天</span></div>
          {response.categoryDistribution.status === "insufficient" ? (
            <p className="muted-note">类别偏好数据不足（已有 {response.categoryDistribution.decidedCount} 条决定）。</p>
          ) : (
            <BarList items={response.categoryDistribution.items.map((item) => ({
              label: item.cuisine,
              value: item.percentage,
              text: `${item.percentage}% · ${item.decisionCount} 次`
            }))} />
          )}
        </section>
      </div>

      <section className="panel activity-panel">
        <div className="section-heading">
          <h2>最近新增</h2>
          {props.onOpenRestaurants ? <button className="button ghost compact" type="button" onClick={props.onOpenRestaurants}>管理餐厅库</button> : null}
        </div>
        {response.recentActivity.length === 0 ? <p className="muted-note">最近还没有新增餐厅或推荐。</p> : (
          <div className="activity-list">
            {response.recentActivity.map((item) => (
              <article className="activity-row" key={`${item.kind}-${item.occurredAt}-${item.recommendationId ?? item.restaurantId}`}>
                <span className="avatar" aria-hidden="true">{(item.memberName ?? "组").slice(0, 1)}</span>
                <div>
                  <strong>{activityText(item)}</strong>
                  <small>{formatTimestamp(item.occurredAt, response.officeTimezone)}{item.dish ? ` · ${item.dish}` : ""}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function BatchDisclosure(props: {
  batch: RecommendationHistoryBatch;
  timezone?: string | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { batch } = props;
  return (
    <article className={`batch-disclosure${props.expanded ? " expanded" : ""}`}>
      <button className="batch-summary" type="button" aria-expanded={props.expanded} onClick={props.onToggle}>
        <span className="batch-date"><strong>{batch.officeDate}</strong><small>批次 #{batch.batchNo}</small></span>
        <span className="batch-weather">{batch.weather ? batch.weather.summary : "历史天气不可用"}</span>
        <span className="batch-picks">{batch.recommendations.length > 0
          ? batch.recommendations.map((item) => item.restaurantName).join(" · ")
          : "本批次没有推荐结果"}</span>
        <span className="batch-decisions">{decisionSummary(batch)}</span>
        <span className={`status-badge ${batch.isCurrent ? "active" : "paused"}`}>
          {batch.isCurrent ? "当前批次" : "已被后续批次替代"}
        </span>
      </button>
      {props.expanded ? (
        <div className="batch-details">
          <dl className="batch-metadata">
            <div><dt>生成时间</dt><dd>{formatTimestamp(batch.generatedAt, props.timezone)}</dd></div>
            <div><dt>来源</dt><dd>{sourceLabel(batch.source)}</dd></div>
            <div><dt>生成者</dt><dd>{batch.generatedByName ?? "系统"}</dd></div>
            <div><dt>算法版本</dt><dd><code>{batch.algorithmVersion}</code></dd></div>
          </dl>
          <section className="snapshot-card">
            <h3>当时的评分权重</h3>
            <SnapshotGrid snapshot={batch.scoringWeightsSnapshot} />
          </section>
          <section className="snapshot-card">
            <h3>当天决定分布</h3>
            {batch.decisions.length === 0 ? <p className="muted-note">当天尚无决定。</p> : (
              <div className="decision-grid">
                {batch.decisions.map((decision) => (
                  <div className="decision-card" key={decision.restaurantId}>
                    <strong>{decision.restaurantName} · {decision.memberCount} 人</strong>
                    <span>{decision.members.map((member) => member.displayName).join("、")}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="snapshot-card">
            <h3>推荐结果与分数拆解</h3>
            {batch.recommendations.length === 0 ? <p className="muted-note">本批次没有推荐结果。</p> : (
              <div className="history-recommendations">
                {batch.recommendations.map((item) => (
                  <article className="history-result" key={`${item.rank}-${item.restaurantId}`}>
                    <header><span className="result-rank">#{item.rank}</span><strong>{item.restaurantName}</strong><b>{item.score} 分</b></header>
                    <p>{item.reason}</p>
                    <BreakdownGrid breakdown={item.scoreBreakdown} />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </article>
  );
}

const weightLabels: Record<keyof ScoringWeightsSnapshot, string> = {
  weekdayMatch: "星期匹配",
  weatherMatch: "天气匹配",
  distance: "距离",
  teammateRecommendation: "同事推荐",
  recentDuplicatePenalty: "近期重复惩罚",
  negativeFeedbackPenalty: "负反馈惩罚"
};

function SnapshotGrid(props: { snapshot: ScoringWeightsSnapshot }) {
  return <dl className="snapshot-grid">{(Object.keys(weightLabels) as Array<keyof ScoringWeightsSnapshot>).map((key) => (
    <div key={key}><dt>{weightLabels[key]}</dt><dd>{props.snapshot[key]}</dd></div>
  ))}</dl>;
}

function BreakdownGrid(props: { breakdown: ScoreBreakdown }) {
  return <dl className="history-breakdown">{(Object.keys(weightLabels) as Array<keyof ScoringWeightsSnapshot>).map((key) => (
    <div key={key}><dt>{weightLabels[key]}</dt><dd>{props.breakdown[key]}</dd></div>
  ))}<div className="total"><dt>总分</dt><dd>{props.breakdown.total}</dd></div></dl>;
}

function Metric(props: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{props.label}</span><strong>{props.value}</strong><small>{props.detail}</small></article>;
}

function BarList(props: { items: Array<{ label: string; detail?: string | undefined; value: number; text: string }> }) {
  const maximum = Math.max(...props.items.map((item) => item.value), 1);
  return <div className="bar-list">{props.items.map((item) => (
    <div className="bar-row" key={item.label}>
      <span className="bar-label"><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}</span>
      <span className="bar-track"><i style={{ width: `${Math.max(4, Math.round(item.value / maximum * 100))}%` }} /></span>
      <span className="bar-value">{item.text}</span>
    </div>
  ))}</div>;
}

function decisionSummary(batch: RecommendationHistoryBatch): string {
  if (batch.decisions.length === 0) return "当天尚无决定";
  return batch.decisions.map((decision) => `${decision.restaurantName} · ${decision.memberCount} 人`).join("；");
}

function weekDifference(value: number): string {
  if (value === 0) return "与上周相同";
  return `比上周${value > 0 ? "多" : "少"} ${Math.abs(value)} 条`;
}

function activityText(item: DashboardResponse["recentActivity"][number]): string {
  const actor = item.memberName ?? "小组成员";
  return item.kind === "restaurant_created"
    ? `${actor} 加了餐厅 ${item.restaurantName}`
    : `${actor} 加了 ${item.restaurantName} 的推荐`;
}

function sourceLabel(source: RecommendationHistoryBatch["source"]): string {
  if (source === "auto") return "自动生成";
  if (source === "manual") return "手动生成";
  return "历史迁移";
}

function formatTimestamp(value: string, timezone?: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      ...(timezone ? { timeZone: timezone } : { timeZone: "UTC" }),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function membershipError(kind: "session-expired" | "forbidden") {
  return new AdminApiError({
    kind: "http",
    status: kind === "session-expired" ? 401 : 403,
    code: kind === "session-expired" ? "invalid_session" : "active_membership_required"
  });
}
