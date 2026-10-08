import type { CalendarSystem } from '../domain/models';
import { calendarMonthKey, calendarParts, formatDate, getMonthDays, todayKey } from '../features/calendar/calendar';

export function CalendarDateField({ value, calendar, onChange, allowEmpty = true }: {
  value: string; calendar: CalendarSystem; onChange: (value: string) => void; allowEmpty?: boolean;
}) {
  const displayDate = value || todayKey();
  const parts = calendarParts(displayDate, calendar);
  const month = getMonthDays(displayDate, calendar);
  const yearOptions = Array.from({ length: 41 }, (_, index) => parts.year - 20 + index);
  const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  const dateFor = (year: number, monthNumber: number, day: number) => {
    const monthDays = getMonthDays(calendarMonthKey(year, monthNumber, calendar), calendar).dates;
    return monthDays[Math.min(day, monthDays.length) - 1];
  };

  if (!value && allowEmpty) return <button type="button" className="date-select-trigger" onClick={() => onChange(todayKey())}>انتخاب تاریخ</button>;
  return <div className="calendar-date-field" dir="rtl">
    <select aria-label="روز" value={parts.day} onChange={event => onChange(dateFor(parts.year, parts.month, Number(event.target.value)))}>
      {month.dates.map((_, index) => <option key={index + 1} value={index + 1}>{new Intl.NumberFormat(calendar === 'persian' ? 'fa-IR' : 'en').format(index + 1)}</option>)}
    </select>
    <select aria-label="ماه" value={parts.month} onChange={event => onChange(dateFor(parts.year, Number(event.target.value), parts.day))}>
      {monthOptions.map(monthNumber => { const monthKey = calendarMonthKey(parts.year, monthNumber, calendar); return <option key={monthNumber} value={monthNumber}>{formatDate(monthKey, calendar, { month: 'long' })}</option>; })}
    </select>
    <select aria-label="سال" value={parts.year} onChange={event => onChange(dateFor(Number(event.target.value), parts.month, parts.day))}>
      {yearOptions.map(year => <option key={year} value={year}>{new Intl.NumberFormat(calendar === 'persian' ? 'fa-IR' : 'en').format(year)}</option>)}
    </select>
    {allowEmpty && <button type="button" className="date-clear" aria-label="پاک کردن تاریخ" onClick={() => onChange('')}>×</button>}
  </div>;
}
