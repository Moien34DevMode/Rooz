import type { CalendarSystem } from '../domain/models';
import { SelectField } from './SelectField';
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
    <SelectField aria-label="روز" value={parts.day} onValueChange={value => onChange(dateFor(parts.year, parts.month, Number(value)))}>
      {month.dates.map((_, index) => <option key={index + 1} value={index + 1}>{new Intl.NumberFormat(calendar === 'persian' ? 'fa-IR' : 'en').format(index + 1)}</option>)}
    </SelectField>
    <SelectField aria-label="ماه" value={parts.month} onValueChange={value => onChange(dateFor(parts.year, Number(value), parts.day))}>
      {monthOptions.map(monthNumber => { const monthKey = calendarMonthKey(parts.year, monthNumber, calendar); return <option key={monthNumber} value={monthNumber}>{formatDate(monthKey, calendar, { month: 'long' })}</option>; })}
    </SelectField>
    <SelectField aria-label="سال" value={parts.year} onValueChange={value => onChange(dateFor(Number(value), parts.month, parts.day))}>
      {yearOptions.map(year => <option key={year} value={year}>{new Intl.NumberFormat(calendar === 'persian' ? 'fa-IR' : 'en').format(year)}</option>)}
    </SelectField>
    {allowEmpty && <button type="button" className="date-clear" aria-label="پاک کردن تاریخ" onClick={() => onChange('')}>×</button>}
  </div>;
}
