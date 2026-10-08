import type { DayNote, Goal, Preferences, ScheduleItem, ShortTermTask, Task } from '../domain/models';
import { parentThemes, themeAnimations, themeEffects, type CustomTheme, type ThemeAppearance, type ThemeBackground, type ThemeMode, type ThemePreferences } from '../features/themes/registry';
import { database } from './localDatabase';

type Raw<T> = T & Record<string, unknown>;
type PersistedAppearance = Raw<Omit<Partial<ThemeAppearance>, 'background'> & { background?: Raw<Partial<ThemeBackground>> }>;
type PersistedCustomTheme = Raw<Omit<CustomTheme, 'modes'> & { modes?: Raw<Partial<Record<ThemeMode, PersistedAppearance>>> }>;
type PersistedThemePreferences = Raw<Omit<Partial<ThemePreferences>, 'customThemes'> & { customThemes?: PersistedCustomTheme[] }>;
type PersistedPreferences = Raw<Omit<Preferences, 'theme'> & { theme?: PersistedThemePreferences }>;
export type PlannerBackup = {
  format: 'rooz-planner-backup';
  version: 1;
  exportedAt: string;
  data: {
    tasks: Raw<Task>[];
    schedule: Raw<ScheduleItem>[];
    goals: Raw<Goal>[];
    shortTasks: Raw<ShortTermTask>[];
    notes: Raw<DayNote>[];
    preferences: Raw<{ id: string; value: PersistedPreferences }>[];
  } & Record<string, unknown>;
} & Record<string, unknown>;

const tableNames = ['tasks', 'schedule', 'goals', 'shortTasks', 'notes', 'preferences'] as const;
type RecordValue = Record<string, unknown>;
type Check = (value: unknown, path: string) => void;
const fail = (path: string, expected: string): never => { throw new Error(`Invalid planner backup at ${path}: expected ${expected}`); };
const record = (value: unknown, path: string): RecordValue => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'an object');
  return value as RecordValue;
};
const string: Check = (value, path) => { if (typeof value !== 'string') fail(path, 'a string'); };
const nonempty: Check = (value, path) => { string(value, path); if (!(value as string).trim()) fail(path, 'a nonempty string'); };
const boolean: Check = (value, path) => { if (typeof value !== 'boolean') fail(path, 'a boolean'); };
const number = (min = -Infinity, max = Infinity, integer = false): Check => (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(path, `${integer ? 'an integer' : 'a finite number'} in [${min}, ${max}]`);
};
const choice = (values: readonly unknown[]): Check => (value, path) => { if (!values.includes(value)) fail(path, `one of ${values.map(value => JSON.stringify(value)).join(', ')}`); };
const array = (check: Check): Check => (value, path) => {
  if (!Array.isArray(value)) fail(path, 'an array');
  (value as unknown[]).forEach((item, index) => check(item, `${path}[${index}]`));
};
const date: Check = (value, path) => {
  string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value as string)) fail(path, 'a YYYY-MM-DD date');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(path, 'a real calendar date');
};
const emptyDate: Check = (value, path) => { if (value !== '') date(value, path); };
const iso: Check = (value, path) => {
  string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value as string) || !Number.isFinite(Date.parse(value as string))) fail(path, 'an ISO timestamp with timezone');
  date((value as string).slice(0, 10), path);
};
const time = (allowMidnight = false): Check => (value, path) => {
  if (typeof value !== 'string' || (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && !(allowMidnight && value === '24:00'))) fail(path, 'an HH:mm time');
};
const hex: Check = (value, path) => { if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) fail(path, 'a six-digit hex color'); };
const fields = (value: RecordValue, path: string, names: string[], check: Check) => names.forEach(name => check(value[name], `${path}.${name}`));
const base = (value: RecordValue, path: string) => {
  fields(value, path, ['id', 'title'], nonempty);
  fields(value, path, ['createdAt', 'updatedAt'], iso);
};
const relations: Check = array((value, path) => {
  const link = record(value, path);
  nonempty(link.goalId, `${path}.goalId`);
  number(1, 5, true)(link.coefficient, `${path}.coefficient`);
});

