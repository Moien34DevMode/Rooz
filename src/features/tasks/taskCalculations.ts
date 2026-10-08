import type { CalendarSystem, Goal, MidTermGoal, ScheduleEntry, ScheduleItem, ShortTermTask, Task, TaskEntry } from '../../domain/models';
import { calendarParts } from '../calendar/calendar';

function routineOccurs(task: ShortTermTask, date: string, calendar: CalendarSystem) {
  const routine = task.routine;
  if (!routine || date < routine.startDate || (routine.endDate && date > routine.endDate)) return false;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  switch (routine.pattern) {
    case 'daily': return true;
    case 'weekdays': return weekday === 6 || weekday <= 3;
    case 'weekends': return weekday === 4 || weekday === 5;
    case 'selected': return routine.weekdays.includes(weekday);
    case 'even-dates': return calendarParts(date, calendar).day % 2 === 0;
    case 'odd-dates': return calendarParts(date, calendar).day % 2 === 1;
  }
}

export function taskEntriesForDate(legacyTasks: Task[], shortTasks: ShortTermTask[], date: string, calendar: CalendarSystem, includeUndatedJobs = false): TaskEntry[] {
  const oldEntries: TaskEntry[] = legacyTasks.filter(task => task.date === date).map(task => ({
    id: task.id, title: task.title, date, kind: task.kind, startTime: task.startTime, endTime: task.endTime,
    status: task.status, color: task.color, source: 'legacy'
  }));
  const newEntries: TaskEntry[] = [];
  for (const task of shortTasks) {
    const applies = task.mode === 'job' ? (task.triggerDate ? task.triggerDate === date : includeUndatedJobs) : routineOccurs(task, date, calendar);
    if (!applies || (task.mode === 'routine' && task.routine?.isTimed)) continue;
    const done = task.mode === 'job' ? task.completed : task.completedDates.includes(date);
    const isTimedJob = task.mode === 'job' && Boolean(task.triggerDate && task.triggerTime);
    newEntries.push({ id: `${task.id}@${date}`, shortTaskId: task.id, title: task.title, date, kind: isTimedJob ? 'timed' : 'todo', startTime: isTimedJob ? task.triggerTime : undefined, status: done ? 'done' : 'open', color: task.color, source: 'short-term' });
  }
  return [...oldEntries, ...newEntries];
}

export function scheduleEntriesForDate(legacyItems: ScheduleItem[], shortTasks: ShortTermTask[], date: string, calendar: CalendarSystem): ScheduleEntry[] {
  const routines = shortTasks.filter(task => task.mode === 'routine' && task.routine?.isTimed && routineOccurs(task, date, calendar));
  return [...legacyItems.filter(item => item.date === date), ...routines.map(task => ({
    id: `routine:${task.id}:${date}`, shortTaskId: task.id, completed: task.completedDates.includes(date), title: task.title, date,
    startTime: task.routine!.startTime!, endTime: task.routine!.endTime!, color: task.color,
    createdAt: task.createdAt, updatedAt: task.updatedAt
  }))];
}

function shortTaskProgress(task: ShortTermTask, throughDate: string, calendar: CalendarSystem) {
  if (task.mode === 'job') return task.completed ? 1 : 0;
  const routine = task.routine;
  if (!routine) return 0;
  const end = routine.endDate && routine.endDate < throughDate ? routine.endDate : throughDate;
  if (end < routine.startDate) return 0;
  let occurrences = 0;
  const startDate = new Date(`${routine.startDate}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    if (routineOccurs(task, cursor.toISOString().slice(0, 10), calendar)) occurrences++;
  }
  if (!occurrences) return 0;
  const completed = task.completedDates.filter(date => date >= routine.startDate && date <= end && routineOccurs(task, date, calendar)).length;
  return Math.min(1, completed / occurrences);
}

export function goalProgress(goal: Goal, goals: Goal[], shortTasks: ShortTermTask[], throughDate: string, calendar: CalendarSystem): number {
  if (goal.kind === 'mid-term') {
    const related = shortTasks.flatMap(task => {
      const relation = task.relatedMidTermGoals.find(link => link.goalId === goal.id);
      return relation ? [{ task, coefficient: relation.coefficient }] : [];
    });
    const total = related.reduce((sum, item) => sum + item.coefficient, 0);
    if (!total) return 0;
    return Math.round(related.reduce((sum, item) => sum + item.coefficient * shortTaskProgress(item.task, throughDate, calendar), 0) / total * 100);
  }
  const relatedMidGoals = goals.filter((candidate): candidate is MidTermGoal => candidate.kind === 'mid-term').flatMap(midGoal => {
    const relation = midGoal.relatedLongTermGoals.find(link => link.goalId === goal.id);
    return relation ? [{ goal: midGoal, coefficient: relation.coefficient }] : [];
  });
  const total = relatedMidGoals.reduce((sum, item) => sum + item.coefficient, 0);
  if (!total) return 0;
  return Math.round(relatedMidGoals.reduce((sum, item) => sum + item.coefficient * goalProgress(item.goal, goals, shortTasks, throughDate, calendar), 0) / total);
}
