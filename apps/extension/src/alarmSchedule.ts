export function getNextAlarmTime(
  now: Date,
  reminderTime: string,
  officeTimeZone = "Asia/Shanghai"
): number {
  const [hour, minute] = parseReminderTime(reminderTime);
  const weekdays = new Set([1, 2, 3, 4, 5]);
  const officeToday = getZonedParts(now, officeTimeZone);

  for (let offset = 0; offset < 14; offset += 1) {
    const officeDate = addCalendarDays(officeToday, offset);
    const weekday = new Date(Date.UTC(officeDate.year, officeDate.month - 1, officeDate.day)).getUTCDay();
    const candidate = zonedDateTimeToUtc(
      officeDate.year,
      officeDate.month,
      officeDate.day,
      hour,
      minute,
      officeTimeZone
    );
    if (weekdays.has(weekday) && candidate > now.getTime() + 1000) {
      return candidate;
    }
  }

  const fallbackDate = addCalendarDays(officeToday, 1);
  return zonedDateTimeToUtc(
    fallbackDate.year,
    fallbackDate.month,
    fallbackDate.day,
    hour,
    minute,
    officeTimeZone
  );
}

function parseReminderTime(value: string): [number, number] {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return [11, 30];
  return [
    Math.min(23, Math.max(0, Number(match[1]))),
    Math.min(59, Math.max(0, Number(match[2])))
  ];
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

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedParts(new Date(guess), timeZone);
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

  return guess;
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
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
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
  if (value === undefined) {
    throw new Error(`Missing ${part} in formatted office time`);
  }
  return value;
}
