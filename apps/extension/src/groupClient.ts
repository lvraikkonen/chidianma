import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type CreateGroupRequest,
  type CreateGroupResponse,
  type CreateIdentityLinkCodeResponse,
  type CreateIdentityResponse,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type GroupsListResponse,
  type JoinGroupResponse,
  type RedeemIdentityLinkCodeResponse,
  type RecommendationMutationResponse,
  type RefreshGroupSessionResponse,
  type IdentitySessionResponse,
  type ResetIdentitySessionsResponse,
  type RestaurantListResponse,
  type RestaurantMutationResponse
} from "@lunch/shared";
import { requestJson } from "./apiClient";
import { withGroupSessionRetry } from "./groupSessionRetry";

export interface GroupApiContext {
  apiBaseUrl: string;
  groupId: string;
  token: string;
}

function identityHeaders(identityToken: string): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `Bearer ${identityToken}` };
}

export function createIdentity(apiBaseUrl: string, displayName: string) {
  return requestJson<CreateIdentityResponse>(
    new URL(GROUP_ROUTES.identities, apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() })
    }
  );
}

export function refreshIdentitySession(apiBaseUrl: string, identityToken: string) {
  return requestJson<IdentitySessionResponse>(
    new URL(GROUP_ROUTES.identitySession, apiBaseUrl),
    { method: "POST", headers: identityHeaders(identityToken) }
  );
}

export function createIdentityLinkCode(apiBaseUrl: string, identityToken: string) {
  return requestJson<CreateIdentityLinkCodeResponse>(
    new URL(GROUP_ROUTES.identityLinkCodes, apiBaseUrl),
    { method: "POST", headers: identityHeaders(identityToken) }
  );
}

export function redeemIdentityLinkCode(apiBaseUrl: string, linkCode: string) {
  return requestJson<RedeemIdentityLinkCodeResponse>(
    new URL(GROUP_ROUTES.redeemIdentityLinkCode, apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ linkCode: linkCode.trim() })
    }
  );
}

export function resetIdentitySessions(apiBaseUrl: string, identityToken: string) {
  return requestJson<ResetIdentitySessionsResponse>(
    new URL(GROUP_ROUTES.resetIdentitySessions, apiBaseUrl),
    { method: "POST", headers: identityHeaders(identityToken) }
  );
}

export function createGroup(
  apiBaseUrl: string,
  identityToken: string,
  input: CreateGroupRequest
) {
  return requestJson<CreateGroupResponse>(new URL(GROUP_ROUTES.groups, apiBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...identityHeaders(identityToken)
    },
    body: JSON.stringify(input)
  });
}

export function joinGroup(
  apiBaseUrl: string,
  identityToken: string,
  inviteCode: string
) {
  return requestJson<JoinGroupResponse>(new URL(GROUP_ROUTES.joinGroup, apiBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...identityHeaders(identityToken)
    },
    body: JSON.stringify({ inviteCode: inviteCode.trim() })
  });
}

export function listGroups(apiBaseUrl: string, identityToken: string) {
  return requestJson<GroupsListResponse>(new URL(GROUP_ROUTES.groups, apiBaseUrl), {
    headers: identityHeaders(identityToken)
  });
}

export function refreshGroupSession(
  apiBaseUrl: string,
  identityToken: string,
  groupId: string
) {
  return requestJson<RefreshGroupSessionResponse>(
    new URL(GROUP_ROUTES.groupSession(groupId), apiBaseUrl),
    { method: "POST", headers: identityHeaders(identityToken) }
  );
}

export function listGroupRestaurants(context: GroupApiContext) {
  return withGroupSessionRetry(context.groupId, context.token, (token) => (
    requestJson<RestaurantListResponse>(
      new URL(GROUP_ROUTES.restaurants(context.groupId), context.apiBaseUrl),
      { headers: { [AUTHORIZATION_HEADER]: `Bearer ${token}` } }
    )
  ));
}

export function createGroupRestaurant(
  context: GroupApiContext,
  input: CreateRestaurantRequest
) {
  return withGroupSessionRetry(context.groupId, context.token, (token) => (
    requestJson<RestaurantMutationResponse>(
      new URL(GROUP_ROUTES.restaurants(context.groupId), context.apiBaseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [AUTHORIZATION_HEADER]: `Bearer ${token}`
        },
        body: JSON.stringify(input)
      }
    )
  ));
}

export function createGroupRecommendation(
  context: GroupApiContext,
  input: CreateRecommendationRequest
) {
  return withGroupSessionRetry(context.groupId, context.token, (token) => (
    requestJson<RecommendationMutationResponse>(
      new URL(GROUP_ROUTES.recommendations(context.groupId), context.apiBaseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [AUTHORIZATION_HEADER]: `Bearer ${token}`
        },
        body: JSON.stringify(input)
      }
    )
  ));
}
