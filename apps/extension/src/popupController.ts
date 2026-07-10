import type {
  GroupSummary,
  GroupTodayRecommendationsResponse,
  ParticipationMember,
  ParticipationTodayResponse,
  PutParticipationTodayResponse
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import type { ExtensionStorageShape } from "./storage";

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
  loadRecommendations: () => Promise<GroupTodayRecommendationsResponse>;
  loadParticipation: () => Promise<ParticipationTodayResponse>;
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
  const groupId = storage.activeGroupId;
  const group = groupId ? storage.groupSummariesById[groupId] : undefined;
  const session = groupId ? storage.sessionsByGroupId[groupId] : undefined;
  if (!groupId || !group || !session?.token) return { kind: "disconnected" };

  try {
    const response = await dependencies.loadRecommendations();
    if (response.fromCache) {
      return { kind: "cached", response, group, readOnly: true };
    }
    if (response.items.length === 0) return { kind: "empty", response, group };
    try {
      const participation = await dependencies.loadParticipation();
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
    } catch {
      return { kind: "ready", response, group, participationUnavailable: true };
    }
  } catch (error) {
    const failureKind = classifyPopupError(error);
    if (failureKind === "no-current-batch") {
      return { kind: "no-current-batch", groupId, group };
    }
    if (failureKind === "session-expired") {
      return { kind: "session-expired", group };
    }
    if (failureKind === "forbidden") return { kind: "forbidden", group };
    return {
      kind: "error",
      group,
      message: "暂时无法加载今日推荐，请重试。"
    };
  }
}
