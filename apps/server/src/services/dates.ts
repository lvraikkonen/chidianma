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

export interface OfficeDateRange {
  startDate: string;
  endDate: string;
}

export interface OfficeCalendarWindows {
  officeDate: string;
  currentWeek: OfficeDateRange;
  previousWeek: OfficeDateRange;
  rolling7: OfficeDateRange;
  rolling30: OfficeDateRange;
  currentMonth: OfficeDateRange;
  currentMonthUtc: { startAt: Date; endAt: Date };
}

export function getOfficeCalendarWindows(
  now: Date,
  timezone: string
): OfficeCalendarWindows {
  assertValidOfficeTimezone(timezone);
  const officeDate = getOfficeDate(now, timezone);
  const parts = parseOfficeDate(officeDate);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const currentWeekStart = addOfficeDays(officeDate, mondayOffset);
  const previousWeekStart = addOfficeDays(currentWeekStart, -7);
  const monthStart = formatOfficeDate(parts.year, parts.month, 1);
  const nextMonth = parts.month === 12
    ? { year: parts.year + 1, month: 1 }
    : { year: parts.year, month: parts.month + 1 };
  const nextMonthStart = formatOfficeDate(nextMonth.year, nextMonth.month, 1);

  return {
    officeDate,
    currentWeek: {
      startDate: currentWeekStart,
      endDate: addOfficeDays(currentWeekStart, 6)
    },
    previousWeek: {
      startDate: previousWeekStart,
      endDate: addOfficeDays(previousWeekStart, 6)
    },
    rolling7: { startDate: addOfficeDays(officeDate, -6), endDate: officeDate },
    rolling30: { startDate: addOfficeDays(officeDate, -29), endDate: officeDate },
    currentMonth: {
      startDate: monthStart,
      endDate: addOfficeDays(nextMonthStart, -1)
    },
    currentMonthUtc: {
      startAt: zonedMidnightToUtc(monthStart, timezone),
      endAt: zonedMidnightToUtc(nextMonthStart, timezone)
    }
  };
}

export function assertValidOfficeTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error(`Invalid office timezone: ${timezone}`);
  }
}

function parseOfficeDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid office date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatOfficeDate(year: number, month: number, day: number): string {
  return [year, month, day]
    .map((value, index) => index === 0 ? String(value).padStart(4, "0") : String(value).padStart(2, "0"))
    .join("-");
}

function addOfficeDays(value: string, days: number): string {
  const parts = parseOfficeDate(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatOfficeDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function zonedMidnightToUtc(value: string, timezone: string): Date {
  const parts = parseOfficeDate(value);
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  let guess = targetAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getZonedDateTimeParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const adjustment = targetAsUtc - actualAsUtc;
    if (adjustment === 0) break;
    guess += adjustment;
  }

  return new Date(guess);
}

function getZonedDateTimeParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const values = new Map<string, number>(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const requirePart = (key: string) => {
    const result = values.get(key);
    if (result === undefined) throw new Error(`Missing ${key} in office time`);
    return result;
  };
  return {
    year: requirePart("year"),
    month: requirePart("month"),
    day: requirePart("day"),
    hour: requirePart("hour"),
    minute: requirePart("minute"),
    second: requirePart("second")
  };
}
