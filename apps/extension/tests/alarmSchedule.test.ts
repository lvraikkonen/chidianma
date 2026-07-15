import { describe, expect, it } from "vitest";
import {
  getNextAlarmTime,
  getOfficeWallTime,
  getSecondReminderTime
} from "../src/alarmSchedule";

describe("getNextAlarmTime", () => {
  it("schedules the default reminder in Asia/Shanghai when the browser timezone differs", () => {
    const now = new Date("2026-07-06T20:00:00.000Z");
    const next = new Date(getNextAlarmTime(now, "11:30"));

    expect(next.toISOString()).toBe("2026-07-07T03:30:00.000Z");
  });

  it("schedules the same office weekday when the office reminder time is still ahead", () => {
    const now = new Date("2026-07-07T02:00:00.000Z");
    const next = new Date(getNextAlarmTime(now, "11:30", "Asia/Shanghai"));

    expect(next.toISOString()).toBe("2026-07-07T03:30:00.000Z");
  });

  it("skips to the next office weekday when Friday lunch has passed", () => {
    const now = new Date("2026-07-10T04:00:00.000Z");
    const next = new Date(getNextAlarmTime(now, "11:30", "Asia/Shanghai"));

    expect(next.toISOString()).toBe("2026-07-13T03:30:00.000Z");
  });

  it("crosses an office month boundary without using the browser calendar", () => {
    const now = new Date("2026-07-31T04:00:00.000Z");
    const next = new Date(getNextAlarmTime(now, "11:30", "Asia/Shanghai"));

    expect(next.toISOString()).toBe("2026-08-03T03:30:00.000Z");
  });

  it("crosses an office year boundary", () => {
    const now = new Date("2026-12-31T04:00:00.000Z");
    const next = new Date(getNextAlarmTime(now, "11:30", "Asia/Shanghai"));

    expect(next.toISOString()).toBe("2027-01-01T03:30:00.000Z");
  });

  it.each(["9:30", "24:00", "12:60", "noon"])(
    "rejects invalid reminder time %s without clamping",
    (value) => {
      expect(() => getNextAlarmTime(new Date(), value)).toThrow(
        "invalid_reminder_time"
      );
    }
  );

  it("rejects an invalid IANA timezone", () => {
    expect(() => getNextAlarmTime(
      new Date("2026-07-07T02:00:00.000Z"),
      "11:30",
      "Mars/Olympus"
    )).toThrow("invalid_office_timezone");
  });

  it("advances a nonexistent Los Angeles wall time to the first valid instant", () => {
    const instant = new Date(getOfficeWallTime(
      "2026-03-08",
      "02:30",
      "America/Los_Angeles"
    ));

    expect(instant.toISOString()).toBe("2026-03-08T10:00:00.000Z");
  });

  it("uses the first occurrence of a repeated Los Angeles wall time", () => {
    const instant = new Date(getOfficeWallTime(
      "2026-11-01",
      "01:30",
      "America/Los_Angeles"
    ));

    expect(instant.toISOString()).toBe("2026-11-01T08:30:00.000Z");
  });

  it("schedules the second reminder exactly twenty minutes later", () => {
    expect(getSecondReminderTime(1_000)).toBe(1_201_000);
  });
});
