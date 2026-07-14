import { describe, expect, it } from "vitest";
import { parseAdminRoute } from "../src/app/router";

describe("admin router", () => {
  it.each([
    ["#login", "login"],
    ["#today", "today"],
    ["#restaurants", "restaurants"],
    ["#dashboard", "today"],
    ["", "today"]
  ] as const)("maps %s to %s", (hash, route) => {
    expect(parseAdminRoute(hash)).toBe(route);
  });
});
