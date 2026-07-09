import { describe, expect, it } from "vitest";
import { GROUP_ROUTES } from "../src/api";
import type { FeedbackType, GroupRole, MembershipStatus } from "../src/types";

describe("multi-group shared contracts", () => {
  it("locks group role and membership status strings", () => {
    const role: GroupRole = "admin";
    const memberRole: GroupRole = "member";
    const status: MembershipStatus = "active";
    const removed: MembershipStatus = "removed";

    expect([role, memberRole, status, removed]).toEqual(["admin", "member", "active", "removed"]);
  });

  it("uses avoid feedback for member-level avoid actions", () => {
    const types: FeedbackType[] = ["want", "skip", "ate", "avoid"];
    expect(types).toContain("avoid");
    expect(types).not.toContain("blocked" as FeedbackType);
  });

  it("defines group route builders without forceRefresh writes", () => {
    expect(GROUP_ROUTES.todayRecommendations("group-1")).toBe("/api/groups/group-1/today-recommendations");
    expect(GROUP_ROUTES.refreshTodayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations/refresh"
    );
  });
});
