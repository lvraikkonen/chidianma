import { describe, expect, it } from "vitest";
import { getOfficeDate, getOfficeWeekdayTag } from "../src/services/dates";

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
