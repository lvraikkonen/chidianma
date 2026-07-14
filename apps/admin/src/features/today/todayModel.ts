import type {
  GroupTodayRecommendationsResponse,
  ParticipationMember,
  ParticipationTodayResponse
} from "@lunch/shared";
import { AdminApiError } from "../../api";

export type TodayViewState =
  | { kind: "loading" }
  | {
      kind: "no-current-batch";
      participation?: ParticipationTodayResponse | undefined;
    }
  | {
      kind: "empty";
      response: GroupTodayRecommendationsResponse;
      participation?: ParticipationTodayResponse | undefined;
    }
  | {
      kind: "ready";
      response: GroupTodayRecommendationsResponse;
      participation?: ParticipationTodayResponse | undefined;
      participationGroups: ParticipationGroups;
      refreshError?: string | undefined;
    }
  | { kind: "session-expired" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export type ParticipationGroups = Record<
  "joining" | "decided" | "away" | "undecided",
  ParticipationMember[]
>;

export interface TodayDependencies {
  getToday: () => Promise<GroupTodayRecommendationsResponse>;
  refreshToday: () => Promise<GroupTodayRecommendationsResponse>;
  getParticipation: () => Promise<ParticipationTodayResponse>;
}

export function groupParticipation(
  response?: ParticipationTodayResponse
): ParticipationGroups {
  const groups: ParticipationGroups = {
    joining: [],
    decided: [],
    away: [],
    undecided: []
  };
  for (const member of response?.members ?? []) groups[member.status].push(member);
  return groups;
}

export function buildStrategyRows(response: GroupTodayRecommendationsResponse) {
  const first = response.items[0];
  if (!first) return [];
  return [
    { key: "weather", label: "天气匹配", value: first.scoreBreakdown.weatherMatch },
    { key: "weekday", label: "星期匹配", value: first.scoreBreakdown.weekdayMatch },
    { key: "distance", label: "距离", value: first.scoreBreakdown.distance },
    {
      key: "teammate",
      label: "同事推荐",
      value: first.scoreBreakdown.teammateRecommendation
    },
    {
      key: "recent",
      label: "近期重复",
      value: first.scoreBreakdown.recentDuplicatePenalty
    },
    {
      key: "negative",
      label: "负反馈",
      value: first.scoreBreakdown.negativeFeedbackPenalty
    }
  ] as const;
}

function failureState(error: unknown): TodayViewState {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return { kind: "session-expired" };
    if (error.status === 403 && [
      "active_membership_required",
      "removed_member"
    ].includes(error.code ?? "")) {
      return { kind: "forbidden" };
    }
  }
  return { kind: "error", message: "暂时无法加载今日推荐，请重试。" };
}

function membershipFailure(error: unknown): TodayViewState | undefined {
  const state = failureState(error);
  return state.kind === "session-expired" || state.kind === "forbidden"
    ? state
    : undefined;
}

export async function loadTodayView(
  dependencies: TodayDependencies
): Promise<TodayViewState> {
  const [todayResult, participationResult] = await Promise.allSettled([
    dependencies.getToday(),
    dependencies.getParticipation()
  ]);

  if (participationResult.status === "rejected") {
    const failure = membershipFailure(participationResult.reason);
    if (failure) return failure;
  }

  const participation = participationResult.status === "fulfilled"
    ? participationResult.value
    : undefined;

  if (todayResult.status === "rejected") {
    const error = todayResult.reason;
    if (error instanceof AdminApiError
      && error.status === 404
      && error.code === "no_current_batch") {
      return {
        kind: "no-current-batch",
        ...(participation ? { participation } : {})
      };
    }
    return failureState(error);
  }

  if (todayResult.value.items.length === 0) {
    return {
      kind: "empty",
      response: todayResult.value,
      ...(participation ? { participation } : {})
    };
  }

  return {
    kind: "ready",
    response: todayResult.value,
    ...(participation ? { participation } : {}),
    participationGroups: groupParticipation(participation)
  };
}

export async function refreshTodayView(
  prior: TodayViewState,
  dependencies: TodayDependencies
): Promise<TodayViewState> {
  try {
    const response = await dependencies.refreshToday();
    let participation: ParticipationTodayResponse | undefined;
    try {
      participation = await dependencies.getParticipation();
    } catch (error) {
      const failure = membershipFailure(error);
      if (failure) return failure;
    }

    if (response.items.length === 0) {
      return {
        kind: "empty",
        response,
        ...(participation ? { participation } : {})
      };
    }
    return {
      kind: "ready",
      response,
      ...(participation ? { participation } : {}),
      participationGroups: groupParticipation(participation)
    };
  } catch (error) {
    const failure = membershipFailure(error);
    if (failure) return failure;
    if (prior.kind === "ready") {
      return { ...prior, refreshError: "重新生成失败，仍显示上一批结果。" };
    }
    return failureState(error);
  }
}
