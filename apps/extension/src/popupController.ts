import type {
  GroupSummary,
  GroupTodayRecommendationsResponse,
  ParticipationMember,
  ParticipationTodayResponse,
  PutParticipationTodayResponse
} from "@lunch/shared";
import { ExtensionApiError, isServiceUnavailable } from "./apiClient";
import type { ExtensionStorageShape } from "./storage";

const POPUP_LOAD_ERROR_MESSAGE = "暂时无法加载今日推荐，请重试。";

export type PopupFailureKind =
  | "no-current-batch"
  | "session-expired"
  | "forbidden"
  | "error";

export type PopupViewState =
  | { kind: "disconnected" }
  | { kind: "no-current-batch"; groupId: string; group: GroupSummary }
  | {
    kind: "cached";
    response: GroupTodayRecommendationsResponse;
    group: GroupSummary;
    readOnly: true;
  }
  | {
    kind: "empty";
    response: GroupTodayRecommendationsResponse;
    group: GroupSummary;
  }
  | {
    kind: "ready";
    response: GroupTodayRecommendationsResponse;
    group: GroupSummary;
    participation?: ParticipationTodayResponse | undefined;
    currentMember?: ParticipationMember | undefined;
    participationUnavailable?: boolean | undefined;
  }
  | { kind: "session-expired"; group?: GroupSummary | undefined }
  | { kind: "forbidden"; group?: GroupSummary | undefined }
  | {
    kind: "error";
    group?: GroupSummary | undefined;
    message: string;
  };

export interface PopupDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  loadRecommendations: (
    storage: ExtensionStorageShape
  ) => Promise<GroupTodayRecommendationsResponse>;
  loadParticipation: (
    storage: ExtensionStorageShape
  ) => Promise<ParticipationTodayResponse>;
}

export interface PopupRefreshDependencies extends PopupDependencies {
  refreshRecommendations: (
    storage: ExtensionStorageShape
  ) => Promise<GroupTodayRecommendationsResponse>;
}

export type PopupActionFailureResolution =
  | {
    kind: "state";
    state: Extract<
      PopupViewState,
      { kind: "session-expired" | "forbidden" }
    >;
  }
  | { kind: "message"; message: string };

export type PopupRetryOutcome =
  | { kind: "fresh"; announcement: string }
  | { kind: "retryable-failure"; announcement: string }
  | { kind: "handled-state"; announcement: null };

export interface RecommendationFocusTarget {
  restaurantId: string;
  focus: () => void;
}

interface FocusFallback {
  focus: () => void;
}

export function classifyPopupError(error: unknown): PopupFailureKind {
  if (!(error instanceof ExtensionApiError)) return "error";
  if (error.status === 404 && error.code === "no_current_batch") {
    return "no-current-batch";
  }
  if (error.status === 401) return "session-expired";
  if (error.status === 403) return "forbidden";
  return "error";
}

export function currentMemberParticipation(
  participation: ParticipationTodayResponse,
  membershipId: string
): ParticipationMember | undefined {
  return participation.members.find(
    (member) => member.membershipId === membershipId
  );
}

function authorizationState(
  kind: "session-expired" | "forbidden",
  group?: GroupSummary | undefined
): Extract<PopupViewState, { kind: "session-expired" | "forbidden" }> {
  return group ? { kind, group } : { kind };
}

function popupGroup(state: PopupViewState): GroupSummary | undefined {
  return "group" in state ? state.group : undefined;
}

function safeLoadError(group: GroupSummary): PopupViewState {
  return {
    kind: "error",
    group,
    message: POPUP_LOAD_ERROR_MESSAGE
  };
}

function failureState(
  error: unknown,
  groupId: string,
  group: GroupSummary
): PopupViewState {
  const failureKind = classifyPopupError(error);
  if (failureKind === "no-current-batch") {
    return { kind: "no-current-batch", groupId, group };
  }
  if (failureKind === "session-expired") {
    return authorizationState("session-expired", group);
  }
  if (failureKind === "forbidden") {
    return authorizationState("forbidden", group);
  }
  return safeLoadError(group);
}

