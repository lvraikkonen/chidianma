import { describe, expect, it } from "vitest";
import { getNextAlarmTime } from "../src/alarmSchedule";

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
});
