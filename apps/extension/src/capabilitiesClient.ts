import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type GroupCapabilitiesResponse,
  type PoiProviderId
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

function parseCapabilitiesResponse(
  value: unknown,
  expectedGroupId: string
): GroupCapabilitiesResponse {
  if (!isRecord(value) || value.groupId !== expectedGroupId) {
    invalidResponse(
      isRecord(value) && typeof value.groupId === "string"
        ? "group_response_mismatch"
        : "invalid_capabilities_response"
    );
  }
  if (!isRecord(value.features)) {
    invalidResponse("invalid_capabilities_response");
  }
  const features = value.features;
  const booleanFields = [
    "luckyRestaurantWheel",
    "poiReferenceSearch",
    "poiReferenceDraft",
    "poiOfficePreset"
  ] as const;
  if (booleanFields.some((field) => typeof features[field] !== "boolean")) {
    invalidResponse("invalid_capabilities_response");
  }
  const provider = features.poiProvider;
  if (provider !== null && provider !== "mock" && provider !== "amap") {
    invalidResponse("invalid_capabilities_response");
  }

  return {
    groupId: expectedGroupId,
    features: {
      luckyRestaurantWheel: features.luckyRestaurantWheel as boolean,
      poiReferenceSearch: features.poiReferenceSearch as boolean,
      poiReferenceDraft: features.poiReferenceDraft as boolean,
      poiOfficePreset: features.poiOfficePreset as boolean,
      poiProvider: provider as PoiProviderId | null
    }
  };
}

export async function fetchGroupCapabilitiesForStorage(
  storage: ExtensionStorageShape,
  signal?: AbortSignal
): Promise<GroupCapabilitiesResponse> {
  const groupId = storage.activeGroupId;
  const token = groupId ? storage.sessionsByGroupId[groupId]?.token : undefined;
  if (!groupId || !token) {
    throw new Error("No active group session configured");
  }

  const response = await withGroupSessionRetry(
    groupId,
    token,
    (sessionToken) => requestJson<unknown>(
      new URL(GROUP_ROUTES.capabilities(groupId), storage.apiBaseUrl),
      {
        headers: {
          [AUTHORIZATION_HEADER]: `Bearer ${sessionToken}`
        },
        ...(signal ? { signal } : {})
      }
    ),
    groupSessionRetrySnapshotForStorage(storage, groupId)
  );
  return parseCapabilitiesResponse(response, groupId);
}
