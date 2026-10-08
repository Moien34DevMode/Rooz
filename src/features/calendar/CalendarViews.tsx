import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarSystem, Goal, ScheduleEntry, TaskEntry } from '../../domain/models';
import { calendarParts, formatDate, getMonthDays, todayKey } from './calendar';
import { buildCalendarIndex, completionPercent, monthCells, summarizeDates, weekDates, workloadLevel, yearMonths } from './calendarSummary';
import type { CalendarSummary, DaySummary } from './calendarSummary';
import '../../styles/calendar.css';

const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const weekdayShort = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const numbers = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const number = (value: number) => numbers.format(value);
const hours = (minutes: number) => `${number(minutes / 60)} ساعت`;
const heatLabels = ['بدون برنامه', 'سبک (تا ۲)', 'متوسط (تا ۴)', 'پُر (تا ۶)', 'سنگین (بیش از ۶)'];
type View = 'weekly' | 'monthly' | 'yearly';
interface Props {
  view: View; date: string; calendar: CalendarSystem; tasks: TaskEntry[]; schedule: ScheduleEntry[];
  goals: Goal[]; weeklyCommitmentHours: number; getProgress: (goal: Goal) => number;
  onSelectDate: (date: string) => void; onSelectMonth: (date: string) => void; onNavigate: (amount: number) => void;
}

function Summary({ summary, label }: { summary: CalendarSummary; label: string }) {
  return <section className="cv-summary" aria-label={`خلاصه‌ی ${label}`}>
    <dl className="cv-stats">
      <div><dt>کارها / بازه‌ها</dt><dd>{number(summary.taskCount)} / {number(summary.scheduleCount)}</dd></div>
      <div><dt>زمان برنامه‌ریزی‌شده</dt><dd>{hours(summary.plannedMinutes)}</dd></div>
      <div><dt>زمان بازه‌های برنامه</dt><dd>{hours(summary.scheduledMinutes)}</dd></div>
      <div><dt>روزهای دارای برنامه / سررسیدها</dt><dd>{number(summary.activeDays)} / {number(summary.deadlineCount)}</dd></div>
    </dl>
    <div className="cv-completion"><span>{summary.completableCount ? `${number(summary.completedCount)} از ${number(summary.completableCount)} مورد قابل پیگیری انجام شده · ${number(completionPercent(summary))}٪` : 'مورد قابل پیگیری برای تکمیل ثبت نشده است'}</span><progress max={100} value={completionPercent(summary)} aria-label={`تکمیل ${label}`}/></div>
    <p className="cv-hint">زمان‌ها مجموع بازه‌ها و کارهای دارای ساعت شروع و پایان‌اند؛ هم‌پوشانی‌ها جدا حساب می‌شوند. بازه‌های بدون وضعیت تکمیل در درصد پیشرفت نیستند.</p>
  </section>;
}

function WeekdayLabels() {
  return <>{weekdays.map((day, index) => <div className="cv-weekday" key={day}><abbr title={day}>{weekdayShort[index]}</abbr></div>)}</>;
}

function dayLabel(key: string, calendar: CalendarSystem, summary?: DaySummary) {
  const count = (summary?.taskCount ?? 0) + (summary?.scheduleCount ?? 0);
  return `${formatDate(key, calendar, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}؛ ${number(count)} مورد؛ ${hours(summary?.plannedMinutes ?? 0)} برنامه؛ ${number(summary?.completedCount ?? 0)} انجام‌شده${summary?.deadlines.length ? `؛ سررسید: ${summary.deadlines.map(goal => goal.title).join('، ')}` : ''}`;
}

