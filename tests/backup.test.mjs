import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { parsePlannerBackup, exportPlannerBackup, importPlannerBackup } = await server.ssrLoadModule('/src/storage/plannerBackup.ts');
const { database } = await server.ssrLoadModule('/src/storage/localDatabase.ts');
const { createCustomTheme, normalizeThemePreferences } = await server.ssrLoadModule('/src/features/themes/registry.ts');
const { LocalShortTermTaskRepository, LocalGoalRepository } = await server.ssrLoadModule('/src/repositories/localRepositories.ts');

const tables = ['tasks', 'schedule', 'goals', 'shortTasks', 'notes', 'preferences'];
const timestamp = '2026-10-08T12:34:56.000Z';
const date = '2026-10-08';
const base = { title: 'برنامه', createdAt: timestamp, updatedAt: timestamp };
function fixture() {
  const custom = createCustomTheme('my-theme', 'My theme', 'hacker');
  custom.linkModes = false;
  custom.modes.dark.background = { kind: 'gradient', color: '#123456', endColor: '#abcdef', angle: 270, future: 'background metadata' };
  custom.modes.dark.effect = 'liquid-glass';
  custom.future = { nested: [null, 1, false, 'preserved'] };
  return {
    format: 'rooz-planner-backup', version: 1, exportedAt: timestamp, futureEnvelope: ['metadata'],
    data: {
      tasks: [
        { ...base, id: 'task', date, kind: 'timed', startTime: '09:00', endTime: '10:00', description: 'Details', status: 'open', color: '#123456', extra: { keep: true } },
        { ...base, id: 'todo', date, kind: 'todo', status: 'done', color: 'rebeccapurple' }
      ],
      schedule: [{ ...base, id: 'schedule', date, startTime: '23:00', endTime: '07:00', color: '#123456', extra: 'overnight' }],
      goals: [
        { ...base, id: 'long', kind: 'long-term', deadlineDate: '2027-12-31', note: 'Long term', extra: 1 },
        {
          ...base, id: 'mid', kind: 'mid-term', relatedLongTermGoals: [{ goalId: 'long', coefficient: 5, extra: 'relation' }],
          category: 'education', customCategory: '', why: '', importance: 10, deadlineChoice: 'yes', deadlineDate: '2027-01-01',
          dateReason: '', deadlineType: 'self-imposed', realism: 'probably', doneCriteria: '', milestones: ['First', 'Second'], keyMilestone: 1,
          firstAction: '', weeklyHours: 3.5, tradeoffs: '', difficulty: 1, obstacles: ['Time'], controllableObstacle: 0, motivationPlan: '',
          priorityChoice: 'unsure', competingGoals: '', adaptPlan: '', progressMeasures: '', reviewFrequency: 'other', reviewFrequencyOther: 'Daily',
          progressOneMonth: '', progressThreeMonths: '', progressHalfway: '', checkWant: 'yes', checkEffort: 'unsure', checkSpecific: 'yes',
          checkTimeframe: 'not-needed', checkInfluence: 'partly', checkFirstStep: 'no', finalWant: '', finalBecause: '', finalBy: '',
          finalSuccess: '', finalFirstStep: '', finalReviewDate: date, extra: { keep: ['goal'] }
        }
      ],
      shortTasks: [
        { ...base, id: 'job', kind: 'short-term', mode: 'job', color: '#123456', priority: 10, relatedMidTermGoals: [{ goalId: 'mid', coefficient: 2 }], triggerDate: date, triggerTime: '12:00', completed: true, completedDates: [], extra: 'job' },
        { ...base, id: 'routine', kind: 'short-term', mode: 'routine', color: '#abcdef', priority: 5, relatedMidTermGoals: [], completed: false, completedDates: [date],
          routine: { pattern: 'selected', weekdays: [0, 4, 6], startDate: date, endDate: '2026-12-31', isTimed: true, startTime: '23:00', endTime: '07:00', extra: { keep: true } } },
        { ...base, id: 'untimed', kind: 'short-term', mode: 'routine', color: '#abcdef', priority: 1, relatedMidTermGoals: [], completed: false, completedDates: [], routine: { pattern: 'daily', weekdays: [], startDate: date, isTimed: false } }
      ],
      notes: [{ date, content: 'یادداشت', updatedAt: timestamp, id: 'not-the-primary-key', extra: ['note'] }],
      preferences: [
        { id: 'planner', value: { calendar: 'persian', theme: { activeThemeId: custom.id, mode: 'dark', customThemes: [custom], extra: 'theme' }, extra: 'preferences' }, extra: 'row' },
        { id: 'legacy', value: { calendar: 'gregorian' } }
      ],
      futureData: { keep: 'metadata, not a database table' }
    }
  };
}
const parse = value => parsePlannerBackup(JSON.stringify(value));

