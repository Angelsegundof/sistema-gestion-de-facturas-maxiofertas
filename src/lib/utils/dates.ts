/**
 * Chilean Timezone and Date Utility Helpers (America/Santiago).
 * Handles standard time (UTC-4) and daylight saving time (UTC-3) dynamically.
 */

export const CHILE_TIMEZONE = "America/Santiago";

/**
 * Returns the exact UTC start (00:00:00.000) and end (23:59:59.999) timestamps
 * for a given reference date in Chilean local time (America/Santiago).
 */
export function getChileDayBounds(refDate: Date = new Date()): {
  startOfDay: Date;
  endOfDay: Date;
  chileDateStr: string;
} {
  const chileDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate); // Returns "YYYY-MM-DD"

  const [y, m, d] = chileDateStr.split("-").map(Number);

  // Probe offset at 12:00 UTC on that day
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(probe);

  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-4";
  const match = offsetPart.match(/GMT([+-]\d+)(?::(\d+))?/);
  let offsetMinutes = -240;
  if (match) {
    const hours = parseInt(match[1], 10);
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    offsetMinutes = hours * 60 + (hours < 0 ? -mins : mins);
  }

  const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMinutes * 60 * 1000);
  const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMinutes * 60 * 1000);

  return { startOfDay, endOfDay, chileDateStr };
}

/**
 * Returns the exact UTC start (1st day 00:00:00.000) and end (last day 23:59:59.999)
 * for a specified year and month (1-12) in Chilean local time (America/Santiago).
 */
export function getChileMonthBounds(
  year: number,
  month: number // 1-12
): {
  startOfMonth: Date;
  endOfMonth: Date;
} {
  // First day of month at 00:00:00 Santiago
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const firstBounds = getChileDayBounds(firstDay);

  // Last day of month
  const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = new Date(Date.UTC(year, month - 1, lastDayNum, 12, 0, 0));
  const lastBounds = getChileDayBounds(lastDay);

  return {
    startOfMonth: firstBounds.startOfDay,
    endOfMonth: lastBounds.endOfDay,
  };
}

/**
 * Returns the current calendar year and month in America/Santiago.
 */
export function getChileCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  const chileDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [y, m] = chileDateStr.split("-").map(Number);
  return { year: y, month: m };
}
