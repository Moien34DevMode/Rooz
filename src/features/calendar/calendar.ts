import { CalendarDate, GregorianCalendar, PersianCalendar, toCalendar, today, getLocalTimeZone } from '@internationalized/date';
import type { CalendarSystem } from '../../domain/models';

const gregorian = new GregorianCalendar();
const persian = new PersianCalendar();
export const todayKey = () => today(getLocalTimeZone()).toString();
export function parseDate(key: string) { const [y, m, d] = key.split('-').map(Number); return new CalendarDate(y, m, d); }
export function toDateKey(date: CalendarDate) { return date.toString(); }
export function shiftDate(key: string, days: number) { return parseDate(key).add({ days }).toString(); }
export function shiftMonth(key: string, months: number, system: CalendarSystem = 'gregorian') { const calendar = system === 'persian' ? persian : gregorian; const shown = toCalendar(parseDate(key), calendar).add({ months }); return toCalendar(shown, gregorian).toString(); }
export function shiftYear(key: string, years: number, system: CalendarSystem = 'gregorian') { const calendar = system === 'persian' ? persian : gregorian; const shown = toCalendar(parseDate(key), calendar).add({ years }); return toCalendar(shown, gregorian).toString(); }
export function calendarMonthKey(year: number, month: number, system: CalendarSystem) { const calendar = system === 'persian' ? persian : gregorian; return toCalendar(new CalendarDate(calendar, year, month, 1), gregorian).toString(); }
export function calendarYearEndKey(year: number, system: CalendarSystem) { const lastMonth = getMonthDays(calendarMonthKey(year, 12, system), system); return lastMonth.dates[lastMonth.dates.length - 1]; }
export function formatDate(key: string, system: CalendarSystem, options: Intl.DateTimeFormatOptions = {}) {
  const date = parseDate(key);
  const converted = toCalendar(date, system === 'persian' ? persian : gregorian);
  const dateTime = new Date(date.year, date.month - 1, date.day, 12);
  return new Intl.DateTimeFormat(system === 'persian' ? 'fa-IR-u-ca-persian' : 'en-GB-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', ...options }).format(dateTime || converted.toDate(getLocalTimeZone()));
}
export function calendarParts(key: string, system: CalendarSystem) {
  const date = parseDate(key);
  const value = toCalendar(date, system === 'persian' ? persian : gregorian);
  return { year: value.year, month: value.month, day: value.day };
}
export function getMonthDays(key: string, system: CalendarSystem) {
  const base = parseDate(key);
  const shown = toCalendar(base, system === 'persian' ? persian : gregorian);
  const first = new CalendarDate(system === 'persian' ? persian : gregorian, shown.year, shown.month, 1);
  const count = first.calendar.getDaysInMonth(first);
  const offset = (first.toDate(getLocalTimeZone()).getDay() + 1) % 7;
  return { year: shown.year, month: shown.month, count, offset, dates: Array.from({ length: count }, (_, i) => toCalendar(first.add({ days: i }), gregorian).toString()) };
}
