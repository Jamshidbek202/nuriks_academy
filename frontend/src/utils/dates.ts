export function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ACADEMY_TIMEZONE = 'Asia/Tashkent';

function academyCalendarDate(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ACADEMY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}

function toUtcCalendarDateString(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayDateString() {
  return toUtcCalendarDateString(academyCalendarDate());
}

export function dateStringWithOffset(days: number) {
  const date = academyCalendarDate();
  date.setUTCDate(date.getUTCDate() + days);
  return toUtcCalendarDateString(date);
}

const SCHEDULE_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/**
 * Return the canonical weekday used by group schedules.
 *
 * Schedule values are stored in English regardless of the user's interface
 * language. Deriving this through a localized formatter made Russian and
 * Uzbek attendance screens compare translated labels against `monday`, etc.
 */
export function scheduleWeekdayFromDateString(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return '';
  return SCHEDULE_WEEKDAYS[date.getUTCDay()];
}

/** Calculate a person's current age from a calendar date without timezone drift. */
export function ageFromDateOfBirth(value?: string | null, todayValue = todayDateString()) {
  const birthMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayValue);
  if (!birthMatch || !todayMatch) return null;
  const [, birthYear, birthMonth, birthDay] = birthMatch.map(Number);
  const [, todayYear, todayMonth, todayDay] = todayMatch.map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}
