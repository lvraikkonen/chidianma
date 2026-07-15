export type AdminRoute = "login" | "today" | "restaurants" | "dashboard" | "settings";

export function parseAdminRoute(hash: string): AdminRoute {
  if (hash === "#login") return "login";
  if (hash === "#restaurants") return "restaurants";
  if (hash === "#dashboard") return "dashboard";
  if (hash === "#settings") return "settings";
  return "today";
}

export function navigate(route: AdminRoute): void {
  window.location.hash = `#${route}`;
}

export function subscribeRoute(listener: (route: AdminRoute) => void): () => void {
  const handle = () => listener(parseAdminRoute(window.location.hash));
  window.addEventListener("hashchange", handle);
  return () => window.removeEventListener("hashchange", handle);
}
