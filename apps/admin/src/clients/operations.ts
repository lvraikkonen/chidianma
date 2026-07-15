import {
  GROUP_ROUTES,
  type DashboardResponse,
  type GroupSettingsResponse,
  type MemberMutationResponse,
  type MembersResponse,
  type PatchGroupSettingsRequest,
  type PatchMemberRequest,
  type RecommendationHistoryResponse,
  type RotateInviteCodeResponse
} from "@lunch/shared";
import { requestJson } from "../api";
import type { AdminGroupContext } from "./today";

export function getDashboard(context: AdminGroupContext) {
  return requestJson<DashboardResponse>(GROUP_ROUTES.dashboard(context.groupId), context);
}

export function getHistory(
  context: AdminGroupContext,
  cursor?: string | undefined,
  limit = 20
) {
  const search = new URLSearchParams({ limit: String(limit) });
  if (cursor) search.set("cursor", cursor);
  return requestJson<RecommendationHistoryResponse>(
    `${GROUP_ROUTES.history(context.groupId)}?${search.toString()}`,
    context
  );
}

export function getSettings(context: AdminGroupContext) {
  return requestJson<GroupSettingsResponse>(GROUP_ROUTES.settings(context.groupId), context);
}

export function patchSettings(
  context: AdminGroupContext,
  input: PatchGroupSettingsRequest
) {
  return requestJson<GroupSettingsResponse>(GROUP_ROUTES.settings(context.groupId), context, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getMembers(context: AdminGroupContext) {
  return requestJson<MembersResponse>(GROUP_ROUTES.members(context.groupId), context);
}

export function patchMember(
  context: AdminGroupContext,
  membershipId: string,
  input: PatchMemberRequest
) {
  return requestJson<MemberMutationResponse>(
    GROUP_ROUTES.member(context.groupId, membershipId),
    context,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export function rotateInviteCode(context: AdminGroupContext) {
  return requestJson<RotateInviteCodeResponse>(
    GROUP_ROUTES.rotateInviteCode(context.groupId),
    context,
    { method: "POST" }
  );
}
