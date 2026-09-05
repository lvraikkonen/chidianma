import {
  GROUP_ROUTES,
  type GroupCapabilitiesResponse,
  type GroupSettingsResponse,
  type PoiGeocodeRequest,
  type PoiGeocodeResponse,
  type PoiSearchCenter,
  type PoiSearchRequest,
  type PoiSearchResponse,
  type RestaurantImportRequest,
  type RestaurantImportResponse
} from "@lunch/shared";
import { requestJson } from "../api";
import type { AdminGroupContext } from "./today";

export function getOnboardingCapabilities(context: AdminGroupContext) {
  return requestJson<GroupCapabilitiesResponse>(GROUP_ROUTES.capabilities(context.groupId), context);
}

export function getOnboardingSettings(context: AdminGroupContext) {
  return requestJson<GroupSettingsResponse>(GROUP_ROUTES.settings(context.groupId), context);
}

export function geocodePoi(context: AdminGroupContext, input: PoiGeocodeRequest) {
  return requestJson<PoiGeocodeResponse>(GROUP_ROUTES.poiGeocode(context.groupId), context, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function searchPoi(context: AdminGroupContext, input: PoiSearchRequest) {
  return requestJson<PoiSearchResponse>(GROUP_ROUTES.poiSearch(context.groupId), context, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function patchSearchCenter(context: AdminGroupContext, searchCenter: PoiSearchCenter | null) {
  return requestJson<GroupSettingsResponse>(GROUP_ROUTES.settings(context.groupId), context, {
    method: "PATCH",
    body: JSON.stringify({ searchCenter })
  });
}

export function importRestaurants(context: AdminGroupContext, input: RestaurantImportRequest) {
  return requestJson<RestaurantImportResponse>(GROUP_ROUTES.restaurantImport(context.groupId), context, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
