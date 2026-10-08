import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { buildCalendarIndex, completionPercent, durationMinutes, emptySummary, monthCells, summarizeDates, weekDates, workloadLevel, yearMonths } = await server.ssrLoadModule('/src/features/calendar/calendarSummary.ts');
const { CalendarViews } = await server.ssrLoadModule('/src/features/calendar/CalendarViews.tsx');
const { calendarMonthKey, calendarParts, getMonthDays, shiftDate, todayKey } = await server.ssrLoadModule('/src/features/calendar/calendar.ts');
const date = '2026-10-08';
const task = (overrides = {}) => ({ id: 'task', title: 'کار', date, kind: 'todo', status: 'open', source: 'legacy', color: '#517365', ...overrides });
const schedule = (overrides = {}) => ({ id: 'schedule', title: 'بازه', date, startTime: '09:00', endTime: '10:30', color: '#517365', createdAt: '', updatedAt: '', ...overrides });
const goal = (overrides = {}) => ({ id: 'goal', kind: 'long-term', title: 'هدف', deadlineDate: date, note: '', createdAt: '', updatedAt: '', ...overrides });

test('daily index combines tasks and schedule, sorts time before undated tasks, and keeps source keys distinct', () => {
  const tasks = [task({ id: 'same' }), task({ id: 'early', kind: 'timed', startTime: '08:00', endTime: '09:00', status: 'done' })];
  const items = [schedule({ id: 'same' })];
  const before = JSON.stringify({ tasks, items });
  const day = buildCalendarIndex(tasks, items, []).get(date);
  assert.deepEqual(day.agenda.map(entry => entry.key), ['task:early', 'schedule:same', 'task:same']);
  assert.equal(day.taskCount, 2);
  assert.equal(day.scheduleCount, 1);
  assert.equal(day.plannedMinutes, 150);
  assert.equal(day.scheduledMinutes, 90);
  assert.equal(day.completedCount, 1);
  assert.equal(day.completableCount, 2);
  assert.equal(completionPercent(day), 50);
  assert.equal(JSON.stringify({ tasks, items }), before);
});

test('only schedules with explicit completion states enter the completion denominator', () => {
  const index = buildCalendarIndex([task({ status: 'done' })], [schedule(), schedule({ id: 'routine-done', completed: true }), schedule({ id: 'routine-open', completed: false })], []);
  const day = index.get(date);
  assert.equal(day.completedCount, 2);
  assert.equal(day.completableCount, 3);
  assert.equal(completionPercent(day), 67);
  assert.equal(day.agenda.find(entry => entry.key === 'schedule:schedule').completed, undefined);
  assert.equal(completionPercent(emptySummary()), 0);
});

test('duration handles midnight, overnight, zero-length, missing and invalid times', () => {
  assert.equal(durationMinutes('23:00', '24:00'), 60);
  assert.equal(durationMinutes('23:00', '07:00'), 480);
  assert.equal(durationMinutes('00:00', '07:00'), 420);
  assert.equal(durationMinutes('23:00', '00:00'), 60);
  assert.equal(durationMinutes('08:00', '08:00'), 0);
  assert.equal(durationMinutes('09:00'), 0);
  for (const invalid of ['25:00', '24:01', '09:60', 'bad', '9:00']) assert.equal(durationMinutes(invalid, '10:00'), 0);
});

test('start-only tasks and undated-duration TODOs do not invent planned hours', () => {
  const day = buildCalendarIndex([task({ kind: 'timed', startTime: '12:00' }), task({ id: 'todo', startTime: '12:00', endTime: '14:00' })], [], []).get(date);
  assert.equal(day.taskCount, 2);
  assert.equal(day.plannedMinutes, 0);
});

test('clipped overnight occurrences contribute their actual per-day hours and completion', () => {
  const next = shiftDate(date, 1);
  const index = buildCalendarIndex([], [schedule({ startTime: '23:00', endTime: '24:00', completed: true, occurrenceDate: date }), schedule({ id: 'continuation', date: next, startTime: '00:00', endTime: '07:00', completed: true, occurrenceDate: date })], []);
  assert.equal(index.get(date).scheduledMinutes, 60);
  assert.equal(index.get(next).scheduledMinutes, 420);
  assert.equal(summarizeDates([date, next], index).plannedMinutes, 480);
});

