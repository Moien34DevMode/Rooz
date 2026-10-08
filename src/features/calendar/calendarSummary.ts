import type { CalendarSystem, Goal, ScheduleEntry, TaskEntry } from '../../domain/models';
import { calendarMonthKey, calendarParts, getMonthDays, shiftDate } from './calendar';

export interface AgendaEntry {
  key: string;
  type: 'task' | 'schedule';
  item: TaskEntry | ScheduleEntry;
  completed: boolean | undefined;
}
export interface CalendarSummary {
  taskCount: number;
  scheduleCount: number;
  completedCount: number;
  completableCount: number;
  plannedMinutes: number;
  scheduledMinutes: number;
  deadlineCount: number;
  activeDays: number;
}
export interface DaySummary extends CalendarSummary {
  agenda: AgendaEntry[];
  deadlines: Goal[];
}
export const emptySummary = (): CalendarSummary => ({
  taskCount: 0, scheduleCount: 0, completedCount: 0, completableCount: 0,
  plannedMinutes: 0, scheduledMinutes: 0, deadlineCount: 0, activeDays: 0
});

export function durationMinutes(start?: string, end?: string): number {
  const minutes = (time?: string) => {
    if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(time)) return undefined;
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  const from = minutes(start);
  const to = minutes(end);
  if (from === undefined || to === undefined) return 0;
  return to >= from ? to - from : 1440 - from + to;
}

// Entries are already dated occurrences (including clipped overnight continuations).
// Index each once; ordinary schedule blocks do not have a completion state.
export function buildCalendarIndex(tasks: TaskEntry[], schedule: ScheduleEntry[], goals: Goal[]): Map<string, DaySummary> {
  const index = new Map<string, DaySummary>();
  const dayFor = (date: string) => {
    let day = index.get(date);
    if (!day) { day = { ...emptySummary(), agenda: [], deadlines: [] }; index.set(date, day); }
    return day;
  };
  for (const task of tasks) {
    const day = dayFor(task.date);
    day.taskCount++;
    day.completableCount++;
    if (task.status === 'done') day.completedCount++;
    if (task.kind === 'timed') day.plannedMinutes += durationMinutes(task.startTime, task.endTime);
    day.agenda.push({ key: `task:${task.id}`, type: 'task', item: task, completed: task.status === 'done' });
  }
  for (const item of schedule) {
    const day = dayFor(item.date);
    const duration = durationMinutes(item.startTime, item.endTime);
    day.scheduleCount++;
    day.plannedMinutes += duration;
    day.scheduledMinutes += duration;
    if (typeof item.completed === 'boolean') {
      day.completableCount++;
      if (item.completed) day.completedCount++;
    }
    day.agenda.push({ key: `schedule:${item.id}`, type: 'schedule', item, completed: item.completed });
  }
  for (const goal of goals) {
    if (!goal.deadlineDate) continue;
    const day = dayFor(goal.deadlineDate);
    day.deadlines.push(goal);
    day.deadlineCount++;
  }
  for (const day of index.values()) {
    day.activeDays = day.agenda.length ? 1 : 0;
    day.agenda.sort((a, b) => (a.item.startTime ?? '99:99').localeCompare(b.item.startTime ?? '99:99') || a.item.title.localeCompare(b.item.title, 'fa'));
  }
  return index;
}

export function summarizeDates(dates: string[], index: ReadonlyMap<string, DaySummary>): CalendarSummary {
  const summary = emptySummary();
  for (const date of dates) {
    const day = index.get(date);
    if (!day) continue;
    for (const key of Object.keys(summary) as (keyof CalendarSummary)[]) summary[key] += day[key];
  }
  return summary;
}

export function weekDates(date: string): string[] {
  const offset = (new Date(`${date}T12:00:00`).getDay() + 1) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDate(date, index - offset));
}

export function yearMonths(date: string, calendar: CalendarSystem) {
  const { year } = calendarParts(date, calendar);
  return Array.from({ length: 12 }, (_, index) => getMonthDays(calendarMonthKey(year, index + 1, calendar), calendar));
}

export function monthCells(month: ReturnType<typeof getMonthDays>): (string | null)[][] {
  const cells: (string | null)[] = [...Array<null>(month.offset).fill(null), ...month.dates];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function workloadLevel(summary?: CalendarSummary): number {
  if (!summary || !summary.taskCount && !summary.scheduleCount) return 0;
  const load = Math.max(summary.plannedMinutes / 60, summary.taskCount + summary.scheduleCount);
  return load <= 2 ? 1 : load <= 4 ? 2 : load <= 6 ? 3 : 4;
}

export function completionPercent(summary: CalendarSummary): number {
  return summary.completableCount ? Math.round(summary.completedCount / summary.completableCount * 100) : 0;
}
