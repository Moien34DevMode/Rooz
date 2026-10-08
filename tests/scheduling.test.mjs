import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { scheduleEntriesForDate } = await server.ssrLoadModule('/src/features/tasks/taskCalculations.ts');
const { CENTER, spiralPoint, rangePath } = await server.ssrLoadModule('/src/features/daily-view/clockGeometry.ts');

const date = '2026-10-08';
const nextDate = '2026-10-09';
function routine(overrides = {}) {
  return {
    id: 'sleep', kind: 'short-term', mode: 'routine', title: 'Sleep', color: '#668f7b', priority: 5,
    relatedMidTermGoals: [], completed: false, completedDates: [], createdAt: '', updatedAt: '',
    routine: { pattern: 'daily', weekdays: [], startDate: date, isTimed: true, startTime: '23:00', endTime: '07:00', ...overrides }
  };
}
const entries = (task, day, calendar = 'gregorian') => scheduleEntriesForDate([], [task], day, calendar);
const times = items => items.map(({ startTime, endTime }) => [startTime, endTime]);

test('overnight routines are clipped at midnight on their first day', () => {
  assert.deepEqual(times(entries(routine(), date)), [['23:00', '24:00']]);
  assert.deepEqual(entries(routine(), '2026-10-07'), []);
});

test('daily overnight routines show yesterday’s remainder and today’s start separately', () => {
  const items = entries(routine(), nextDate);
  assert.deepEqual(times(items), [['00:00', '07:00'], ['23:00', '24:00']]);
  assert.equal(new Set(items.map(item => item.id)).size, 2);
  assert.deepEqual(items.map(item => item.occurrenceDate), [date, nextDate]);
});

test('continuations retain the original occurrence and completion on a non-recurring day', () => {
  const task = routine({ pattern: 'selected', weekdays: [4], endDate: date });
  task.completedDates = [date];
  const items = entries(task, nextDate);
  assert.deepEqual(times(items), [['00:00', '07:00']]);
  assert.equal(items[0].date, nextDate);
  assert.equal(items[0].occurrenceDate, date);
  assert.equal(items[0].completed, true);
  assert.deepEqual(entries(task, '2026-10-10'), []);
});

test('same-day intervals, including noon crossings, do not spill into tomorrow', () => {
  for (const [startTime, endTime] of [['03:00', '06:00'], ['11:00', '13:00'], ['15:00', '18:00']]) {
    const task = routine({ startTime, endTime, endDate: date });
    assert.deepEqual(times(entries(task, date)), [[startTime, endTime]]);
    assert.deepEqual(entries(task, nextDate), []);
  }
});

test('an interval ending exactly at midnight has no empty continuation', () => {
  const task = routine({ endTime: '00:00', endDate: date });
  assert.deepEqual(times(entries(task, date)), [['23:00', '24:00']]);
  assert.deepEqual(entries(task, nextDate), []);
});

test('calendar month parity is checked for the starting day, not the continuation day', () => {
  for (const calendar of ['gregorian', 'persian']) {
    const task = routine({ pattern: 'even-dates', startDate: '2026-01-01' });
    for (let day = 1; day < 28; day++) {
      const current = `2026-10-${String(day).padStart(2, '0')}`;
      const following = `2026-10-${String(day + 1).padStart(2, '0')}`;
      if (entries(task, current, calendar).some(item => item.startTime === '23:00')) {
        assert.ok(entries(task, following, calendar).some(item => item.startTime === '00:00' && item.occurrenceDate === current));
      }
    }
  }
});

test('legacy overnight intervals preserve their source ID for deletion', () => {
  const item = { id: 'legacy-sleep', title: 'Sleep', date, startTime: '23:00', endTime: '07:00', color: '#668f7b', createdAt: '', updatedAt: '' };
  assert.deepEqual(times(scheduleEntriesForDate([item], [], date, 'gregorian')), [['23:00', '24:00']]);
  const [continuation] = scheduleEntriesForDate([item], [], nextDate, 'gregorian');
  assert.equal(continuation.sourceId, item.id);
  assert.equal(continuation.occurrenceDate, date);
  assert.notEqual(continuation.id, item.id);
});

test('spiral radii increase continuously through midnight, noon, and the end of day', () => {
  const radius = time => { const p = spiralPoint(time); return Math.hypot(p.x - CENTER, p.y - CENTER); };
  assert.equal(radius('00:00'), 207);
  assert.equal(radius('12:00'), 237);
  assert.equal(radius('24:00'), 267);
  assert.ok(radius('03:00') < radius('15:00'));
  assert.ok(radius('11:59') < radius('12:00'));
  assert.ok(radius('12:00') < radius('12:01'));
});

test('Sleep does not cover the afternoon call on either day’s spiral', () => {
  const sleep = routine();
  const call = { ...routine({ startTime: '15:00', endTime: '18:00' }), id: 'call', title: 'Call Ali' };
  for (const day of [date, nextDate]) {
    const items = scheduleEntriesForDate([], [sleep, call], day, 'gregorian');
    assert.deepEqual(times(items.filter(item => item.shortTaskId === 'call')), [['15:00', '18:00']]);
    for (const segment of items.filter(item => item.shortTaskId === 'sleep')) {
      assert.ok(segment.endTime <= '15:00' || segment.startTime >= '18:00');
    }
  }
});

test('intervals longer than twelve hours retain both turns of the spiral', () => {
  const path = rangePath('01:00', '23:00');
  assert.equal((path.match(/L /g) ?? []).length, 440);
  const start = spiralPoint('01:00');
  const end = spiralPoint('23:00');
  assert.ok(path.startsWith(`M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`));
  assert.ok(path.endsWith(`${end.x.toFixed(3)} ${end.y.toFixed(3)}`));
});

test('a multi-hour interval follows the spiral rather than a same-radius circular arc', () => {
  const path = rangePath('11:00', '13:00');
  assert.ok(path.startsWith('M '));
  assert.equal((path.match(/L /g) ?? []).length, 40);
  const end = spiralPoint('13:00');
  assert.ok(path.endsWith(`${end.x.toFixed(3)} ${end.y.toFixed(3)}`));
  assert.ok(!path.includes('NaN'));
});
