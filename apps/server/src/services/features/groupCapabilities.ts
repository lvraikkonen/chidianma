import type { GroupCapabilitiesResponse } from "@lunch/shared";
import type { AppEnv } from "../../env.js";

type LuckyRestaurantWheelEnv = Pick<
  AppEnv,
  "LUCKY_RESTAURANT_WHEEL_ENABLED" | "LUCKY_RESTAURANT_WHEEL_GROUP_IDS"
>;

export function isLuckyRestaurantWheelEnabled(
  env: LuckyRestaurantWheelEnv,
  groupId: string
): boolean {
  return env.LUCKY_RESTAURANT_WHEEL_ENABLED
    && env.LUCKY_RESTAURANT_WHEEL_GROUP_IDS.some(
      (allowedGroupId) => allowedGroupId === groupId
    );
}

export function buildGroupCapabilities(
  env: LuckyRestaurantWheelEnv & Partial<AppEnv>,
  groupId: string
): GroupCapabilitiesResponse {
  const search = isOnboardingEnabled(env, groupId, "search");
  return {
    groupId,
    features: {
      luckyRestaurantWheel: isLuckyRestaurantWheelEnabled(env, groupId),
      restaurantBulkImport: isOnboardingEnabled(env, groupId, "bulk"),
      poiReferenceSearch: search,
      poiReferenceDraft: isOnboardingEnabled(env, groupId, "save"),
      poiOfficePreset: search,
      poiProvider: search ? env.POI_PROVIDER ?? "mock" : null
    }
  };
}

export function isOnboardingEnabled(env: Partial<AppEnv>, groupId: string, feature: "bulk" | "search" | "save"): boolean {
  const [enabled, groups] = feature === "bulk"
    ? [env.RESTAURANT_BULK_IMPORT_ENABLED, env.RESTAURANT_BULK_IMPORT_GROUP_IDS]
    : feature === "search" ? [env.POI_SEARCH_ENABLED, env.POI_SEARCH_GROUP_IDS]
      : [env.POI_SAVE_ENABLED, env.POI_SAVE_GROUP_IDS];
  return enabled === true && groupId !== "*" && (groups ?? []).includes(groupId);
}