// This mock verifies transaction scope, sequencing, and error propagation.
// Rollback is modeled here; real IndexedDB/Dexie rollback is not exercised.
async function withDatabase(initial, run, options = {}) {
  let state = structuredClone(initial);
  let staged;
  let active = false;
  const events = [];
  const originals = tables.map(name => [database[name], database[name].toArray, database[name].clear, database[name].bulkAdd]);
  const transaction = database.transaction;
  for (const name of tables) {
    database[name].toArray = async () => {
      assert.ok(active, 'reads must be in the transaction');
      events.push(`read:${name}`);
      if (options.failRead === name) throw new Error('Injected read failure');
      return structuredClone(staged[name]);
    };
    database[name].clear = async () => {
      assert.ok(active, 'clears must be in the transaction');
      events.push(`clear:${name}`);
      staged[name] = [];
      if (options.failClear === name) throw new Error('Injected clear failure');
    };
    database[name].bulkAdd = async records => {
      assert.ok(active, 'inserts must be in the transaction');
      events.push(`add:${name}`);
      // Mutate the staged transaction before throwing to model a partial write.
      staged[name].push(...structuredClone(records));
      if (options.failAdd === name) throw new Error('Injected bulkAdd failure');
    };
  }
  database.transaction = async (mode, scope, callback) => {
    assert.deepEqual(scope, tables.map(name => database[name]));
    assert.equal(active, false);
    events.push(`transaction:${mode}`);
    staged = structuredClone(state);
    active = true;
    options.onTransaction?.();
    try {
      const result = await callback();
      if (mode === 'rw') state = staged;
      events.push('commit');
      return result;
    } catch (error) {
      events.push('rollback');
      throw error;
    } finally { active = false; }
  };
  try { await run({ events, state: () => structuredClone(state) }); }
  finally {
    database.transaction = transaction;
    for (const [table, toArray, clear, bulkAdd] of originals) Object.assign(table, { toArray, clear, bulkAdd });
  }
}
const tableData = backup => Object.fromEntries(tables.map(name => [name, structuredClone(backup.data[name])]));
const emptyData = () => Object.fromEntries(tables.map(name => [name, []]));

test('JSON roundtrip preserves all record types, IDs, and unknown nested fields', () => {
  const backup = fixture();
  assert.deepEqual(parse(backup), backup);
  assert.deepEqual(parse(parse(backup)), backup);
  assert.equal(parse(backup).data.notes[0].id, 'not-the-primary-key');
});

test('empty tables and legacy preferences are valid; dangling relations are preserved', () => {
  const backup = fixture();
  backup.data = emptyData();
  assert.deepEqual(parse(backup), backup);
  const dangling = fixture();
  dangling.data.goals[1].relatedLongTermGoals[0].goalId = 'deleted-goal';
  dangling.data.shortTasks[0].relatedMidTermGoals[0].goalId = 'deleted-mid';
  assert.deepEqual(parse(dangling), dangling);
});

test('all routine patterns, untimed jobs, midnight ends, and empty goal lists are valid', () => {
  for (const pattern of ['daily', 'weekdays', 'weekends', 'selected', 'even-dates', 'odd-dates']) {
    const backup = fixture();
    backup.data.shortTasks[1].routine.pattern = pattern;
    backup.data.shortTasks[1].routine.endTime = '24:00';
    delete backup.data.shortTasks[0].triggerDate;
    delete backup.data.shortTasks[0].triggerTime;
    Object.assign(backup.data.goals[1], { milestones: [], keyMilestone: 0, obstacles: [], controllableObstacle: 0 });
    assert.deepEqual(parse(backup), backup);
  }
});