test('period summaries exclude entries outside the period and retain deadline-only days', () => {
  const next = shiftDate(date, 1);
  const index = buildCalendarIndex([task({ status: 'done' }), task({ id: 'outside', date: '2027-01-01' })], [schedule()], [goal(), goal({ id: 'mid', kind: 'mid-term', deadlineDate: next }), goal({ id: 'none', kind: 'mid-term', deadlineDate: undefined })]);
  const summary = summarizeDates([date, next, shiftDate(next, 1)], index);
  assert.deepEqual(summary, { taskCount: 1, scheduleCount: 1, completedCount: 1, completableCount: 1, plannedMinutes: 90, scheduledMinutes: 90, deadlineCount: 2, activeDays: 1 });
  assert.equal(index.get(next).agenda.length, 0);
  assert.equal(index.get(next).deadlines[0].id, 'mid');
  assert.deepEqual(summarizeDates([], index), emptySummary());
  assert.equal(index.has('undefined'), false);
});

test('workload levels respond to both counts and hours, not just presence of an entry', () => {
  const summary = (taskCount, plannedMinutes = 0) => ({ ...emptySummary(), taskCount, plannedMinutes });
  assert.equal(workloadLevel(), 0);
  assert.equal(workloadLevel(emptySummary()), 0);
  assert.equal(workloadLevel(summary(1)), 1);
  assert.equal(workloadLevel(summary(2, 120)), 1);
  assert.equal(workloadLevel(summary(3)), 2);
  assert.equal(workloadLevel(summary(1, 240)), 2);
  assert.equal(workloadLevel(summary(5)), 3);
  assert.equal(workloadLevel(summary(1, 360)), 3);
  assert.equal(workloadLevel(summary(7)), 4);
  assert.equal(workloadLevel(summary(1, 361)), 4);
});

