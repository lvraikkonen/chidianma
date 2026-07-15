import { describe, expect, it } from "vitest";
import { GROUP_ROUTES } from "../src";
import type {
  DashboardResponse,
  GroupSettingsResponse,
  MembersResponse,
  PersonalLunchHistoryResponse,
  RecommendationHistoryResponse
} from "../src";

describe("Stage 5A shared contracts", () => {
  it("defines the group operations routes", () => {
    expect(GROUP_ROUTES.dashboard("group-1")).toBe("/api/groups/group-1/dashboard");
    expect(GROUP_ROUTES.history("group-1")).toBe("/api/groups/group-1/history");
    expect(GROUP_ROUTES.personalHistory("group-1")).toBe("/api/groups/group-1/history/me");
    expect(GROUP_ROUTES.settings("group-1")).toBe("/api/groups/group-1/settings");
    expect(GROUP_ROUTES.rotateInviteCode("group-1")).toBe(
      "/api/groups/group-1/invite-code/rotate"
    );
    expect(GROUP_ROUTES.member("group-1", "membership-1")).toBe(
      "/api/groups/group-1/members/membership-1"
    );
  });

  it("supports explicit ready and insufficient dashboard data", () => {
    const response: DashboardResponse = {
      groupId: "group-1",
      officeDate: "2026-07-14",
      officeTimezone: "Asia/Shanghai",
      today: {
        activeMemberCount: 3,
        joiningCount: 1,
        decidedCount: 1,
        awayCount: 0,
        undecidedCount: 1
      },
      currentWeek: {
        startDate: "2026-07-13",
        endDate: "2026-07-19",
        decidedCount: 2,
        distinctMemberCount: 1,
        averagePrice: { status: "insufficient" }
      },
      previousWeek: {
        startDate: "2026-07-06",
        endDate: "2026-07-12",
        decidedCount: 4
      },
      restaurantCounts: { active: 2, paused: 1, blocked: 0 },
      topRestaurants: [],
      categoryDistribution: { status: "insufficient", decidedCount: 2 },
      recentActivity: []
    };

    expect(response.currentWeek.averagePrice.status).toBe("insufficient");
    expect(response.categoryDistribution.status).toBe("insufficient");
  });

  it("locks history, settings, and member response boundaries", () => {
    const history: RecommendationHistoryResponse = {
      groupId: "group-1",
      items: [],
      nextCursor: undefined
    };
    const personal: PersonalLunchHistoryResponse = {
      groupId: "group-1",
      membershipId: "membership-1",
      window: { startDate: "2026-06-15", endDate: "2026-07-14" },
      items: [],
      preference: { status: "insufficient", decidedCount: 0 }
    };
    const settings: GroupSettingsResponse = {
      groupId: "group-1",
      group: {
        name: "Dev Team",
        subtitle: "Lunch",
        officeTimezone: "Asia/Shanghai",
        officeCity: "Shanghai",
        officeLatitude: 31.23,
        officeLongitude: 121.47
      },
      reminder: {
        reminderTime: "11:30",
        weekdayReminderEnabled: true,
        secondReminderEnabled: false,
        notificationTitle: "吃饭才是正事，中午吃点啥呢？",
        notificationGroupLabel: "Lunch"
      },
      scoringWeights: {
        weekdayMatch: 20,
        weatherMatch: 25,
        distance: 20,
        teammateRecommendation: 10,
        recentDuplicatePenalty: 12,
        negativeFeedbackPenalty: 10
      },
      invite: { version: 1, rotatedAt: "2026-07-14T00:00:00.000Z" }
    };
    const members: MembersResponse = {
      groupId: "group-1",
      contributionWindow: {
        startAt: "2026-07-01T00:00:00.000Z",
        endAt: "2026-08-01T00:00:00.000Z"
      },
      members: []
    };

    expect(history.items).toEqual([]);
    expect(personal.preference.status).toBe("insufficient");
    expect(settings.invite.version).toBe(1);
    expect(members.members).toEqual([]);
  });
});