test('invalid JSON and envelope/table errors are rejected', () => {
  for (const text of ['', '{', 'null', '[]', 'true', '42', '"backup"']) assert.throws(() => parsePlannerBackup(text));
  for (const mutate of [
    b => { b.format = 'other'; }, b => { b.version = 2; }, b => { b.version = '1'; },
    b => { delete b.exportedAt; }, b => { b.exportedAt = '2026-02-30T12:00:00Z'; }, b => { b.exportedAt = '2026-10-08T24:00:00Z'; }, b => { b.exportedAt = date; },
    b => { delete b.data; }, b => { b.data = []; }
  ]) { const b = fixture(); mutate(b); assert.throws(() => parse(b), /Invalid planner backup/); }
  for (const name of tables) {
    for (const value of [undefined, null, {}, 'records']) {
      const b = fixture(); b.data[name] = value;
      assert.throws(() => parse(b), new RegExp(`backup.data.${name}`));
    }
    for (const row of [null, [], 'row', {}]) {
      const b = fixture(); b.data[name] = [row]; assert.throws(() => parse(b), /Invalid planner backup/);
    }
    const b = fixture(); b.data[name].push(structuredClone(b.data[name][0]));
    assert.throws(() => parse(b), /unique primary key/);
  }
});

test('every required runtime field is checked, including nested fields', () => {
  const b = fixture();
  for (const name of tables) {
    for (let index = 0; index < b.data[name].length; index++) {
      for (const field of Object.keys(b.data[name][index])) {
        if (['extra', 'description', 'triggerDate', 'triggerTime'].includes(field) || (name === 'tasks' && ['startTime', 'endTime'].includes(field)) || (name === 'notes' && field === 'id') || (name === 'goals' && index === 1 && field === 'deadlineDate')) continue;
        const invalid = fixture(); delete invalid.data[name][index][field];
        assert.throws(() => parse(invalid), /Invalid planner backup/, `${name}[${index}].${field}`);
      }
    }
  }
  for (const field of ['pattern', 'weekdays', 'startDate', 'isTimed', 'startTime', 'endTime']) {
    const invalid = fixture(); delete invalid.data.shortTasks[1].routine[field];
    assert.throws(() => parse(invalid), /Invalid planner backup/, `routine.${field}`);
  }

});

test('custom theme identity stays strict, while missing appearance overrides remain absent', () => {
  for (const field of ['id', 'name', 'parentId']) {
    const b = fixture(); delete b.data.preferences[0].value.theme.customThemes[0][field];
    assert.throws(() => parse(b), /Invalid planner backup/);
  }
  for (const mode of ['light', 'dark']) {
    for (const field of ['background', 'accent', 'animation', 'effect']) {
      const b = fixture(); delete b.data.preferences[0].value.theme.customThemes[0].modes[mode][field];
      assert.deepEqual(parse(b), b);
    }
    for (const field of ['kind', 'color', 'endColor', 'angle']) {
      const b = fixture(); delete b.data.preferences[0].value.theme.customThemes[0].modes[mode].background[field];
      assert.deepEqual(parse(b), b);
    }
  }
});

