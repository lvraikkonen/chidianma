import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type GroupSettingsResponse,
  type ParticipationTodayResponse,
  type PersonalLunchHistoryResponse
} from "@lunch/shared";
import { ExtensionApiError, requestJson } from "./apiClient";

export interface ExtensionGroupContext {
  readonly apiBaseUrl: string;
  readonly groupId: string;
  readonly membershipId: string;
  readonly groupSessionToken: string;
}

function groupHeaders(context: ExtensionGroupContext): Record<string, string> {
  return {
    [AUTHORIZATION_HEADER]: `Bearer ${context.groupSessionToken}`
  };
}

function invalidResponse(code: string): never {
  throw new ExtensionApiError({
    kind: "invalid-response",
    code,
    message: code
  });
}

async function getGroupJson<T extends { groupId: string }>(
  context: ExtensionGroupContext,
  path: string
): Promise<T> {
  const response = await requestJson<T>(new URL(path, context.apiBaseUrl), {
    headers: groupHeaders(context)
  });
  if (response.groupId !== context.groupId) {
    invalidResponse("group_response_mismatch");
  }
  return response;
}

export function getGroupSettingsForContext(
  context: ExtensionGroupContext
): Promise<GroupSettingsResponse> {
  return getGroupJson<GroupSettingsResponse>(
    context,
    GROUP_ROUTES.settings(context.groupId)
  );
}

export async function getPersonalHistoryForContext(
  context: ExtensionGroupContext
): Promise<PersonalLunchHistoryResponse> {
  const response = await getGroupJson<PersonalLunchHistoryResponse>(
    context,
    GROUP_ROUTES.personalHistory(context.groupId)
  );
  if (response.membershipId !== context.membershipId) {
    invalidResponse("membership_response_mismatch");
  }
  return response;
}

export function getTodayParticipationForContext(
  context: ExtensionGroupContext
): Promise<ParticipationTodayResponse> {
  return getGroupJson<ParticipationTodayResponse>(
    context,
    GROUP_ROUTES.participationToday(context.groupId)
  );
}
