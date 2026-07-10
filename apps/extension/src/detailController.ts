import type {
  GroupTodayRecommendationItem,
  GroupTodayRecommendationsResponse,
  PutParticipationTodayResponse,
  RecommendationSummary,
  RestaurantListResponse
} from "@lunch/shared";
import { classifyPopupError } from "./popupController";
import type { ExtensionStorageShape } from "./storage";

export interface DetailItem {
  item: GroupTodayRecommendationItem;
  recommendations: RecommendationSummary[];
}

export type DetailViewState =
  | {
    kind: "ready";
    response: GroupTodayRecommendationsResponse;
    items: DetailItem[];
    readOnly: false;
    decidedRestaurantId?: string | undefined;
  }
  | {
    kind: "cached";
    response: GroupTodayRecommendationsResponse;
    items: DetailItem[];
    readOnly: true;
  }
  | { kind: "disconnected" }
  | { kind: "no-current-batch" }
  | { kind: "session-expired" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string; retryable: boolean };

export type DetailRecommendationState = Extract<
  DetailViewState,
  { kind: "ready" | "cached" }
>;

export type DetailActionContextResult<T> =
  | { kind: "performed"; storage: ExtensionStorageShape; value: T }
  | { kind: "stale"; storage: ExtensionStorageShape; message: string };

function detailFailureState(error: unknown): DetailViewState {
  const kind = classifyPopupError(error);
  if (kind === "no-current-batch") return { kind };
  if (kind === "session-expired") return { kind };
  if (kind === "forbidden") return { kind };
  return {
    kind: "error",
    message: "暂时无法加载推荐详情，请重试。",
    retryable: true
  };
}

function readyItems(
  response: GroupTodayRecommendationsResponse,
  selected: GroupTodayRecommendationItem[],
  restaurants?: RestaurantListResponse
): Extract<DetailViewState, { kind: "ready" }> {
  const byId = new Map(
    (restaurants?.restaurants ?? []).map((restaurant) => [
      restaurant.id,
      restaurant
    ])
  );
  return {
    kind: "ready",
    response,
    readOnly: false,
    items: selected.map((item) => ({
      item,
      recommendations: byId.get(item.restaurantId)?.recommendations ?? []
    }))
  };
}

export async function loadDetailState(
  dependencies: {
    loadRecommendations: () => Promise<GroupTodayRecommendationsResponse>;
    loadRestaurants: () => Promise<RestaurantListResponse>;
  },
  restaurantId?: string
): Promise<DetailViewState> {
  try {
    const response = await dependencies.loadRecommendations();
    const selected = restaurantId
      ? response.items.filter((item) => item.restaurantId === restaurantId)
      : response.items;
    if (restaurantId && selected.length === 0) {
      return {
        kind: "error",
        message: "今天的推荐里没有这家餐厅。",
        retryable: false
      };
    }
    if (response.fromCache) {
      return {
        kind: "cached",
        response,
        readOnly: true,
        items: selected.map((item) => ({ item, recommendations: [] }))
      };
    }
    if (selected.length === 0) return readyItems(response, selected);
    try {
      return readyItems(
        response,
        selected,
        await dependencies.loadRestaurants()
      );
    } catch (error) {
      const kind = classifyPopupError(error);
      if (kind === "session-expired") return { kind };
      if (kind === "forbidden") return { kind };
      return readyItems(response, selected);
    }
  } catch (error) {
    return detailFailureState(error);
  }
}

export async function runDetailActionWithContext<T>(
  state: DetailRecommendationState,
  loadStorage: () => Promise<ExtensionStorageShape>,
  action: (storage: ExtensionStorageShape) => Promise<T>
): Promise<DetailActionContextResult<T>> {
  const storage = await loadStorage();
  const groupId = state.response.groupId;
  if (
    storage.activeGroupId !== groupId
    || !storage.sessionsByGroupId[groupId]?.token
  ) {
    return {
      kind: "stale",
      storage,
      message: "当前小组已切换，已加载当前小组内容，请重新操作。"
    };
  }
  return {
    kind: "performed",
    storage,
    value: await action(storage)
  };
}

export function mergeDetailAnnouncement(
  state: DetailViewState,
  announcement: string
): string {
  return state.kind === "cached"
    ? `${announcement} 缓存内容仅供查看`
    : announcement;
}

export function applyDetailDecisionUpdate(
  state: DetailViewState,
  update: PutParticipationTodayResponse
): DetailViewState {
  if (
    state.kind !== "ready"
    || update.groupId !== state.response.groupId
    || update.officeDate !== state.response.officeDate
    || update.participation.status !== "decided"
    || !update.participation.restaurantId
  ) return state;
  return {
    ...state,
    decidedRestaurantId: update.participation.restaurantId,
    response: {
      ...state.response,
      participationSummary: update.summary
    }
  };
}
