import {
  parseISO,
  differenceInCalendarDays,
  addDays,
  format,
} from "date-fns";

export interface WorkSchedule {
  workDays: number[]; // ISO weekday: 1 = Monday, 7 = Sunday
}

export interface HolidayCalendar {
  holidays: string[]; // YYYY-MM-DD strings
}

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri

/** Convert JS Date.getDay() (0 = Sunday) to ISO weekday (1 = Monday, 7 = Sunday) */
function toIsoWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

/** True if the date falls on a working day (not a weekend and not a holiday) */
export function isWorkDay(
  date: Date,
  workSchedule?: WorkSchedule | null,
  holidaySet?: Set<string>
): boolean {
  const workDays = workSchedule?.workDays ?? DEFAULT_WORK_DAYS;
  if (!workDays.includes(toIsoWeekday(date.getDay()))) return false;
  if (holidaySet) {
    const dateStr = format(date, "yyyy-MM-dd");
    if (holidaySet.has(dateStr)) return false;
  }
  return true;
}

/** Count inclusive calendar days from startDate to endDate (YYYY-MM-DD strings) */
export function countCalendarDays(startDate: string, endDate: string): number {
  return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

/** Count inclusive working days from startDate to endDate, excluding weekends and holidays */
export function countBusinessDays(
  startDate: string,
  endDate: string,
  workSchedule?: WorkSchedule | null,
  holidays?: string[] | null
): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const holidaySet = holidays?.length ? new Set(holidays) : undefined;
  let count = 0;
  let current = start;
  while (current <= end) {
    if (isWorkDay(current, workSchedule, holidaySet)) count++;
    current = addDays(current, 1);
  }
  return count;
}

/**
 * Calendar hours from now until the start of startDate.
 * Returns a negative number if startDate is in the past.
 */
export function getHoursUntilStart(startDate: string, now: Date = new Date()): number {
  const start = parseISO(startDate);
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/** True if the date ranges [aStart, aEnd] and [bStart, bEnd] overlap (YYYY-MM-DD strings) */
export function dateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** Format a Date to YYYY-MM-DD */
export function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Parse a YYYY-MM-DD string as local midnight.
 * `new Date("2024-04-10")` parses as UTC midnight, which in US timezones
 * renders as April 9. This parses as local time instead.
 * Accepts string | Date so Drizzle date columns work without manual toString().
 */
export function parseLocalDate(date: string | Date): Date {
  const str = typeof date === "string" ? date : format(date, "yyyy-MM-dd");
  const [year, month, day] = str.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Count calendar days of the gap between two non-overlapping date ranges.
 * Returns 0 if they overlap (gap validator won't use this in that case).
 */
export function gapBetweenRanges(
  aEnd: string,
  bStart: string
): number {
  // bStart must be after aEnd
  const days = differenceInCalendarDays(parseISO(bStart), parseISO(aEnd));
  return Math.max(0, days - 1);
}
