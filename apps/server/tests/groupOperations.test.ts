import { DEFAULT_GROUP_SCORING_WEIGHTS, LUNCH_HEADLINE } from "@lunch/shared";
import { describe, expect, it } from "vitest";
import {
  buildGroupSettingsResponse,
  buildMembersResponse,
  parseGroupSettingsPatch
} from "../src/services/groups/operations";

const group = {
  id: "group-1",
  name: "Dev Team",
  subtitle: "Lunch",
  officeTimezone: "Asia/Shanghai",
  officeCity: "Shanghai",
  officeLatitude: 31.23,
  officeLongitude: 121.47,
  inviteCodeVersion: 2,
  inviteCodeRotatedAt: new Date("2026-07-14T00:00:00.000Z")
};

describe("group settings", () => {
  it("returns defaults without requiring persisted settings or weights", () => {
    expect(buildGroupSettingsResponse({ group, settings: null, weights: null })).toEqual({
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
        notificationTitle: LUNCH_HEADLINE,
        notificationGroupLabel: "Dev Team"
      },
      scoringWeights: DEFAULT_GROUP_SCORING_WEIGHTS,
      invite: { version: 2, rotatedAt: "2026-07-14T00:00:00.000Z" }
    });
  });

  it("parses and trims a partial settings patch", () => {
    expect(parseGroupSettingsPatch({
      group: {
        name: "  Product Team  ",
        subtitle: null,
        officeTimezone: "America/Los_Angeles",
        officeLatitude: 34.05,
        officeLongitude: -118.24
      },
      reminder: {
        reminderTime: "11:45",
        weekdayReminderEnabled: false,
        notificationGroupLabel: null
      },
      scoringWeights: { weatherMatch: 40, recentDuplicatePenalty: 20 }
    })).toEqual({
      group: {
        name: "Product Team",
        subtitle: null,
        officeTimezone: "America/Los_Angeles",
        officeLatitude: 34.05,
        officeLongitude: -118.24
      },
      reminder: {
        reminderTime: "11:45",
        weekdayReminderEnabled: false,
        notificationGroupLabel: null
      },
      scoringWeights: { weatherMatch: 40, recentDuplicatePenalty: 20 }
    });
  });

  it.each([
    [{}, "at least one section"],
    [{ reminder: { reminderTime: "9:30" } }, "HH:mm"],
    [{ reminder: { secondReminderEnabled: "yes" } }, "boolean"],
    [{ scoringWeights: { weatherMatch: 101 } }, "integer from 0 to 100"],
    [{ group: { officeLatitude: 91 } }, "latitude"],
    [{ group: { officeLongitude: Number.NaN } }, "longitude"],
    [{ group: { officeTimezone: "Mars/Olympus" } }, "timezone"],
    [{ group: { name: "   " } }, "non-empty"],
    [{ group: { subtitle: 123 } }, "string or null"],
    [{ unknown: true }, "unknown field"]
  ] as const)("rejects invalid settings %#", (body, message) => {
    expect(() => parseGroupSettingsPatch(body)).toThrow(message);
  });
});

describe("member contribution response", () => {
  it("keeps removed members and sums current-month contribution types", () => {
    const response = buildMembersResponse({
      groupId: "group-1",
      window: {
        startAt: new Date("2026-06-30T16:00:00.000Z"),
        endAt: new Date("2026-07-31T16:00:00.000Z")
      },
      memberships: [
        {
          id: "member-1",
          displayName: "小李",
          role: "admin",
          status: "active",
          joinedAt: new Date("2026-06-01T00:00:00.000Z"),
          removedAt: null
        },
        {
          id: "member-2",
          displayName: "小王",
          role: "member",
          status: "removed",
          joinedAt: new Date("2026-06-02T00:00:00.000Z"),
          removedAt: new Date("2026-07-12T00:00:00.000Z")
        }
      ],
      restaurants: [{ createdByMembershipId: "member-2" }],
      recommendations: [
        { createdByMembershipId: "member-2" },
        { createdByMembershipId: "member-2" }
      ],
      feedback: [{ membershipId: "member-2" }, { membershipId: null }]
    });

    expect(response.members[1]).toMatchObject({
      membershipId: "member-2",
      status: "removed",
      contribution: {
        restaurantCount: 1,
        recommendationCount: 2,
        feedbackCount: 1,
        total: 4
      }
    });
  });
});
