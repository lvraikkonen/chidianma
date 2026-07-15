import { describe, expect, it } from "vitest";
import {
  getOfficeCalendarWindows,
  getOfficeDate,
  getOfficeWeekdayTag
} from "../src/services/dates";

describe("getOfficeDate", () => {
  it("uses office timezone for date boundaries", () => {
    const date = getOfficeDate(new Date("2026-07-06T17:00:00.000Z"), "Asia/Shanghai");
    expect(date).toBe("2026-07-07");
  });

  it("returns office weekday tag", () => {
    const weekday = getOfficeWeekdayTag(new Date("2026-07-06T17:00:00.000Z"), "Asia/Shanghai");
    expect(weekday).toBe("tuesday");
  });
});

describe("getOfficeCalendarWindows", () => {
  it("builds Monday weeks, rolling windows, and the natural month in Shanghai", () => {
    const windows = getOfficeCalendarWindows(
      new Date("2026-07-14T04:00:00.000Z"),
      "Asia/Shanghai"
    );

    expect(windows).toEqual({
      officeDate: "2026-07-14",
      currentWeek: { startDate: "2026-07-13", endDate: "2026-07-19" },
      previousWeek: { startDate: "2026-07-06", endDate: "2026-07-12" },
      rolling7: { startDate: "2026-07-08", endDate: "2026-07-14" },
      rolling30: { startDate: "2026-06-15", endDate: "2026-07-14" },
      currentMonth: { startDate: "2026-07-01", endDate: "2026-07-31" },
      currentMonthUtc: {
        startAt: new Date("2026-06-30T16:00:00.000Z"),
        endAt: new Date("2026-07-31T16:00:00.000Z")
      }
    });
  });

  it("uses DST-aware local month boundaries in Los Angeles", () => {
    const windows = getOfficeCalendarWindows(
      new Date("2026-03-10T18:00:00.000Z"),
      "America/Los_Angeles"
    );

    expect(windows.currentMonthUtc).toEqual({
      startAt: new Date("2026-03-01T08:00:00.000Z"),
      endAt: new Date("2026-04-01T07:00:00.000Z")
    });
  });

  it("keeps Monday week boundaries across years", () => {
    const windows = getOfficeCalendarWindows(
      new Date("2026-01-01T04:00:00.000Z"),
      "Asia/Shanghai"
    );

    expect(windows.currentWeek).toEqual({
      startDate: "2025-12-29",
      endDate: "2026-01-04"
    });
    expect(windows.previousWeek).toEqual({
      startDate: "2025-12-22",
      endDate: "2025-12-28"
    });
  });

  it("rejects invalid IANA timezones", () => {
    expect(() => getOfficeCalendarWindows(new Date(), "Mars/Olympus_Mons")).toThrow(
      "Invalid office timezone"
    );
  });
});
