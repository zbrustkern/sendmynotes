import { AccountError } from './http';
import type { AccountOccasion } from './contracts';

export type CivilDate = { year: number; month: number; day: number };
const pad = (n: number) => String(n).padStart(2, '0');
export const civilString = (date: CivilDate) => `${date.year}-${pad(date.month)}-${pad(date.day)}`;
export function validCivilDate({ year, month, day }: CivilDate): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}
export function shiftCivilDate(date: CivilDate, days: number): CivilDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
export function localCivilDate(at: number, timeZone: string): CivilDate {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at); }
  catch { throw new AccountError('invalid_timezone', 'Choose a valid time zone.'); }
  const val = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: val('year'), month: val('month'), day: val('day') };
}
export function validTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(0); return true; } catch { return false; }
}

/** Converts local wall time to UTC by iteratively applying the zone offset. */
export function localTimeToEpoch(date: CivilDate, hour: number, timeZone: string): number {
  if (!validTimeZone(timeZone)) throw new AccountError('invalid_timezone', 'Choose a valid time zone.');
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', hourCycle:'h23' }).formatToParts(guess);
    const n = (type: string) => Number(p.find(x => x.type === type)?.value);
    const represented = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
    const delta = target - represented;
    if (!delta) return guess;
    guess += delta;
  }
  return guess;
}

export function validateOccasionDate(input: Pick<AccountOccasion, 'month'|'day'|'year'|'recurrence'|'leapDayPolicy'>): void {
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12 || !Number.isInteger(input.day) || input.day < 1 || input.day > 31) throw new AccountError('invalid_date', 'Choose a real calendar date.');
  if (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2200)) throw new AccountError('invalid_date', 'Choose a year between 1900 and 2200.');
  if (input.recurrence === 'once') {
    if (!input.year || !validCivilDate({ year: input.year, month: input.month, day: input.day })) throw new AccountError('invalid_date', 'A one-time date needs a valid year and date.');
  } else if (input.recurrence !== 'annual' || !validCivilDate({ year: 2000, month: input.month, day: input.day })) {
    // Year 2000 permits February 29 while rejecting dates such as April 31.
    throw new AccountError('invalid_date', 'Choose a real annual calendar date.');
  }
  if (input.leapDayPolicy !== 'feb28' && input.leapDayPolicy !== 'mar1') throw new AccountError('invalid_date', 'Choose a leap-day rule.');
}

export function occurrenceDate(event: Pick<AccountOccasion,'month'|'day'|'year'|'recurrence'|'leapDayPolicy'>, today: CivilDate): CivilDate | null {
  if (event.recurrence === 'once') {
    const date = { year: Number(event.year), month: event.month, day: event.day };
    return validCivilDate(date) && civilString(date) >= civilString(today) ? date : null;
  }
  for (let year = today.year; year <= today.year + 1; year++) {
    let month = event.month, day = event.day;
    if (month === 2 && day === 29 && !validCivilDate({ year, month, day })) {
      if (event.leapDayPolicy === 'mar1') { month = 3; day = 1; }
      else day = 28;
    }
    const candidate = { year, month, day };
    if (civilString(candidate) >= civilString(today)) return candidate;
  }
  return null;
}

export function occurrenceSchedule(event: AccountOccasion, timeZone: string, now = Date.now()): { date: string; dueLocalDate: string; dueAt: number; daysUntil: number; late: boolean } | null {
  const today = localCivilDate(now, timeZone);
  const next = occurrenceDate(event, today);
  if (!next) return null;
  const daysUntil = Math.round((Date.UTC(next.year,next.month-1,next.day)-Date.UTC(today.year,today.month-1,today.day))/86400000);
  const date = civilString(next);
  if (daysUntil === 0) return { date, dueLocalDate: civilString(today), dueAt: 0, daysUntil, late: false };
  if (daysUntil < event.leadDays) {
    const dueLocal = shiftCivilDate(today, 1);
    return { date, dueLocalDate: civilString(dueLocal), dueAt: localTimeToEpoch(dueLocal, 9, timeZone), daysUntil, late: true };
  }
  const reminderDate = shiftCivilDate(next, -event.leadDays);
  const dueAt = localTimeToEpoch(reminderDate, 9, timeZone);
  return { date, dueLocalDate: civilString(reminderDate), dueAt, daysUntil, late: false };
}
