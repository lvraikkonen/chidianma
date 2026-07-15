const STRICT_REMINDER_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const STRICT_OFFICE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SECOND_REMINDER_DELAY_MS = 20 * 60 * 1000;

export function getNextAlarmTime(
  now: Date,
  reminderTime: string,
  officeTimeZone = "Asia/Shanghai"
): number {
  const [hour, minute] = parseReminderTime(reminderTime);
  assertTimeZone(officeTimeZone);
  const weekdays = new Set([1, 2, 3, 4, 5]);
  const officeToday = getZonedParts(now, officeTimeZone);

  for (let offset = 0; offset < 14; offset += 1) {
    const officeDate = addCalendarDays(officeToday, offset);
    const weekday = new Date(Date.UTC(
      officeDate.year,
      officeDate.month - 1,
      officeDate.day
    )).getUTCDay();
    if (!weekdays.has(weekday)) continue;
    const candidate = resolveWallTime(
      officeDate.year,
      officeDate.month,
      officeDate.day,
      hour,
      minute,
      officeTimeZone
    );
    if (candidate > now.getTime() + 1000) return candidate;
  }

  throw new Error("next_reminder_time_unavailable");
}

export function getOfficeWallTime(
  officeDate: string,
  reminderTime: string,
  officeTimeZone: string
): number {
  if (!STRICT_OFFICE_DATE.test(officeDate)) {
    throw new Error("invalid_office_date");
  }
  const [year, month, day] = officeDate.split("-").map(Number) as [
    number,
    number,
    number
  ];
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() + 1 !== month
    || normalized.getUTCDate() !== day
  ) {
    throw new Error("invalid_office_date");
  }
  const [hour, minute] = parseReminderTime(reminderTime);
  assertTimeZone(officeTimeZone);
  return resolveWallTime(year, month, day, hour, minute, officeTimeZone);
}

export function getSecondReminderTime(primaryCompletedAt: number): number {
  return primaryCompletedAt + SECOND_REMINDER_DELAY_MS;
}

function parseReminderTime(value: string): [number, number] {
  if (!STRICT_REMINDER_TIME.test(value)) {
    throw new Error("invalid_reminder_time");
  }
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  return [hour, minute];
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw new Error("invalid_office_timezone");
  }
}

function addCalendarDays(parts: ZonedParts, days: number): ZonedParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0
  };
}

function resolveWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  const requestedWallTime = Date.UTC(year, month - 1, day, hour, minute);
  for (let deltaMinutes = 0; deltaMinutes <= 180; deltaMinutes += 1) {
    const wall = new Date(requestedWallTime + deltaMinutes * 60_000);
    const matches = getMatchingInstants({
      year: wall.getUTCFullYear(),
      month: wall.getUTCMonth() + 1,
      day: wall.getUTCDate(),
      hour: wall.getUTCHours(),
      minute: wall.getUTCMinutes(),
      second: 0
    }, timeZone);
    if (matches.length > 0) return matches[0]!;
  }
  throw new Error("office_wall_time_unavailable");
}

function getMatchingInstants(wall: ZonedParts, timeZone: string): number[] {
  const targetAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute
  );
  const probes = [-36, -12, 0, 12, 36].map(
    (hours) => targetAsUtc + hours * 60 * 60 * 1000
  );
  const offsets = new Set(probes.map((probe) => getOffsetMinutes(
    new Date(probe),
    timeZone
  )));
  const matches = [...offsets].flatMap((offsetMinutes) => {
    const candidate = targetAsUtc - offsetMinutes * 60_000;
    const actual = getZonedParts(new Date(candidate), timeZone);
    return sameWallMinute(actual, wall) ? [candidate] : [];
  });
  return [...new Set(matches)].sort((left, right) => left - right);
}

function getOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((representedAsUtc - date.getTime()) / 60_000);
}

function sameWallMinute(left: ZonedParts, right: ZonedParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: requireDatePart(values, "year"),
    month: requireDatePart(values, "month"),
    day: requireDatePart(values, "day"),
    hour: requireDatePart(values, "hour"),
    minute: requireDatePart(values, "minute"),
    second: requireDatePart(values, "second")
  };
}

function requireDatePart(values: Record<string, number>, part: string): number {
  const value = values[part];
  if (value === undefined) throw new Error(`Missing ${part} in formatted office time`);
  return value;
}
