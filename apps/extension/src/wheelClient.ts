import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  WHEEL_MAX_CANDIDATES,
  type GroupWheelCandidate,
  type GroupWheelCandidatesResponse
} from "@lunch/shared";
import { ExtensionApiError, requestJson } from "./apiClient";
import {
  groupSessionRetrySnapshotForStorage,
  withGroupSessionRetry
} from "./groupSessionRetry";
import type { ExtensionStorageShape } from "./storage";

function invalidResponse(code: string): never {
  throw new ExtensionApiError({
    kind: "invalid-response",
    code,
    message: code
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRealOfficeDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function optionalString(
  value: unknown
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidResponse("invalid_wheel_candidates_response");
  }
  return value as string;
}

function parseCandidate(value: unknown): GroupWheelCandidate {
  if (!isRecord(value)) {
    invalidResponse("invalid_wheel_candidates_response");
  }
  if (
    typeof value.restaurantId !== "string"
    || value.restaurantId.trim().length === 0
    || typeof value.name !== "string"
    || value.name.trim().length === 0
    || typeof value.reason !== "string"
    || value.reason.trim().length === 0
    || typeof value.recommendationScore !== "number"
    || !Number.isFinite(value.recommendationScore)
    || typeof value.selectedWithinLast7Days !== "boolean"
    || !Array.isArray(value.tags)
    || value.tags.some((tag) => typeof tag !== "string")
    || (
      value.distanceMinutes !== undefined
      && (
        typeof value.distanceMinutes !== "number"
        || !Number.isFinite(value.distanceMinutes)
        || value.distanceMinutes < 0
      )
    )
  ) {
    invalidResponse("invalid_wheel_candidates_response");
  }

  const recommendationId = optionalString(value.recommendationId);
  const dish = optionalString(value.dish);
  return {
    restaurantId: value.restaurantId as string,
    ...(recommendationId === undefined ? {} : { recommendationId }),
    name: value.name as string,
    ...(dish === undefined ? {} : { dish }),
    reason: value.reason as string,
    ...(value.distanceMinutes === undefined
      ? {}
      : { distanceMinutes: value.distanceMinutes as number }),
    tags: [...value.tags] as string[],
    recommendationScore: value.recommendationScore as number,
    selectedWithinLast7Days: value.selectedWithinLast7Days as boolean
  };
}

function parseWheelCandidatesResponse(
  value: unknown,
  expectedGroupId: string
): GroupWheelCandidatesResponse {
  if (!isRecord(value)) {
    invalidResponse("invalid_wheel_candidates_response");
  }
  if (typeof value.groupId === "string" && value.groupId !== expectedGroupId) {
    invalidResponse("group_response_mismatch");
  }
  if (
    value.groupId !== expectedGroupId
    || !isRealOfficeDate(value.officeDate)
    || typeof value.batchId !== "string"
    || value.batchId.trim().length === 0
    || typeof value.algorithmVersion !== "string"
    || value.algorithmVersion.trim().length === 0
    || !Array.isArray(value.candidates)
    || value.candidates.length > WHEEL_MAX_CANDIDATES
  ) {
    invalidResponse("invalid_wheel_candidates_response");
  }

  const candidates = value.candidates.map(parseCandidate);
  if (new Set(candidates.map(({ restaurantId }) => restaurantId)).size !== candidates.length) {
    invalidResponse("invalid_wheel_candidates_response");
  }
  return {
    groupId: expectedGroupId,
    officeDate: value.officeDate as string,
    batchId: value.batchId as string,
    algorithmVersion: value.algorithmVersion as string,
    candidates
  };
}

export async function fetchGroupWheelCandidatesForStorage(
  storage: ExtensionStorageShape,
  signal?: AbortSignal
): Promise<GroupWheelCandidatesResponse> {
  const groupId = storage.activeGroupId;
  const token = groupId ? storage.sessionsByGroupId[groupId]?.token : undefined;
  if (!groupId || !token) {
    throw new Error("No active group session configured");
  }

  const response = await withGroupSessionRetry(
    groupId,
    token,
    (sessionToken) => requestJson<unknown>(
      new URL(GROUP_ROUTES.wheelCandidates(groupId), storage.apiBaseUrl),
      {
        headers: {
          [AUTHORIZATION_HEADER]: `Bearer ${sessionToken}`
        },
        ...(signal ? { signal } : {})
      }
    ),
    groupSessionRetrySnapshotForStorage(storage, groupId)
  );
  return parseWheelCandidatesResponse(response, groupId);
}