test('supported legacy themes parse, export, and import without migration or raw-field loss', async () => {
  const legacyCustom = { id: 'legacy', name: '  Legacy  ', parentId: 'hacker', modes: { light: { accent: '#ABCDEF', extra: 'light' } }, extra: { keep: true } };
  const independent = createCustomTheme('independent', 'Independent', 'barbari');
  delete independent.linkModes;
  independent.modes.light.accent = '#ff5500'; independent.modes.dark.accent = '#0066ff';
  const variants = [
    {}, { activeThemeId: 'barbari' }, { mode: 'dark' }, { customThemes: [] },
    { activeThemeId: 'deleted-custom', mode: 'dark', customThemes: [], extra: 'stale selection' },
    { activeThemeId: 'legacy', customThemes: [legacyCustom], extra: 'missing mode' },
    { activeThemeId: 'legacy', mode: 'dark', customThemes: [{ id: 'legacy', name: 'Legacy', parentId: 'mini' }] },
    { activeThemeId: 'legacy', customThemes: [{ ...legacyCustom, modes: { light: { background: { color: '#123456', angle: 450, extra: 'background' } }, dark: {} } }] },
    { activeThemeId: 'independent', mode: 'dark', customThemes: [independent] }
  ];
  for (const theme of variants) {
    const b = fixture(); b.data.preferences[0].value.theme = structuredClone(theme);
    const before = structuredClone(b);
    const normalized = normalizeThemePreferences(theme);
    assert.deepEqual(parse(b), before);
    await withDatabase(tableData(b), async ({ state }) => {
      const exported = await exportPlannerBackup();
      assert.deepEqual(exported.data, tableData(before));
      assert.deepEqual(normalizeThemePreferences(exported.data.preferences[0].value.theme), normalized);
      await importPlannerBackup(parse(exported));
      assert.deepEqual(state(), tableData(before));
      assert.deepEqual((await exportPlannerBackup()).data, tableData(before));
    });
    assert.deepEqual(b, before);
  }
  const migrated = normalizeThemePreferences(variants[5]);
  assert.equal(migrated.customThemes[0].modes.light.accent, '#abcdef');
  assert.equal(migrated.customThemes[0].linkModes, true);
  assert.equal(migrated.customThemes[0].name, 'Legacy');
  assert.equal(variants[5].customThemes[0].modes.light.accent, '#ABCDEF');
  assert.equal(variants[5].customThemes[0].linkModes, undefined);
});

test('malformed record values, relations, routines, and themes are rejected rather than normalized', () => {
  const cases = [
    b => { b.data.tasks[0].id = ''; }, b => { b.data.tasks[0].date = '2026-02-30'; },
    b => { b.data.tasks[0].kind = 'event'; }, b => { b.data.tasks[0].status = 'closed'; },
    b => { b.data.tasks[0].description = 1; }, b => { b.data.tasks[0].startTime = '25:00'; },
    b => { b.data.schedule[0].endTime = '12:60'; }, b => { b.data.notes[0].content = []; },
    b => { b.data.goals[1].weeklyHours = '3'; }, b => { b.data.goals[1].importance = 11; },
    b => { b.data.goals[1].keyMilestone = 2; }, b => { b.data.goals[1].checkInfluence = 'unsure'; },
    b => { b.data.goals[1].milestones = [1]; }, b => { b.data.goals[1].relatedLongTermGoals = [null]; },
    b => { b.data.goals[1].relatedLongTermGoals[0].coefficient = 6; },
    b => { b.data.shortTasks[0].relatedMidTermGoals[0].goalId = false; },
    b => { b.data.shortTasks[0].relatedMidTermGoals[0].coefficient = 1.5; },
    b => { b.data.shortTasks[0].completed = 'true'; }, b => { b.data.shortTasks[0].completedDates = ['not a date']; },
    b => { b.data.shortTasks[0].priority = 0; }, b => { b.data.shortTasks[1].routine.weekdays = [7]; },
    b => { b.data.shortTasks[1].routine.pattern = 'weekly'; }, b => { b.data.shortTasks[1].routine.isTimed = 1; },
    b => { b.data.shortTasks[1].routine.endDate = '2026-01-01'; }, b => { b.data.shortTasks[1].routine.endTime = '23:00'; },
    b => { b.data.preferences[0].value.calendar = 'julian'; },
    b => { b.data.preferences[0].value.theme.activeThemeId = 1; },
    b => { b.data.preferences[0].value.theme.mode = 'auto'; },
    b => { b.data.preferences[0].value.theme.customThemes.push(structuredClone(b.data.preferences[0].value.theme.customThemes[0])); },
    b => { b.data.preferences[0].value.theme.customThemes[0].id = 'mini'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].parentId = 'unknown'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].name = ''; },
    b => { b.data.preferences[0].value.theme.customThemes[0].linkModes = 'yes'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].modes.light = []; },
    b => { b.data.preferences[0].value.theme.customThemes[0].modes.dark.accent = 'red'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].modes.dark.animation = 'fast'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].modes.dark.effect = 'glass'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].modes.dark.background.kind = 'image'; },
    b => { b.data.preferences[0].value.theme.customThemes[0].modes.dark.background.angle = '361'; }
  ];
  for (const [index, mutate] of cases.entries()) {
    const b = fixture(); mutate(b); assert.throws(() => parse(b), /Invalid planner backup/, `malformed case ${index}`);
  }
});