export function CalendarViews({ view, date, calendar, tasks, schedule, goals, weeklyCommitmentHours, getProgress, onSelectDate, onSelectMonth, onNavigate }: Props) {
  const today = todayKey();
  const index = useMemo(() => buildCalendarIndex(tasks, schedule, goals), [tasks, schedule, goals]);
  const period = useMemo(() => {
    const months = view === 'yearly' ? yearMonths(date, calendar) : [];
    const month = view === 'monthly' ? getMonthDays(date, calendar) : undefined;
    const dates = view === 'weekly' ? weekDates(date) : month?.dates ?? months.flatMap(item => item.dates);
    return { months, month, dates, summary: summarizeDates(dates, index),
      monthSummaries: months.map(item => summarizeDates(item.dates, index)),
      deadlines: dates.flatMap(key => (index.get(key)?.deadlines ?? []).map(goal => ({ key, goal }))) };
  }, [view, date, calendar, index]);
  const displayedGoals = useMemo(() => {
    const due = new Set(period.deadlines.map(({ goal }) => goal.id));
    return goals.filter(goal => due.has(goal.id) || view === 'weekly' && goal.kind === 'mid-term');
  }, [goals, view, period.deadlines]);
  const progress = useMemo(() => new Map(displayedGoals.map(goal => {
    const value = getProgress(goal);
    return [goal.id, Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0];
  })), [displayedGoals, getProgress]);
  const selected = index.get(date);
  const label = view === 'weekly' ? 'هفته' : view === 'monthly' ? 'ماه' : 'سال';
  const title = view === 'yearly' ? number(calendarParts(date, calendar).year) : formatDate(date, calendar, { month: 'long', year: 'numeric', day: undefined });
  const navigateAmount = view === 'weekly' ? 7 : 1;

  return <section className={`calendar-panel cv-panel cv-${view}`} dir="rtl" aria-label={`نمای ${label}`}>
    <header className="cv-heading"><div><span className="cv-eyebrow">نمای {label === 'هفته' ? 'هفتگی' : label === 'ماه' ? 'ماهانه' : 'سالانه'}</span><h2>{title}</h2>{view === 'weekly' && <p className="cv-range">{formatDate(period.dates[0], calendar)} — {formatDate(period.dates[6], calendar)}</p>}</div>
      <nav className="cv-arrows" aria-label={`جابه‌جایی ${label}`}><button type="button" className="cv-icon-button" aria-label={`${label} قبل`} onClick={() => onNavigate(-navigateAmount)}><ChevronRight aria-hidden="true"/></button><button type="button" className="cv-icon-button" aria-label={`${label} بعد`} onClick={() => onNavigate(navigateAmount)}><ChevronLeft aria-hidden="true"/></button></nav>
    </header>
    <Summary summary={period.summary} label={label}/>

    {view === 'weekly' && <>
      <p className="cv-commitment">تعهد اهداف میان‌مدت: <strong>{number(weeklyCommitmentHours)} ساعت در هفته</strong></p>
      <div className="cv-scroll" role="region" aria-label="روزهای هفته"><div className="cv-week-grid">{period.dates.map((key, dayIndex) => {
        const day = index.get(key);
        return <button type="button" className={`cv-week-day ${key === date ? 'is-selected' : ''}`} data-heat={workloadLevel(day)} key={key} onClick={() => onSelectDate(key)} aria-pressed={key === date} aria-current={key === today ? 'date' : undefined} aria-label={`${dayLabel(key, calendar, day)}${key === today ? '؛ امروز' : ''}`}>
          <span className="cv-week-date"><span>{weekdays[dayIndex]}</span><span className="cv-week-date-number"><strong>{number(calendarParts(key, calendar).day)}</strong><span className="cv-day-month">{formatDate(key, calendar, { month: 'short', day: undefined, year: undefined })}</span></span>{key === today && <span className="cv-today-label">امروز</span>}</span>
          <span className="cv-week-metrics"><span>{number(day?.taskCount ?? 0)} کار · {number(day?.scheduleCount ?? 0)} بازه</span><span className="cv-day-hours">{hours(day?.plannedMinutes ?? 0)}</span><span className="cv-day-completion">{number(day?.completedCount ?? 0)} / {number(day?.completableCount ?? 0)} انجام‌شده</span>{!!day?.deadlineCount && <span className="cv-deadline-mark">{number(day.deadlineCount)} سررسید</span>}</span>
        </button>;
      })}</div></div>
      <section className="cv-agenda" aria-label="برنامه‌ی روز انتخاب‌شده"><div className="cv-subheading"><h3>{formatDate(date, calendar, { weekday: 'long' })}</h3><span>{hours(selected?.plannedMinutes ?? 0)} · {number(selected?.agenda.length ?? 0)} مورد</span></div>
        {selected?.agenda.length ? <ul className="cv-agenda-list">{selected.agenda.map(entry => <li className={`cv-agenda-row ${entry.completed ? 'is-complete' : ''}`} key={entry.key}>
          <span className="cv-agenda-time" dir="ltr">{entry.item.startTime ? `${entry.item.startTime}${entry.item.endTime ? ` – ${entry.item.endTime}` : ''}` : 'بدون زمان'}</span>
          <i className="cv-entry-color" style={{ backgroundColor: entry.item.color }} aria-hidden="true"/><strong>{entry.item.title}</strong><span className="cv-entry-kind">{entry.type === 'task' ? 'کار' : entry.item.shortTaskId ? 'روتین' : 'بازه‌ی برنامه'}</span><span className="cv-entry-status">{entry.completed === undefined ? '—' : entry.completed ? 'انجام‌شده' : 'انجام‌نشده'}</span>
        </li>)}</ul> : <p className="cv-empty">برای این روز کار یا بازه‌ای ثبت نشده است.</p>}
      </section>
    </>}

    {view === 'monthly' && period.month && <>
      <p className="cv-hint">هر روز را برای باز کردن نمای روزانه انتخاب کنید. نشان نقطه تعداد کارها و بازه‌ها و نشان ◆ سررسید را مشخص می‌کند.</p>
      <div className="cv-scroll" role="region" aria-label="تقویم ماه"><div className="cv-month-grid"><WeekdayLabels/>{monthCells(period.month).flat().map((key, cellIndex) => {
        if (!key) return <div className="cv-month-blank" key={`blank-${cellIndex}`} aria-hidden="true"/>;
        const day = index.get(key);
        const entries = day?.agenda ?? [];
        return <button type="button" key={key} className={`cv-month-day ${key === date ? 'is-selected' : ''}`} onClick={() => onSelectDate(key)} aria-current={key === today ? 'date' : undefined} aria-label={`${dayLabel(key, calendar, day)}${key === today ? '؛ امروز' : ''}؛ باز کردن روز`}>
          <span className="cv-day-top"><strong>{number(calendarParts(key, calendar).day)}</strong>{key === today && <span className="cv-today-label">امروز</span>}</span>
          <span className="cv-month-indicators" aria-hidden="true">{!!entries.length && <span className="cv-month-activity"><i/>{number(entries.length)}</span>}{!!day?.deadlineCount && <span className="cv-month-due">◆</span>}</span>
          <span className="cv-month-count">{number(day?.taskCount ?? 0)} کار · {number(day?.scheduleCount ?? 0)} بازه</span>
          <span className="cv-month-entries">{entries.slice(0, 2).map(entry => <span className={`cv-month-entry ${entry.completed ? 'is-complete' : ''}`} key={entry.key}><i style={{ backgroundColor: entry.item.color }} aria-hidden="true"/>{entry.completed && <span aria-label="انجام‌شده">✓ </span>}{entry.item.title}</span>)}{entries.length > 2 && <span className="cv-overflow">+{number(entries.length - 2)} مورد دیگر</span>}</span>
          {!!day?.deadlineCount && <span className="cv-month-deadline">سررسید: {day.deadlines[0].title}{day.deadlineCount > 1 ? ` (+${number(day.deadlineCount - 1)})` : ''}</span>}
          <span className="cv-month-hours">{hours(day?.scheduledMinutes ?? 0)} بازه</span>
        </button>;
      })}</div></div>
    </>}

    {view === 'yearly' && <>
      <section className="cv-legend" aria-label="راهنمای حجم برنامه"><h3>حجم برنامه‌ی روز</h3><div>{heatLabels.map((text, level) => <span key={level}><i className="cv-heat" data-heat={level} aria-hidden="true"/>{text}</span>)}</div><p className="cv-hint">سطح رنگ بر اساس بیشترینِ تعداد موارد و ساعت برنامه است؛ نشان ◆ یعنی سررسید. حاشیه‌ی پررنگ: امروز؛ خط‌چین: روز انتخاب‌شده.</p></section>
      <div className="cv-year-grid">{period.months.map((month, monthIndex) => {
        const summary = period.monthSummaries[monthIndex];
        const first = month.dates[0];
        const monthTitle = formatDate(first, calendar, { month: 'long', year: undefined, day: undefined });
        return <article className="cv-year-month" key={first} aria-label={monthTitle}>
          <h3><button type="button" onClick={() => onSelectMonth(first)} aria-label={`باز کردن ${monthTitle}؛ ${number(summary.taskCount)} کار؛ ${number(summary.scheduleCount)} بازه؛ ${hours(summary.plannedMinutes)}؛ ${number(summary.deadlineCount)} سررسید`}>{monthTitle}<ChevronLeft size={16} aria-hidden="true"/></button></h3>
          <table className="cv-mini-calendar"><caption className="cv-sr-only">روزها و حجم برنامه‌ی {monthTitle}</caption><thead><tr>{weekdays.map((weekday, weekdayIndex) => <th scope="col" key={weekday}><abbr title={weekday}>{weekdayShort[weekdayIndex]}</abbr></th>)}</tr></thead><tbody>{monthCells(month).map((row, rowIndex) => <tr key={rowIndex}>{row.map((key, columnIndex) => {
            if (!key) return <td key={`blank-${columnIndex}`}/>;
            const day = index.get(key);
            return <td key={key}><span className={`cv-mini-day cv-heat ${key === today ? 'is-today' : ''} ${key === date ? 'is-selected' : ''}`} data-heat={workloadLevel(day)} title={`${dayLabel(key, calendar, day)}${key === today ? '؛ امروز' : ''}`} aria-current={key === today ? 'date' : undefined}>
              {number(calendarParts(key, calendar).day)}{!!day?.deadlineCount && <span className="cv-mini-deadline" aria-hidden="true">◆</span>}<span className="cv-sr-only">{`؛ ${number((day?.taskCount ?? 0) + (day?.scheduleCount ?? 0))} مورد؛ ${hours(day?.plannedMinutes ?? 0)}؛ ${number(day?.completedCount ?? 0)} انجام‌شده${key === today ? '؛ امروز' : ''}${key === date ? '؛ انتخاب‌شده' : ''}${day?.deadlineCount ? `؛ سررسید: ${day.deadlines.map(goal => goal.title).join('، ')}` : ''}`}</span>
            </span></td>;
          })}</tr>)}</tbody></table>
          <dl className="cv-month-stats"><div><dt>کار / بازه</dt><dd>{number(summary.taskCount)} / {number(summary.scheduleCount)}</dd></div><div><dt>زمان برنامه</dt><dd>{hours(summary.plannedMinutes)}</dd></div><div><dt>انجام‌شده</dt><dd>{number(summary.completedCount)} / {number(summary.completableCount)}</dd></div><div><dt>سررسید</dt><dd>{number(summary.deadlineCount)}</dd></div></dl>
        </article>;
      })}</div>
    </>}

    <div className="cv-details"><section className="cv-deadlines" aria-label={`سررسیدهای ${label}`}><div className="cv-subheading"><h3>سررسیدهای این {label}</h3><span>{number(period.deadlines.length)} هدف</span></div>
      {period.deadlines.length ? <ul className="cv-deadline-list">{period.deadlines.map(({ key, goal }) => <li key={goal.id}><time dateTime={key}>{formatDate(key, calendar)}</time><strong>{goal.title}</strong>{key < today && (progress.get(goal.id) ?? 0) < 100 && <span className="cv-overdue">گذشته از موعد</span>}</li>)}</ul> : <p className="cv-empty">در این {label} سررسیدی ثبت نشده است.</p>}
    </section><section className="cv-goals" aria-label="پیشرفت اهداف"><div className="cv-subheading"><h3>{view === 'weekly' ? 'مسیرهای میان‌مدت و اهداف این هفته' : `پیشرفت اهداف این ${label}`}</h3><span>{number(displayedGoals.length)} هدف</span></div>
      {displayedGoals.length ? <ul className="cv-goal-list">{displayedGoals.map(goal => <li key={goal.id}><div className="cv-goal-heading"><strong>{goal.title}</strong><span>{number(progress.get(goal.id) ?? 0)}٪</span></div><progress max={100} value={progress.get(goal.id) ?? 0} aria-label={`پیشرفت ${goal.title}`}/><div className="cv-goal-meta"><span>{goal.kind === 'mid-term' ? `${number(goal.weeklyHours)} ساعت در هفته` : 'هدف بلندمدت'}</span>{goal.deadlineDate ? <time dateTime={goal.deadlineDate}>سررسید: {formatDate(goal.deadlineDate, calendar)}</time> : <span>بدون سررسید</span>}</div>{goal.kind === 'long-term' && goal.note && <p className="cv-goal-note">{goal.note}</p>}</li>)}</ul> : <p className="cv-empty">هدفی با سررسید در این {label} ثبت نشده است.</p>}
    </section></div>
  </section>;
}
