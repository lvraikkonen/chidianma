import {
  GROUP_ROUTES,
  type CreateGroupRequest,
  type CreateGroupResponse,
  type CreateIdentityLinkCodeResponse,
  type CreateIdentityResponse,
  type GroupsListResponse,
  type JoinGroupResponse,
  type RedeemIdentityLinkCodeResponse,
  type IdentitySessionResponse,
  type ResetIdentitySessionsResponse,
  type RefreshGroupSessionResponse
} from "@lunch/shared";
import { requestJson, type AdminRequestContext } from "../api";

type IdentityContext = AdminRequestContext & { token: string };

export function createIdentity(apiBaseUrl: string, displayName: string) {
  return requestJson<CreateIdentityResponse>(
    GROUP_ROUTES.identities,
    { apiBaseUrl },
    {
      method: "POST",
      body: JSON.stringify({ displayName: displayName.trim() })
    }
  );
}

export function refreshIdentitySession(context: IdentityContext) {
  return requestJson<IdentitySessionResponse>(GROUP_ROUTES.identitySession, context, {
    method: "POST"
  });
}

export function createIdentityLinkCode(context: IdentityContext) {
  return requestJson<CreateIdentityLinkCodeResponse>(GROUP_ROUTES.identityLinkCodes, context, {
    method: "POST"
  });
}

export function redeemIdentityLinkCode(apiBaseUrl: string, linkCode: string) {
  return requestJson<RedeemIdentityLinkCodeResponse>(
    GROUP_ROUTES.redeemIdentityLinkCode,
    { apiBaseUrl },
    {
      method: "POST",
      body: JSON.stringify({ linkCode: linkCode.trim() })
    }
  );
}

export function resetIdentitySessions(context: IdentityContext) {
  return requestJson<ResetIdentitySessionsResponse>(GROUP_ROUTES.resetIdentitySessions, context, {
    method: "POST"
  });
}

export function createGroup(context: IdentityContext, input: CreateGroupRequest) {
  return requestJson<CreateGroupResponse>(GROUP_ROUTES.groups, context, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function joinGroup(context: IdentityContext, inviteCode: string) {
  return requestJson<JoinGroupResponse>(GROUP_ROUTES.joinGroup, context, {
    method: "POST",
    body: JSON.stringify({ inviteCode: inviteCode.trim() })
  });
}

export function listGroups(context: IdentityContext) {
  return requestJson<GroupsListResponse>(GROUP_ROUTES.groups, context);
}

export function refreshGroupSession(context: IdentityContext, groupId: string) {
  return requestJson<RefreshGroupSessionResponse>(
    GROUP_ROUTES.groupSession(groupId),
    context,
    { method: "POST" }
  );
}