test('export takes one read transaction, preserving every row and unknown record field', async () => {
  const initial = tableData(fixture());
  await withDatabase(initial, async ({ events, state }) => {
    const before = Date.now();
    const backup = await exportPlannerBackup();
    assert.equal(backup.format, 'rooz-planner-backup'); assert.equal(backup.version, 1);
    assert.ok(Date.parse(backup.exportedAt) >= before && Date.parse(backup.exportedAt) <= Date.now());
    assert.deepEqual(backup.data, initial);
    assert.deepEqual(parse(backup), backup);
    assert.deepEqual(state(), initial);
    assert.deepEqual(events, ['transaction:r', ...tables.map(name => `read:${name}`), 'commit']);
  });
});

test('import replaces every table in a single rw transaction and roundtrips through export', async () => {
  const backup = fixture(); const before = structuredClone(backup);
  await withDatabase(tableData(fixture()), async ({ events, state }) => {
    await importPlannerBackup(backup);
    assert.deepEqual(state(), tableData(backup));
    assert.deepEqual(events, ['transaction:rw', ...tables.map(name => `clear:${name}`), ...tables.map(name => `add:${name}`), 'commit']);
    assert.deepEqual(backup, before);
    assert.deepEqual((await exportPlannerBackup()).data, tableData(backup));
    const empty = fixture(); empty.data = emptyData();
    await importPlannerBackup(empty); assert.deepEqual(state(), emptyData());
  });
});

test('invalid direct imports are rejected before opening a transaction or touching data', async () => {
  const initial = tableData(fixture());
  await withDatabase(initial, async ({ events, state }) => {
    const invalids = [null, {}, { ...fixture(), version: 99 }];
    for (const value of [NaN, Infinity, 1n, () => {}, new Date(), new Map()]) {
      const b = fixture(); b.data.tasks[0].extra = value; invalids.push(b);
    }
    const cyclic = fixture(); cyclic.extra = cyclic; invalids.push(cyclic);
    const sparse = fixture(); sparse.extra = new Array(2); invalids.push(sparse);
    const undefinedElement = fixture(); undefinedElement.extra = [undefined]; invalids.push(undefinedElement);
    const symbol = fixture(); symbol[Symbol('extra')] = 1; invalids.push(symbol);
    const extraArray = fixture(); extraArray.extra = []; extraArray.extra.metadata = 'lost'; invalids.push(extraArray);
    const numericArray = fixture(); numericArray.extra = []; numericArray.extra[4294967295] = 'lost'; invalids.push(numericArray);
    const missing = fixture(); delete missing.data.notes; invalids.push(missing);
    const duplicate = fixture(); duplicate.data.notes.push({ ...duplicate.data.notes[0], id: 'different' }); invalids.push(duplicate);
    for (const b of invalids) await assert.rejects(importPlannerBackup(b), /Invalid planner backup/);
    assert.deepEqual(events, []); assert.deepEqual(state(), initial);
  });
});

test('raw snapshots preserve optional and unknown undefined object fields; JSON omits them normally', async () => {
  const b = fixture();
  Object.assign(b.data.shortTasks[0], { triggerDate: undefined, triggerTime: undefined, routine: undefined });
  b.data.shortTasks[2].routine.endDate = undefined;
  b.data.goals[1].deadlineDate = undefined;
  b.data.preferences[1].value.theme = undefined;
  b.data.goals[1].oldField = undefined;
  b.data.shortTasks[0].extra = { retiredField: undefined, keep: 'metadata' };
  await withDatabase(tableData(b), async ({ state }) => {
    const exported = await exportPlannerBackup();
    assert.deepEqual(exported.data, tableData(b));
    assert.ok(Object.hasOwn(exported.data.goals[1], 'oldField'));
    assert.deepEqual(parse(exported).data, JSON.parse(JSON.stringify(tableData(b))));
    await importPlannerBackup(b);
    assert.deepEqual(state(), exported.data);
    await importPlannerBackup(parse(exported));
    assert.deepEqual(state(), JSON.parse(JSON.stringify(tableData(b))));
  });
});

