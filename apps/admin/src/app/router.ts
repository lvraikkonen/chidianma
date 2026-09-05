export type AdminRoute = "login" | "today" | "restaurants" | "dashboard" | "settings";
export type RestaurantRouteMode = "bulk" | "nearby";
export interface RestaurantRouteIntent {
  groupId?: string | undefined;
  mode?: RestaurantRouteMode | undefined;
}

export function parseAdminRoute(hash: string): AdminRoute {
  const route = hash.slice(1).split("?", 1)[0];
  if (route === "login") return "login";
  if (route === "restaurants") return "restaurants";
  if (route === "dashboard") return "dashboard";
  if (route === "settings") return "settings";
  return "today";
}

export function parseRestaurantRouteIntent(hash: string): RestaurantRouteIntent | null {
  if (parseAdminRoute(hash) !== "restaurants") return null;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  const groupId = params.get("groupId")?.trim();
  const rawMode = params.get("mode");
  const mode = rawMode === "bulk" || rawMode === "nearby" ? rawMode : undefined;
  return {
    ...(groupId ? { groupId } : {}),
    ...(mode ? { mode } : {})
  };
}

export function formatRestaurantRoute(intent: RestaurantRouteIntent = {}): string {
  const params = new URLSearchParams();
  if (intent.groupId) params.set("groupId", intent.groupId);
  if (intent.mode) params.set("mode", intent.mode);
  const query = params.toString();
  return `#restaurants${query ? `?${query}` : ""}`;
}

export type RestaurantDestinationResolution =
  | { kind: "none" }
  | { kind: "ready"; groupId?: string | undefined }
  | { kind: "switch"; groupId: string }
  | { kind: "unauthorized"; groupId: string };

export function resolveRestaurantDestination(
  intent: RestaurantRouteIntent | null,
  groups: Array<{ groupId: string }>,
  activeGroupId?: string
): RestaurantDestinationResolution {
  if (!intent) return { kind: "none" };
  if (!intent.groupId) return { kind: "ready", ...(activeGroupId ? { groupId: activeGroupId } : {}) };
  if (!groups.some((group) => group.groupId === intent.groupId)) {
    return { kind: "unauthorized", groupId: intent.groupId };
  }
  if (activeGroupId !== intent.groupId) return { kind: "switch", groupId: intent.groupId };
  return { kind: "ready", groupId: intent.groupId };
}

export function navigate(route: AdminRoute): void {
  window.location.hash = `#${route}`;
}

export function navigateRestaurants(intent: RestaurantRouteIntent = {}): void {
  window.location.hash = formatRestaurantRoute(intent);
}

export function subscribeRoute(listener: (route: AdminRoute) => void): () => void {
  const handle = () => listener(parseAdminRoute(window.location.hash));
  window.addEventListener("hashchange", handle);
  return () => window.removeEventListener("hashchange", handle);
}
