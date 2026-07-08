import { describe, expect, it } from "vitest";
import { getNextAlarmTime } from "../src/alarmSchedule";

describe("getNextAlarmTime", () => {
  it("schedules the next weekday 11:30 when today is already past lunch", () => {
    const now = new Date("2026-07-06T20:00:00");
    const next = new Date(getNextAlarmTime(now, "11:30"));
    expect(next.getDay()).toBe(2);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(30);
  });
});
