import {
  GROUP_ROUTES,
  type GroupTodayRecommendationsResponse,
  type ParticipationTodayResponse
} from "@lunch/shared";
import { requestJson, type AdminRequestContext } from "../api";

export interface AdminGroupContext extends AdminRequestContext {
  groupId: string;
  token: string;
}

export function getToday(context: AdminGroupContext) {
  return requestJson<GroupTodayRecommendationsResponse>(
    GROUP_ROUTES.todayRecommendations(context.groupId),
    context
  );
}

export function refreshToday(context: AdminGroupContext) {
  return requestJson<GroupTodayRecommendationsResponse>(
    GROUP_ROUTES.refreshTodayRecommendations(context.groupId),
    context,
    { method: "POST" }
  );
}

export function getParticipation(context: AdminGroupContext) {
  return requestJson<ParticipationTodayResponse>(
    GROUP_ROUTES.participationToday(context.groupId),
    context
  );
}
