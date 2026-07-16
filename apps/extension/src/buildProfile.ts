declare const __LUNCH_EXTENSION_PROFILE__: "dev" | "internal";
declare const __LUNCH_PRODUCTION_API_ORIGIN__: string;

export type ExtensionBuildProfile = "dev" | "internal";

export const EXTENSION_BUILD_PROFILE: ExtensionBuildProfile =
  typeof __LUNCH_EXTENSION_PROFILE__ === "undefined"
    ? "dev"
    : __LUNCH_EXTENSION_PROFILE__;

export const PRODUCTION_API_ORIGIN =
  typeof __LUNCH_PRODUCTION_API_ORIGIN__ === "undefined"
    ? "https://lunchserver-production.up.railway.app"
    : __LUNCH_PRODUCTION_API_ORIGIN__;

export const DEV_ALLOWED_API_BASE_URLS = [
  "http://localhost:3000",
  PRODUCTION_API_ORIGIN
] as const;

export function isAllowedDevApiBaseUrl(value: string): boolean {
  return DEV_ALLOWED_API_BASE_URLS.some((allowed) => allowed === value);
}

export const DEFAULT_API_BASE_URL = EXTENSION_BUILD_PROFILE === "internal"
  ? PRODUCTION_API_ORIGIN
  : "http://localhost:3000";

export const IS_INTERNAL_BUILD = EXTENSION_BUILD_PROFILE === "internal";
