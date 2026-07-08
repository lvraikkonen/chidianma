import type { WeekdayTag } from "@lunch/shared";

const WEEKDAY_TAGS: Record<number, WeekdayTag | null> = {
  0: null,
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: null
};

const WEEKDAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function getOfficeDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not format office date for timezone ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}

export function getOfficeWeekdayTag(now: Date, timezone: string): WeekdayTag | null {
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short"
  }).formatToParts(now).find((part) => part.type === "weekday")?.value;
  const weekday = weekdayName ? WEEKDAY_INDEX_BY_SHORT_NAME[weekdayName] : undefined;
  return typeof weekday === "number" ? WEEKDAY_TAGS[weekday] ?? null : null;
}
