export function getNextAlarmTime(now: Date, reminderTime: string): number {
  const [hour, minute] = parseReminderTime(reminderTime);
  const weekdays = new Set([1, 2, 3, 4, 5]);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (weekdays.has(candidate.getDay()) && candidate.getTime() > now.getTime() + 1000) {
      return candidate.getTime();
    }
  }

  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 1);
  fallback.setHours(hour, minute, 0, 0);
  return fallback.getTime();
}

function parseReminderTime(value: string): [number, number] {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return [11, 30];
  return [
    Math.min(23, Math.max(0, Number(match[1]))),
    Math.min(59, Math.max(0, Number(match[2])))
  ];
}
