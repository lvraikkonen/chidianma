import type {
  GroupTodayRecommendationsResponse,
  ParticipationMember,
  ScoreBreakdown
} from "@lunch/shared";
import { useState } from "react";
import { StatusPanel } from "../components/StatusPanel";
import {
  buildStrategyRows,
  groupParticipation,
  type ParticipationGroups,
  type TodayViewState
} from "../features/today/todayModel";

const breakdownRows: Array<{
  key: keyof Omit<ScoreBreakdown, "total">;
  label: string;
}> = [
  { key: "weatherMatch", label: "天气匹配" },
  { key: "weekdayMatch", label: "星期匹配" },
  { key: "distance", label: "距离" },
  { key: "teammateRecommendation", label: "同事推荐" },
  { key: "recentDuplicatePenalty", label: "近期重复" },
  { key: "negativeFeedbackPenalty", label: "负反馈" }
];

export function TodayPage(props: {
  state: TodayViewState;
  onGenerate: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onOpenRestaurants: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<"generate" | "refresh" | "retry" | null>(null);

  async function run(
    action: "generate" | "refresh" | "retry",
    callback: () => void | Promise<void>
  ) {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      await callback();
    } finally {
      setPendingAction(null);
    }
  }

  if (props.state.kind === "loading") {
    return <StatusPanel title="正在加载今日推荐" message="正在读取当前批次和小组参与情况…" />;
  }

  if (props.state.kind === "session-expired") {
    return (
      <StatusPanel
        tone="error"
        title="小组连接已失效"
        message="请重新选择小组以获取新的连接。"
      />
    );
  }

  if (props.state.kind === "forbidden") {
    return (
      <StatusPanel
        tone="error"
        title="已无法访问这个小组"
        message="成员资格可能已失效，请选择其他小组或联系管理员。"
      />
    );
  }

  if (props.state.kind === "error") {
    return (
      <StatusPanel
        tone="error"
        title="今日推荐暂时没加载出来"
        message={props.state.message}
        action={(
          <button
            className="button secondary"
            type="button"
            disabled={pendingAction !== null}
            onClick={() => { void run("retry", props.onRetry); }}
          >
            {pendingAction === "retry" ? "正在重试…" : "重试"}
          </button>
        )}
      />
    );
  }

  if (props.state.kind === "no-current-batch") {
    const participationGroups = groupParticipation(props.state.participation);
    return (
      <div className="today-page">
        <header className="page-heading">
          <div>
            <span className="eyebrow">今天还没有推荐批次</span>
            <h1>生成今天的 2–3 个午饭选择</h1>
            <p className="lead">会根据当前小组的真实餐厅知识、天气和近期反馈生成。</p>
          </div>
          <button
            className="button primary"
            type="button"
            disabled={pendingAction !== null}
            onClick={() => { void run("generate", props.onGenerate); }}
          >
            {pendingAction === "generate" ? "正在生成…" : "生成今日推荐"}
          </button>
        </header>
        {props.state.participation && <ParticipationColumns groups={participationGroups} />}
      </div>
    );
  }

  const response = props.state.response;

  if (props.state.kind === "empty") {
    return (
      <div className="today-page">
        <header className="page-heading">
          <div>
            <span className="eyebrow">当前批次 #{response.batchNo}</span>
            <h1>今天还没有可推荐的餐厅</h1>
          </div>
        </header>
        <WeatherPanel response={response} />
        <section className="empty-state">
          <h2>先补充一些团队常去的餐厅</h2>
          <p>餐厅库有真实推荐后，再回来生成今天的选择。</p>
          <button className="button primary" type="button" onClick={props.onOpenRestaurants}>
            打开餐厅库
          </button>
        </section>
      </div>
    );
  }

  const generatedAt = new Date(response.generatedAt).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div className="today-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{response.officeDate}</span>
          <h1>今日推荐</h1>
          <p className="lead">当前批次 #{response.batchNo} · {generatedAt} 生成</p>
        </div>
        <button
          className="button primary"
          type="button"
          disabled={pendingAction !== null}
          onClick={() => {
            if (window.confirm("重新生成会创建一个新的当前批次，确定继续吗？")) {
              void run("refresh", props.onRefresh);
            }
          }}
        >
          {pendingAction === "refresh" ? "正在重新生成…" : "重新生成今日推荐"}
        </button>
      </header>

      {props.state.refreshError && (
        <p className="inline-error" aria-live="polite">{props.state.refreshError}</p>
      )}

      <div className="snapshot-grid">
        <WeatherPanel response={response} />
        <section className="panel">
          <span className="eyebrow">推荐策略</span>
          <h2>本批次真实得分信号</h2>
          <ul className="strategy-list">
            {buildStrategyRows(response).map((row) => (
              <li className="strategy-row" key={row.key}>
                <span>{row.label}</span>
                <span className="strategy-track" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, Math.abs(row.value) * 4)}%` }} />
                </span>
                <strong>{formatScore(row.value)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="batch-heading">
        <h2>当前批次 #{response.batchNo}</h2>
        <span>{response.items.length} 个选择</span>
      </div>

      <div className="result-list">
        {response.items.map((item) => (
          <article className="result-card" key={`${item.rank}-${item.restaurantId}`}>
            <div className="result-header">
              <span className="result-rank">#{item.rank}</span>
              <div>
                <h3>{item.restaurantName}</h3>
                <p>{[item.dish, item.distanceMinutes === undefined ? undefined : `步行 ${item.distanceMinutes} 分钟`].filter(Boolean).join(" · ")}</p>
              </div>
              <strong className="score-value">{item.score}</strong>
            </div>
            <p className="result-reason">{item.reason}</p>
            {item.tags.length > 0 && (
              <div className="chip-row">
                {item.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}
              </div>
            )}
            <dl className="breakdown-grid">
              {breakdownRows.map((row) => (
                <div className="breakdown-row" key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{formatScore(item.scoreBreakdown[row.key])}</dd>
                </div>
              ))}
              <div className="breakdown-row total">
                <dt>总分</dt>
                <dd>{item.scoreBreakdown.total}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <ParticipationColumns groups={props.state.participationGroups} />
    </div>
  );
}

function WeatherPanel(props: { response: GroupTodayRecommendationsResponse }) {
  const { response } = props;
  if (response.weatherUnavailable || !response.weather) {
    return (
      <section className="panel weather-snapshot">
        <div>
          <span className="eyebrow">天气快照</span>
          <h2>天气暂不可用</h2>
          <p>本批次已按其他真实因素完成评分。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel weather-snapshot">
      <div className="weather-temperature">
        {response.weather.temperatureC === undefined
          ? response.weather.condition
          : `${response.weather.temperatureC}°`}
      </div>
      <div>
        <span className="eyebrow">{response.weather.city} · {response.weather.condition}</span>
        <h2>{response.weather.summary}</h2>
        {response.weather.precipitationProbability !== undefined && (
          <p>降水概率 {response.weather.precipitationProbability}%</p>
        )}
      </div>
    </section>
  );
}

function ParticipationColumns(props: { groups: ParticipationGroups }) {
  const columns: Array<{
    key: keyof ParticipationGroups;
    label: string;
  }> = [
    { key: "joining", label: "今天参与" },
    { key: "decided", label: "已经决定" },
    { key: "away", label: "今天不吃" },
    { key: "undecided", label: "还未选择" }
  ];

  return (
    <section aria-labelledby="participation-heading">
      <div className="batch-heading">
        <h2 id="participation-heading">小组参与情况</h2>
      </div>
      <div className="participation-grid">
        {columns.map((column) => (
          <div className="participation-column" key={column.key}>
            <h3>{column.label}</h3>
            <span className="participation-count">{props.groups[column.key].length}</span>
            {props.groups[column.key].map((member) => (
              <MemberChip member={member} key={member.membershipId} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function MemberChip(props: { member: ParticipationMember }) {
  return <span className="member-chip">{props.member.displayName}</span>;
}

function formatScore(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