test('Saturday-first weeks cross month and year boundaries without losing days', () => {
  assert.deepEqual(weekDates('2026-01-01'), ['2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  assert.equal(weekDates('2026-10-10')[0], '2026-10-10');
});

test('week arithmetic stays local across DST and in positive-offset time zones', () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ['America/New_York', 'Asia/Tehran', 'Pacific/Auckland']) {
      process.env.TZ = timezone;
      assert.deepEqual(weekDates('2025-03-09'), ['2025-03-08', '2025-03-09', '2025-03-10', '2025-03-11', '2025-03-12', '2025-03-13', '2025-03-14'], timezone);
      assert.deepEqual(weekDates('2025-11-02'), ['2025-11-01', '2025-11-02', '2025-11-03', '2025-11-04', '2025-11-05', '2025-11-06', '2025-11-07'], timezone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('Gregorian mini calendars include every real day with correct leading and trailing cells', () => {
  for (const [key, count] of [['2025-02-10', 28], ['2024-02-10', 29], ['2026-04-10', 30], ['2026-01-10', 31]]) {
    const month = getMonthDays(key, 'gregorian');
    const rows = monthCells(month);
    const cells = rows.flat();
    assert.equal(month.count, count);
    assert.ok(rows.every(row => row.length === 7));
    assert.deepEqual(cells.filter(Boolean), month.dates);
    assert.ok(cells.slice(0, month.offset).every(cell => cell === null));
    assert.equal(cells[month.offset], month.dates[0]);
    assert.equal(calendarParts(month.dates[count - 1], 'gregorian').day, count);
  }
  assert.equal(getMonthDays('2026-01-10', 'gregorian').offset, 5);
  assert.equal(getMonthDays('2025-02-10', 'gregorian').offset, 0);
});

test('Persian leap and non-leap Esfand preserve day numbers and month offsets', () => {
  for (const [year, count] of [[1403, 30], [1404, 29]]) {
    const first = calendarMonthKey(year, 12, 'persian');
    const month = getMonthDays(first, 'persian');
    assert.equal(month.count, count);
    assert.equal(month.offset, (new Date(`${first}T12:00:00`).getDay() + 1) % 7);
    assert.deepEqual(monthCells(month).flat().filter(Boolean), month.dates);
    assert.equal(calendarParts(month.dates[count - 1], 'persian').day, count);
  }
});

test('both calendar years contain twelve complete contiguous months, including leap days', () => {
  for (const [calendar, year, count] of [['gregorian', 2024, 366], ['gregorian', 2025, 365], ['persian', 1403, 366], ['persian', 1404, 365]]) {
    const months = yearMonths(calendarMonthKey(year, 6, calendar), calendar);
    assert.equal(months.length, 12);
    const dates = months.flatMap(month => month.dates);
    assert.equal(dates.length, count);
    assert.equal(new Set(dates).size, count);
    months.forEach((month, index) => {
      assert.equal(month.month, index + 1);
      assert.equal(month.year, year);
      assert.deepEqual(monthCells(month).flat().filter(Boolean), month.dates);
    });
    dates.slice(1).forEach((key, index) => assert.equal(key, shiftDate(dates[index], 1)));
  }
});

const renderView = (overrides = {}) => renderToStaticMarkup(createElement(CalendarViews, {
  view: 'weekly', date, calendar: 'gregorian', tasks: [], schedule: [], goals: [],
  weeklyCommitmentHours: 0, getProgress: () => 0,
  onSelectDate: () => {}, onSelectMonth: () => {}, onNavigate: () => {}, ...overrides
}));

test('weekly rendered agenda includes both sources, completion and deadlines', () => {
  const html = renderView({ tasks: [task({ title: 'نوشتن گزارش', status: 'done' })], schedule: [schedule({ title: 'جلسه‌ی تیم' })], goals: [goal({ title: 'تحویل پروژه' })], getProgress: () => 150 });
  assert.match(html, /نوشتن گزارش/);
  assert.match(html, /جلسه‌ی تیم/);
  assert.match(html, /تحویل پروژه/);
  assert.match(html, /is-complete/);
  assert.match(html, /aria-label="پیشرفت تحویل پروژه"/);
  assert.match(html, /value="100"/);
  assert.equal((html.match(/class="cv-week-day/g) ?? []).length, 7);
});

test('monthly rendering labels true today independently of the selected date and exposes overflow', () => {
  const today = todayKey();
  const selected = getMonthDays(today, 'gregorian').dates.find(key => key !== today);
  const html = renderView({ view: 'monthly', date: selected, tasks: [task({ id: 'one', date: today }), task({ id: 'two', date: today }), task({ id: 'three', date: today })], schedule: [schedule({ date: today })] });
  assert.equal((html.match(/aria-current="date"/g) ?? []).length, 1);
  assert.equal((html.match(/class="cv-month-day is-selected"/g) ?? []).length, 1);
  assert.match(html, /\+۲ مورد دیگر/);
  assert.match(html, /امروز/);
});

test('responsive month indicators retain task, schedule and deadline information in both calendars', () => {
  for (const calendar of ['persian', 'gregorian']) {
    const html = renderView({ view: 'monthly', calendar, tasks: [task()], schedule: [schedule()], goals: [goal()] });
    assert.match(html, /class="cv-month-activity"><i><\/i>۲<\/span>/);
    assert.match(html, /class="cv-month-due">◆<\/span>/);
    assert.match(html, /۲ مورد؛ ۱٫۵ ساعت برنامه/);
    assert.equal((html.match(/class="cv-month-day/g) ?? []).length, getMonthDays(date, calendar).count);
    assert.equal((html.match(/class="cv-weekday"/g) ?? []).length, 7);
    assert.doesNotMatch(html, /پیمایش افقی|tabindex="0"/);
  }
});

test('weekly responsive rows keep date and metrics grouped without a scrolling region', () => {
  const html = renderView({ tasks: [task()], schedule: [schedule()] });
  assert.equal((html.match(/class="cv-week-date"/g) ?? []).length, 7);
  assert.equal((html.match(/class="cv-week-metrics"/g) ?? []).length, 7);
  assert.match(html, /۱ کار · ۱ بازه/);
  assert.doesNotMatch(html, /پیمایش|tabindex="0"/);
});

test('yearly rendering produces twelve full accessible month tables in both calendars', () => {
  for (const calendar of ['gregorian', 'persian']) {
    const year = calendar === 'gregorian' ? 2024 : 1403;
    const first = calendarMonthKey(year, 1, calendar);
    const html = renderView({ view: 'yearly', calendar, date: first });
    assert.equal((html.match(/class="cv-mini-calendar"/g) ?? []).length, 12);
    assert.equal((html.match(/class="cv-mini-day /g) ?? []).length, 366);
    assert.equal((html.match(/scope="col"/g) ?? []).length, 84);
    assert.equal((html.match(/aria-label="باز کردن /g) ?? []).length, 12);
    assert.match(html, /راهنمای حجم برنامه/);
  }
});

test('deadline summaries follow the selected calendar year at Nowruz boundaries', () => {
  const first = calendarMonthKey(1404, 1, 'persian');
  const previous = shiftDate(first, -1);
  const index = buildCalendarIndex([], [], [goal({ id: 'before', deadlineDate: previous }), goal({ id: 'after', deadlineDate: first })]);
  const dates = yearMonths(first, 'persian').flatMap(month => month.dates);
  assert.equal(summarizeDates(dates, index).deadlineCount, 1);
  assert.equal(calendarParts(previous, 'persian').year, 1403);
  assert.equal(calendarParts(first, 'persian').year, 1404);
});