function validateBackup(value: unknown): PlannerBackup {
  const optional = (value: RecordValue, path: string, name: string, check: Check) => {
    if (value[name] !== undefined) check(value[name], `${path}.${name}`);
  };
  const routine: Check = (value, path) => {
    const r = record(value, path);
    choice(['daily', 'weekdays', 'weekends', 'selected', 'even-dates', 'odd-dates'])(r.pattern, `${path}.pattern`);
    array(number(0, 6, true))(r.weekdays, `${path}.weekdays`);
    date(r.startDate, `${path}.startDate`);
    optional(r, path, 'endDate', date);
    boolean(r.isTimed, `${path}.isTimed`);
    optional(r, path, 'startTime', time());
    optional(r, path, 'endTime', time(true));
    if (r.endDate !== undefined && (r.endDate as string) < (r.startDate as string)) fail(`${path}.endDate`, 'a date on or after startDate');
    if (r.isTimed) {
      time()(r.startTime, `${path}.startTime`);
      time(true)(r.endTime, `${path}.endTime`);
      if (r.startTime === r.endTime) fail(path, 'distinct routine start/end times');
    }
  };
  const appearance: Check = (value, path) => {
    const a = record(value, path);
    // Older custom appearances may contain only overrides. The registry fills
    // absent fields from the parent at runtime; the backup keeps them absent.
    optional(a, path, 'background', (value, backgroundPath) => {
      const b = record(value, backgroundPath);
      optional(b, backgroundPath, 'kind', choice(['solid', 'gradient']));
      for (const name of ['color', 'endColor']) optional(b, backgroundPath, name, hex);
      optional(b, backgroundPath, 'angle', number());
    });
    optional(a, path, 'accent', hex);
    optional(a, path, 'animation', choice(themeAnimations));
    optional(a, path, 'effect', choice(themeEffects));
  };
  const theme: Check = (value, path) => {
    const t = record(value, path);
    optional(t, path, 'activeThemeId', nonempty);
    optional(t, path, 'mode', choice(['light', 'dark']));
    const parents = parentThemes.map(parent => parent.id);
    const ids = new Set<string>(parents);
    optional(t, path, 'customThemes', array((value, customPath) => {
      const custom = record(value, customPath);
      if (typeof custom.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(custom.id) || ids.has(custom.id)) fail(`${customPath}.id`, 'a unique custom theme ID not colliding with a parent');
      ids.add(custom.id as string);
      nonempty(custom.name, `${customPath}.name`);
      choice(parents)(custom.parentId, `${customPath}.parentId`);
      optional(custom, customPath, 'linkModes', boolean);
      optional(custom, customPath, 'modes', (value, modesPath) => {
        const modes = record(value, modesPath);
        for (const mode of ['light', 'dark']) optional(modes, modesPath, mode, appearance);
      });
    }));
    // Stale selections are supported persisted data: runtime falls back to
    // Barbari, but exporting must not rewrite the saved selection.
  };
  const validators: Record<(typeof tableNames)[number], Check> = {
    tasks(value, path) {
      const r = record(value, path); base(r, path);
      date(r.date, `${path}.date`); string(r.color, `${path}.color`);
      choice(['timed', 'todo'])(r.kind, `${path}.kind`);
      choice(['open', 'done'])(r.status, `${path}.status`);
      optional(r, path, 'description', string);
      optional(r, path, 'startTime', time()); optional(r, path, 'endTime', time(true));

    },
    schedule(value, path) {
      const r = record(value, path); base(r, path);
      date(r.date, `${path}.date`); string(r.color, `${path}.color`);
      time()(r.startTime, `${path}.startTime`); time(true)(r.endTime, `${path}.endTime`);
    },
    goals(value, path) {
      const r = record(value, path); base(r, path);
      choice(['long-term', 'mid-term'])(r.kind, `${path}.kind`);
      if (r.kind === 'long-term') { date(r.deadlineDate, `${path}.deadlineDate`); string(r.note, `${path}.note`); return; }
      relations(r.relatedLongTermGoals, `${path}.relatedLongTermGoals`);
      fields(r, path, ['category', 'customCategory', 'why', 'dateReason', 'doneCriteria', 'firstAction', 'tradeoffs', 'motivationPlan', 'competingGoals', 'adaptPlan', 'progressMeasures', 'reviewFrequencyOther', 'progressOneMonth', 'progressThreeMonths', 'progressHalfway', 'finalWant', 'finalBecause', 'finalSuccess', 'finalFirstStep'], string);
      fields(r, path, ['finalBy', 'finalReviewDate'], emptyDate);
      optional(r, path, 'deadlineDate', emptyDate);
      fields(r, path, ['importance', 'difficulty'], number(1, 10));
      number(0, 168)(r.weeklyHours, `${path}.weeklyHours`);
      fields(r, path, ['milestones', 'obstacles'], array(string));
      number(0, Math.max(0, (r.milestones as unknown[]).length - 1), true)(r.keyMilestone, `${path}.keyMilestone`);
      number(0, Math.max(0, (r.obstacles as unknown[]).length - 1), true)(r.controllableObstacle, `${path}.controllableObstacle`);
      fields(r, path, ['deadlineChoice', 'priorityChoice', 'checkWant', 'checkEffort'], choice(['yes', 'no', 'unsure']));
      fields(r, path, ['checkSpecific', 'checkFirstStep'], choice(['yes', 'no']));
      choice(['yes', 'no', 'not-needed'])(r.checkTimeframe, `${path}.checkTimeframe`);
      choice(['yes', 'partly', 'no'])(r.checkInfluence, `${path}.checkInfluence`);
      choice(['fixed', 'self-imposed', 'flexible', ''])(r.deadlineType, `${path}.deadlineType`);
      choice(['definitely', 'probably', 'unsure', 'probably-not'])(r.realism, `${path}.realism`);
      choice(['weekly', 'two-weeks', 'monthly', 'other'])(r.reviewFrequency, `${path}.reviewFrequency`);
    },
    shortTasks(value, path) {
      const r = record(value, path); base(r, path);
      choice(['short-term'])(r.kind, `${path}.kind`); choice(['job', 'routine'])(r.mode, `${path}.mode`);
      string(r.color, `${path}.color`); number(1, 10)(r.priority, `${path}.priority`);
      relations(r.relatedMidTermGoals, `${path}.relatedMidTermGoals`);
      boolean(r.completed, `${path}.completed`); array(date)(r.completedDates, `${path}.completedDates`);
      optional(r, path, 'triggerDate', date); optional(r, path, 'triggerTime', time());
      optional(r, path, 'routine', routine);
      if (r.mode === 'routine' && r.routine === undefined) fail(`${path}.routine`, 'a routine schedule');
    },
    notes(value, path) {
      const r = record(value, path);
      date(r.date, `${path}.date`); string(r.content, `${path}.content`); iso(r.updatedAt, `${path}.updatedAt`);
    },
    preferences(value, path) {
      const r = record(value, path); nonempty(r.id, `${path}.id`);
      const prefs = record(r.value, `${path}.value`);
      choice(['gregorian', 'persian'])(prefs.calendar, `${path}.value.calendar`);
      optional(prefs, `${path}.value`, 'theme', theme);
    }
  };
  const backup = record(value, 'backup');
  choice(['rooz-planner-backup'])(backup.format, 'backup.format');
  choice([1])(backup.version, 'backup.version');
  iso(backup.exportedAt, 'backup.exportedAt');
  const data = record(backup.data, 'backup.data');
  for (const name of tableNames) {
    const path = `backup.data.${name}`;
    array(validators[name])(data[name], path);
    const keys = new Set<unknown>();
    (data[name] as RecordValue[]).forEach((r, index) => {
      const key = r[name === 'notes' ? 'date' : 'id'];
      if (keys.has(key)) fail(`${path}[${index}]`, 'a unique primary key');
      keys.add(key);
    });
  }
  // Spread-based updates preserve unknown undefined object fields. Keep them
  // in raw snapshots; JSON files naturally omit them. Arrays cannot use this
  // exception, since JSON would replace an undefined element with null.
  const ancestors = new Set<object>();
  const json = (value: unknown, path: string, objectField = false): void => {
    if (value === undefined && objectField) return;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { number()(value, path); return; }
    if (typeof value !== 'object' || value === null) fail(path, 'a JSON value');
    const object = value as object;
    if (ancestors.has(object)) fail(path, 'an acyclic JSON value');
    ancestors.add(object);
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).some(key => key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) fail(path, 'an array without extra fields');
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor)) return fail(`${path}[${index}]`, 'an enumerable array element');
        json(descriptor.value, `${path}[${index}]`);
      }
    } else {
      const r = record(value, path);
      if (Object.getOwnPropertySymbols(r).length) fail(path, 'string-keyed JSON fields');
      for (const key of Object.getOwnPropertyNames(r)) {
        const descriptor = Object.getOwnPropertyDescriptor(r, key)!;
        if (!descriptor.enumerable || !('value' in descriptor)) fail(`${path}.${key}`, 'an enumerable data field');
        json(descriptor.value, `${path}.${key}`, true);
      }
    }
    ancestors.delete(object);
  };
  json(backup, 'backup');
  return backup as PlannerBackup;
}

