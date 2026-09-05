import { describe, expect, it } from "vitest";
import {
  formatRestaurantRoute,
  parseAdminRoute,
  parseRestaurantRouteIntent,
  resolveRestaurantDestination
} from "../src/app/router";

describe("admin router", () => {
  it.each([
    ["#login", "login"],
    ["#today", "today"],
    ["#restaurants", "restaurants"],
    ["#restaurants?groupId=group%2Fone&mode=bulk", "restaurants"],
    ["#dashboard", "dashboard"],
    ["#settings", "settings"],
    ["#history", "today"],
    ["#members", "today"],
    ["", "today"]
  ] as const)("maps %s to %s", (hash, route) => {
    expect(parseAdminRoute(hash)).toBe(route);
  });

  it("round trips a credential-free restaurant destination", () => {
    const hash = formatRestaurantRoute({ groupId: "group/一", mode: "nearby" });

    expect(hash).toBe("#restaurants?groupId=group%2F%E4%B8%80&mode=nearby");
    expect(parseRestaurantRouteIntent(hash)).toEqual({
      groupId: "group/一",
      mode: "nearby"
    });
    expect(parseRestaurantRouteIntent("#restaurants?groupId=g&mode=other&token=secret"))
      .toEqual({ groupId: "g" });
  });

  it("refuses an unauthorized target and requests a switch only for a known membership", () => {
    const groups = [{ groupId: "allowed" }];

    expect(resolveRestaurantDestination({ groupId: "unknown", mode: "bulk" }, groups, "allowed"))
      .toEqual({ kind: "unauthorized", groupId: "unknown" });
    expect(resolveRestaurantDestination({ groupId: "allowed", mode: "nearby" }, groups, "other"))
      .toEqual({ kind: "switch", groupId: "allowed" });
    expect(resolveRestaurantDestination({ groupId: "allowed" }, groups, "allowed"))
      .toEqual({ kind: "ready", groupId: "allowed" });
  });
});
