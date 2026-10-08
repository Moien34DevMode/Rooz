import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { ClockPlanner } = await server.ssrLoadModule('/src/features/daily-view/ClockPlanner.tsx');
const { PlannerService } = await server.ssrLoadModule('/src/services/plannerService.ts');
const { todayKey } = await server.ssrLoadModule('/src/features/calendar/calendar.ts');
const noop = () => {};
const props = { calendar: 'persian', tasks: [], schedule: [], onToggle: noop, onToggleRoutine: noop, onDelete: noop, onDeleteSchedule: noop };

test('clock renders task and overnight routine details with accessible controls', () => {
  const markup = renderToStaticMarkup(createElement(ClockPlanner, {
    ...props, date: '2026-10-08',
    tasks: [{ id: 'task', title: 'تماس', date: '2026-10-08', kind: 'timed', startTime: '15:00', status: 'done', color: '#517365', source: 'legacy' }],
    schedule: [{ id: 'sleep', title: 'خواب', date: '2026-10-08', startTime: '00:00', endTime: '07:00', color: '#517365', shortTaskId: 'routine', occurrenceDate: '2026-10-07', completed: true }]
  }));
  assert.match(markup, /فهرست زمان‌بندی روز/);
  assert.match(markup, /تماس/);
  assert.match(markup, /خواب/);
  assert.match(markup, /ادامه از روز قبل/);
  assert.match(markup, /aria-label="بازگرداندن تماس"/);
  assert.match(markup, /aria-label="حذف خواب"/);
});

test('the current-time spiral indicator belongs only to today, not historical plans', () => {
  const today = renderToStaticMarkup(createElement(ClockPlanner, { ...props, date: todayKey() }));
  const history = renderToStaticMarkup(createElement(ClockPlanner, { ...props, date: '2000-01-01' }));
  assert.match(today, /class="clock-now"/);
  assert.doesNotMatch(history, /class="clock-now"/);
  assert.match(history, /برنامه‌ی روز انتخاب‌شده/);
  assert.match(history, /ساعت زنده/);
});

test('clearMemory awaits the configured storage reset and propagates failures', async () => {
  let release;
  let called = false;
  const pending = new Promise(resolve => { release = resolve; });
  const planner = new PlannerService({}, {}, {}, {}, {}, {}, async () => { called = true; await pending; });
  let finished = false;
  const clearing = planner.clearMemory().then(() => { finished = true; });
  assert.equal(called, true);
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  await clearing;
  assert.equal(finished, true);
  const broken = new PlannerService({}, {}, {}, {}, {}, {}, async () => { throw new Error('Storage unavailable'); });
  await assert.rejects(broken.clearMemory(), /Storage unavailable/);
});