export function resolvePopupActionFailure(
  state: PopupViewState,
  error: unknown,
  safeMessage: string
): PopupActionFailureResolution {
  const failureKind = classifyPopupError(error);
  if (failureKind === "session-expired") {
    return {
      kind: "state",
      state: authorizationState("session-expired", popupGroup(state))
    };
  }
  if (failureKind === "forbidden") {
    return {
      kind: "state",
      state: authorizationState("forbidden", popupGroup(state))
    };
  }
  return { kind: "message", message: safeMessage };
}

export function classifyPopupRetryOutcome(
  state: PopupViewState
): PopupRetryOutcome {
  if (state.kind === "ready" || state.kind === "empty") {
    return { kind: "fresh", announcement: "已获取最新推荐。" };
  }
  if (state.kind === "cached") {
    return {
      kind: "retryable-failure",
      announcement: "暂时仍无法获取最新推荐，当前为缓存只读内容，请重试。"
    };
  }
  if (state.kind === "error") {
    return {
      kind: "retryable-failure",
      announcement: "暂时仍无法获取最新推荐，请重试。"
    };
  }
  return { kind: "handled-state", announcement: null };
}

export function restoreRecommendationFocus(
  targets: Iterable<RecommendationFocusTarget>,
  restaurantId: string,
  fallback: FocusFallback
): "card" | "fallback" {
  for (const target of targets) {
    if (target.restaurantId === restaurantId) {
      target.focus();
      return "card";
    }
  }
  fallback.focus();
  return "fallback";
}

export function applyParticipationUpdate(
  state: PopupViewState,
  update: PutParticipationTodayResponse
): PopupViewState {
  if (state.kind !== "ready") return state;
  return {
    ...state,
    currentMember: update.participation,
    response: {
      ...state.response,
      participationSummary: update.summary
    },
    participation: state.participation
      ? {
          ...state.participation,
          summary: update.summary,
          members: state.participation.members.map((member) =>
            member.membershipId === update.participation.membershipId
              ? update.participation
              : member
          )
        }
      : undefined
  };
}

export async function loadPopupState(
  dependencies: PopupDependencies
): Promise<PopupViewState> {
  const storage = await dependencies.loadStorage();
  return loadPopupStateFromSnapshot(
    storage,
    dependencies,
    dependencies.loadRecommendations
  );
}

async function loadPopupStateFromSnapshot(
  storage: ExtensionStorageShape,
  dependencies: PopupDependencies,
  loadRecommendations: (
    storage: ExtensionStorageShape
  ) => Promise<GroupTodayRecommendationsResponse>
): Promise<PopupViewState> {
  const groupId = storage.activeGroupId;
  const group = groupId ? storage.groupSummariesById[groupId] : undefined;
  const session = groupId ? storage.sessionsByGroupId[groupId] : undefined;
  if (!groupId || !group || !session?.token) return { kind: "disconnected" };

  try {
    const response = await loadRecommendations(storage);
    if (response.groupId !== groupId) return safeLoadError(group);
    if (response.fromCache) {
      return { kind: "cached", response, group, readOnly: true };
    }
    if (response.items.length === 0) return { kind: "empty", response, group };
    try {
      const participation = await dependencies.loadParticipation(storage);
      if (participation.groupId !== groupId) return safeLoadError(group);
      return {
        kind: "ready",
        response,
        group,
        participation,
        currentMember: currentMemberParticipation(
          participation,
          group.membershipId
        )
      };
    } catch (error) {
      if (isServiceUnavailable(error)) {
        return {
          kind: "ready",
          response,
          group,
          participationUnavailable: true
        };
      }
      return failureState(error, groupId, group);
    }
  } catch (error) {
    return failureState(error, groupId, group);
  }
}

export async function loadRefreshedPopupState(
  dependencies: PopupRefreshDependencies
): Promise<PopupViewState> {
  const storage = await dependencies.loadStorage();
  return loadPopupStateFromSnapshot(
    storage,
    dependencies,
    dependencies.refreshRecommendations
  );
}
