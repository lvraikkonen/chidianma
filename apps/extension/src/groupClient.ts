import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type CreateGroupRequest,
  type CreateGroupResponse,
  type CreateIdentityResponse,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type GroupsListResponse,
  type JoinGroupResponse,
  type RecommendationMutationResponse,
  type RefreshGroupSessionResponse,
  type RestaurantListResponse,
  type RestaurantMutationResponse
} from "@lunch/shared";
import { requestJson } from "./apiClient";

export interface GroupApiContext {
  apiBaseUrl: string;
  groupId: string;
  token: string;
}

function identityHeaders(identityToken: string): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `Bearer ${identityToken}` };
}

function groupHeaders(context: GroupApiContext): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `Bearer ${context.token}` };
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
  return requestJson<RestaurantListResponse>(
    new URL(GROUP_ROUTES.restaurants(context.groupId), context.apiBaseUrl),
    { headers: groupHeaders(context) }
  );
}

export function createGroupRestaurant(
  context: GroupApiContext,
  input: CreateRestaurantRequest
) {
  return requestJson<RestaurantMutationResponse>(
    new URL(GROUP_ROUTES.restaurants(context.groupId), context.apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...groupHeaders(context) },
      body: JSON.stringify(input)
    }
  );
}

export function createGroupRecommendation(
  context: GroupApiContext,
  input: CreateRecommendationRequest
) {
  return requestJson<RecommendationMutationResponse>(
    new URL(GROUP_ROUTES.recommendations(context.groupId), context.apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...groupHeaders(context) },
      body: JSON.stringify(input)
    }
  );
}
