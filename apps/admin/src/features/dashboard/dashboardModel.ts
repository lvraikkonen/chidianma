import type { DashboardResponse, RecommendationHistoryResponse } from "@lunch/shared";
import { AdminApiError } from "../../api";

type Resource<T> =
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string };

export type HistoryResource =
  | {
      kind: "ready";
      items: RecommendationHistoryResponse["items"];
      nextCursor?: string | undefined;
      loadingMore: boolean;
      loadMoreError?: string | undefined;
    }
  | { kind: "error"; message: string };

export type DashboardWorkspaceState =
  | { kind: "loading" }
  | { kind: "session-expired" }
  | { kind: "forbidden" }
  | {
      kind: "ready";
      dashboard: Resource<DashboardResponse>;
      history: HistoryResource;
    };

export interface DashboardDependencies {
  getDashboard: () => Promise<DashboardResponse>;
  getHistory: (cursor?: string | undefined) => Promise<RecommendationHistoryResponse>;
}

export async function loadDashboardWorkspace(
  dependencies: DashboardDependencies
): Promise<DashboardWorkspaceState> {
  const [dashboardResult, historyResult] = await Promise.allSettled([
    dependencies.getDashboard(),
    dependencies.getHistory()
  ]);
  for (const result of [dashboardResult, historyResult]) {
    if (result.status === "rejected") {
      const membership = membershipFailure(result.reason);
      if (membership) return membership;
    }
  }
  return {
    kind: "ready",
    dashboard: dashboardResult.status === "fulfilled"
      ? { kind: "ready", value: dashboardResult.value }
      : { kind: "error", message: "暂时无法加载团队概览，请重试。" },
    history: historyResult.status === "fulfilled"
      ? {
          kind: "ready",
          items: historyResult.value.items,
          ...(historyResult.value.nextCursor ? { nextCursor: historyResult.value.nextCursor } : {}),
          loadingMore: false
        }
      : { kind: "error", message: "暂时无法加载推荐记录，请重试。" }
  };
}

export async function appendHistory(
  state: DashboardWorkspaceState,
  getHistory: (cursor: string) => Promise<RecommendationHistoryResponse>
): Promise<DashboardWorkspaceState> {
  if (state.kind !== "ready" || state.history.kind !== "ready" || !state.history.nextCursor) {
    return state;
  }
  try {
    const response = await getHistory(state.history.nextCursor);
    const ids = new Set(state.history.items.map((item) => item.batchId));
    const appended = response.items.filter((item) => !ids.has(item.batchId));
    return {
      ...state,
      history: {
        kind: "ready",
        items: [...state.history.items, ...appended],
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
        loadingMore: false
      }
    };
  } catch (error) {
    const membership = membershipFailure(error);
    if (membership) return membership;
    return {
      ...state,
      history: {
        ...state.history,
        loadingMore: false,
        loadMoreError: "加载更多失败，已加载的记录仍然保留。"
      }
    };
  }
}

export function markHistoryLoading(state: DashboardWorkspaceState): DashboardWorkspaceState {
  if (state.kind !== "ready" || state.history.kind !== "ready") return state;
  return {
    ...state,
    history: { ...state.history, loadingMore: true, loadMoreError: undefined }
  };
}

function membershipFailure(error: unknown): Extract<DashboardWorkspaceState, { kind: "session-expired" | "forbidden" }> | undefined {
  if (!(error instanceof AdminApiError)) return undefined;
  if (error.status === 401) return { kind: "session-expired" };
  if (error.status === 403 && ["active_membership_required", "removed_member"].includes(error.code ?? "")) {
    return { kind: "forbidden" };
  }
  return undefined;
}
