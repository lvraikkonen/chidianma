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
  env: LuckyRestaurantWheelEnv,
  groupId: string
): GroupCapabilitiesResponse {
  return {
    groupId,
    features: {
      luckyRestaurantWheel: isLuckyRestaurantWheelEnabled(env, groupId),
      poiReferenceSearch: false,
      poiReferenceDraft: false,
      poiOfficePreset: false,
      poiProvider: null
    }
  };
}
