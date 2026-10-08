import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarSystem, Goal, LongTermGoal, ScheduleItem, TaskEntry } from '../../domain/models';
import { calendarMonthKey, calendarParts, formatDate, getMonthDays } from './calendar';

const weekdays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
type View = 'weekly' | 'monthly' | 'yearly';
interface Props {
  view: View; date: string; calendar: CalendarSystem; tasks: TaskEntry[]; schedule: ScheduleItem[];
  goals: Goal[]; weeklyCommitmentHours: number; getProgress: (goal: Goal) => number;
  onSelectDate: (date: string) => void; onSelectMonth: (date: string) => void; onNavigate: (amount: number) => void;
}

export function CalendarViews({ view, date, calendar, tasks, schedule, goals, weeklyCommitmentHours, getProgress, onSelectDate, onSelectMonth, onNavigate }: Props) {
  const parts = calendarParts(date, calendar);
  const month = getMonthDays(date, calendar);
  const offset = (new Date(`${date}T12:00:00`).getDay() + 1) % 7;

  if (view === 'weekly') {
    const midGoals = goals.filter((goal): goal is Extract<Goal, { kind: 'mid-term' }> => goal.kind === 'mid-term');
    const days = Array.from({ length: 7 }, (_, index) => {
      const key = new Date(new Date(`${date}T12:00:00`).getTime() + (index - offset) * 86400000).toISOString().slice(0, 10);
      const entries = [...tasks.filter(task => task.date === key), ...schedule.filter(item => item.date === key)];
      return { key, entries };
    });
    const selectedEntries = schedule.filter(item => item.date === date)
      .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'));
    return <section className="calendar-panel">
      <div className="section-heading"><div><span className="eyebrow">هفته‌ی جاری</span><h2>{formatDate(date, calendar, { month: 'long', year: 'numeric' })}</h2><p className="weekly-commitment">تعهد اهداف میان‌مدت: <strong>{new Intl.NumberFormat('fa-IR').format(weeklyCommitmentHours)} ساعت در هفته</strong></p></div><div className="calendar-arrows"><button className="icon-button" aria-label="هفته قبل" onClick={() => onNavigate(-7)}><ChevronRight/></button><button className="icon-button" aria-label="هفته بعد" onClick={() => onNavigate(7)}><ChevronLeft/></button></div></div>
      <div className="week-grid">{days.map(({ key, entries }, index) => <button className={`week-day ${key === date ? 'selected' : ''}`} key={key} onClick={() => onSelectDate(key)} aria-pressed={key === date}><span>{weekdays[index]}</span><strong>{formatDate(key, calendar, { day: 'numeric' })}</strong><div>{entries.slice(0, 5).map(entry => <i key={entry.id} style={{ backgroundColor: entry.color }} />)}</div>{entries.length > 0 && <small>{new Intl.NumberFormat('fa-IR').format(entries.length)} مورد</small>}</button>)}</div>
      <div className="week-agenda"><div className="agenda-heading"><div><span className="eyebrow">برنامه‌ی این روز</span><h3>{formatDate(date, calendar, { weekday: 'long', day: 'numeric', month: 'long' })}</h3></div><span className="agenda-total">{new Intl.NumberFormat('fa-IR').format(selectedEntries.length)} مورد</span></div>
        {selectedEntries.length ? selectedEntries.map(item => <div className="agenda-row" key={item.id}><span>{item.startTime} ـ {item.endTime}</span><i style={{ background: item.color }}/><strong>{item.title}</strong><small>بازه‌ی برنامه</small></div>) : <p className="calendar-empty">برای این روز بازه‌ی زمانی ثبت نشده است.</p>}
      </div>
      <section className="weekly-goals"><div className="agenda-heading"><div><span className="eyebrow">مسیرهای میان‌مدت</span><h3>پیشرفت و زمان هفتگی</h3></div></div>{midGoals.length ? midGoals.map(goal => <article className="weekly-goal" key={goal.id}><div><strong>{goal.title}</strong><small>{new Intl.NumberFormat('fa-IR').format(goal.weeklyHours)} ساعت در هفته</small></div><div className="goal-progress"><span>{new Intl.NumberFormat('fa-IR').format(getProgress(goal))}٪</span><i><b style={{ width: `${getProgress(goal)}%` }}/></i></div></article>) : <p className="calendar-empty">هنوز هدف میان‌مدتی ثبت نشده است.</p>}</section>
    </section>;
  }

  if (view === 'monthly') return <section className="calendar-panel"><div className="section-heading"><div><span className="eyebrow">نمای ماهانه</span><h2>{formatDate(date, calendar, { month: 'long', year: 'numeric' })}</h2></div><div className="calendar-arrows"><button className="icon-button" aria-label="ماه قبل" onClick={() => onNavigate(-1)}><ChevronRight/></button><button className="icon-button" aria-label="ماه بعد" onClick={() => onNavigate(1)}><ChevronLeft/></button></div></div><div className="month-grid">{weekdays.map((day, index) => <div key={index} className="weekday-name">{day}</div>)}{Array.from({ length: month.offset }, (_, index) => <div key={`empty-${index}`} />)}{month.dates.map((key, index) => <button key={key} onClick={() => onSelectDate(key)} className={`month-day ${key === date ? 'selected' : ''}`}><span>{new Intl.NumberFormat('fa-IR').format(index + 1)}</span>{[...tasks.filter(task => task.date === key), ...schedule.filter(item => item.date === key)].slice(0, 2).map(item => <i key={item.id} style={{ background: item.color }} />)}</button>)}</div></section>;

  const longGoals = goals.filter((goal): goal is LongTermGoal => goal.kind === 'long-term' && calendarParts(goal.deadlineDate, calendar).year === parts.year);
  return <section className="calendar-panel"><div className="section-heading"><div><span className="eyebrow">نمای سالانه</span><h2>{new Intl.NumberFormat(calendar === 'persian' ? 'fa-IR-u-ca-persian' : 'en').format(parts.year)}</h2></div><div className="calendar-arrows"><button className="icon-button" aria-label="سال قبل" onClick={() => onNavigate(-1)}><ChevronRight/></button><button className="icon-button" aria-label="سال بعد" onClick={() => onNavigate(1)}><ChevronLeft/></button></div></div><div className="year-grid">{Array.from({ length: 12 }, (_, index) => { const grid = getMonthDays(calendarMonthKey(parts.year, index + 1, calendar), calendar); return <button className="year-month" key={index} onClick={() => onSelectMonth(grid.dates[0])}><strong>{new Intl.DateTimeFormat(calendar === 'persian' ? 'fa-IR-u-ca-persian' : 'en', { month: 'long' }).format(new Date(`${grid.dates[0]}T12:00:00`))}</strong><div className="year-dots">{grid.dates.slice(0, 28).map((day, dayIndex) => <i key={dayIndex} className={day === date ? 'today' : ''} style={{ opacity: tasks.some(task => task.date === day) || schedule.some(item => item.date === day) ? 1 : 0.25 }} />)}</div></button>; })}</div><section className="year-goals"><div className="agenda-heading"><div><span className="eyebrow">هدف‌های بلندمدت این سال</span><h3>چیزی که برایش مسیر می‌سازی</h3></div><span className="agenda-total">{new Intl.NumberFormat('fa-IR').format(longGoals.length)} هدف</span></div>{longGoals.length ? longGoals.map(goal => <article className="year-goal" key={goal.id}><div className="year-goal-copy"><strong>{goal.title}</strong><span>{goal.note || 'یادداشتی ثبت نشده'}</span></div><div className="goal-progress"><span>{new Intl.NumberFormat('fa-IR').format(getProgress(goal))}٪</span><i><b style={{ width: `${getProgress(goal)}%` }}/></i></div></article>) : <p className="calendar-empty">برای این سال هدف بلندمدتی ثبت نشده است. از دکمه‌ی DO هدف تازه بساز.</p>}</section></section>;
}