test('repository updates retain metadata and cleared optional fields through raw backup snapshots', async () => {
  const b = fixture();
  for (const [tableName, index, repository, changes] of [
    ['shortTasks', 1, new LocalShortTermTaskRepository(), { mode: 'job', triggerDate: undefined, triggerTime: undefined, routine: undefined, completed: false, completedDates: [] }],
    ['goals', 1, new LocalGoalRepository(), { title: 'Edited goal', deadlineDate: undefined }]
  ]) {
    const table = database[tableName];
    const current = { ...b.data[tableName][index], retiredOptional: undefined, metadata: { keep: 'from previous version', absent: undefined } };
    const originalGet = table.get; const originalPut = table.put;
    let written;
    table.get = async id => { assert.equal(id, current.id); return structuredClone(current); };
    table.put = async row => { written = structuredClone(row); return row.id; };
    try {
      const updated = await repository.update(current.id, changes);
      assert.deepEqual(updated, written);
      assert.ok(Object.hasOwn(written, 'retiredOptional'));
      assert.deepEqual(written.metadata, current.metadata);
      b.data[tableName][index] = written;
    } finally { table.get = originalGet; table.put = originalPut; }
  }
  await withDatabase(tableData(b), async ({ state }) => {
    const exported = await exportPlannerBackup();
    assert.deepEqual(exported.data, tableData(b));
    await importPlannerBackup(exported);
    assert.deepEqual(state(), tableData(b));
    await importPlannerBackup(parse(exported));
    assert.deepEqual(state(), JSON.parse(JSON.stringify(tableData(b))));
  });
});

test('legacy timed tasks can omit optional times, while invalid supplied times still fail', async () => {
  const b = fixture();
  delete b.data.tasks[0].startTime; delete b.data.tasks[0].endTime;
  b.data.tasks[0].description = undefined;
  assert.deepEqual(parse(b), JSON.parse(JSON.stringify(b)));
  await withDatabase(tableData(b), async ({ state }) => {
    const exported = await exportPlannerBackup();
    assert.deepEqual(exported.data, tableData(b));
    await importPlannerBackup(exported); assert.deepEqual(state(), tableData(b));
  });
  b.data.tasks[0].startTime = '25:00';
  assert.throws(() => parse(b), /Invalid planner backup/);
});

test('caller mutation after validation cannot change the imported snapshot', async () => {
  const b = fixture(); const expected = tableData(b);
  await withDatabase(emptyData(), async ({ state }) => {
    await importPlannerBackup(b); assert.deepEqual(state(), expected);
  }, { onTransaction: () => { b.data.tasks[0].title = 'Mutated'; b.data.notes.length = 0; } });
});

test('any clear or insert failure propagates and rolls back the whole replacement', async () => {
  const initial = tableData(fixture());
  const replacement = fixture(); replacement.data.tasks[0].title = 'Replacement'; replacement.data.notes = [];
  for (const name of tables) {
    for (const operation of ['failClear', 'failAdd']) {
      await withDatabase(initial, async ({ state, events }) => {
        await assert.rejects(importPlannerBackup(replacement), /Injected/);
        assert.deepEqual(state(), initial);
        assert.equal(events.at(-1), 'rollback'); assert.ok(!events.includes('commit'));
      }, { [operation]: name });
    }
  }
});

test('export read failures propagate without a partial backup', async () => {
  await withDatabase(tableData(fixture()), async ({ events }) => {
    await assert.rejects(exportPlannerBackup(), /Injected read failure/);
    assert.equal(events.at(-1), 'rollback');
  }, { failRead: 'notes' });
});
