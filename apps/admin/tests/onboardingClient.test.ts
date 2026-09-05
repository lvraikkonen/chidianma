import type {
  GroupCapabilitiesResponse,
  GroupSettingsResponse,
  PoiGeocodeResponse,
  PoiSearchResponse,
  RestaurantImportResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  geocodePoi,
  getOnboardingCapabilities,
  getOnboardingSettings,
  importRestaurants,
  patchSearchCenter,
  searchPoi
} from "../src/clients/onboarding";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("restaurant onboarding client", () => {
  it("uses group-scoped routes and preserves exact import payloads", async () => {
    const responses: unknown[] = [
      { groupId: "group-1", features: {
        luckyRestaurantWheel: false,
        poiReferenceSearch: false,
        poiReferenceDraft: false,
        poiOfficePreset: false,
        poiProvider: null
      } } satisfies GroupCapabilitiesResponse,
      { groupId: "group-1", searchCenter: null } satisfies Partial<GroupSettingsResponse>,
      { provider: "mock", attribution: "模拟数据，仅供测试", centers: [] } satisfies PoiGeocodeResponse,
      { provider: "mock", attribution: "模拟数据，仅供测试", page: 2, radius: 3000, hasMore: false, candidates: [] } satisfies PoiSearchResponse,
      { groupId: "group-1", searchCenter: null } satisfies Partial<GroupSettingsResponse>,
      { requestId: "request-1", results: [] } satisfies RestaurantImportResponse
    ];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift()
    }));
    vi.stubGlobal("fetch", fetchMock);
    const context = {
      apiBaseUrl: "https://lunch.example",
      groupId: "group-1",
      token: "group-session-token"
    };
    const center = { label: "办公楼", latitude: 31, longitude: 121, coordinateSystem: "GCJ02" as const };
    const request = { requestId: "request-1", rows: [{ rowId: "line-1", kind: "manual" as const, name: "面馆" }] };

    await getOnboardingCapabilities(context);
    await getOnboardingSettings(context);
    await geocodePoi(context, { address: "办公楼" });
    await searchPoi(context, { center, radius: 3000, page: 2 });
    await patchSearchCenter(context, center);
    await importRestaurants(context, request);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ["https://lunch.example/api/groups/group-1/capabilities", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/settings", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/poi/geocode", "POST", JSON.stringify({ address: "办公楼" })],
      ["https://lunch.example/api/groups/group-1/poi/search", "POST", JSON.stringify({ center, radius: 3000, page: 2 })],
      ["https://lunch.example/api/groups/group-1/settings", "PATCH", JSON.stringify({ searchCenter: center })],
      ["https://lunch.example/api/groups/group-1/restaurants/import", "POST", JSON.stringify(request)]
    ]);
  });
});