/** Validate current and supported legacy records without normalizing fields. */
export function parsePlannerBackup(text: string): PlannerBackup {
  return validateBackup(JSON.parse(text));
}

/** Snapshot every table within one readonly IndexedDB transaction. */
export async function exportPlannerBackup(): Promise<PlannerBackup> {
  return database.transaction('r', tableNames.map(name => database[name]), async () => {
    const records = await Promise.all(tableNames.map(name => database[name].toArray()));
    const data = Object.fromEntries(tableNames.map((name, index) => [name, records[index]]));
    return structuredClone(validateBackup({ format: 'rooz-planner-backup', version: 1, exportedAt: new Date().toISOString(), data }));
  });
}

/** Replace all data atomically; rejection (including bulkAdd failure) aborts. */
export async function importPlannerBackup(backup: PlannerBackup): Promise<void> {
  // Detach before the first await so caller mutation cannot bypass validation.
  const snapshot = structuredClone(validateBackup(backup));
  await database.transaction('rw', tableNames.map(name => database[name]), async () => {
    for (const name of tableNames) await database[name].clear();
    await database.tasks.bulkAdd(snapshot.data.tasks);
    await database.schedule.bulkAdd(snapshot.data.schedule);
    await database.goals.bulkAdd(snapshot.data.goals);
    await database.shortTasks.bulkAdd(snapshot.data.shortTasks);
    await database.notes.bulkAdd(snapshot.data.notes);
    // The database's domain type describes normalized preferences, but its raw
    // persisted rows can legitimately predate that shape. Do not migrate here.
    await database.preferences.bulkAdd(snapshot.data.preferences as { id: string; value: Preferences }[]);
  });
}
