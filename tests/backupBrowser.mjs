// Optional real-browser regression: node tests/backupBrowser.mjs (Windows Edge, Node 22+).
// Not part of *.test.mjs. Uses existing Vite/CDP and a disposable profile only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable || typeof WebSocket === 'undefined') throw new Error('This optional check requires Windows Edge and Node 22+ with WebSocket.');
const tables = ['tasks', 'schedule', 'goals', 'shortTasks', 'notes', 'preferences'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'rooz-backup-check-'));
let server, browser, socket, command, failures = 0, passes = 0;
const pending = new Map(), errors = [];
// The outer watchdog still enters finally, rather than leaving an Edge profile behind.
const deadline = Date.now() + 150000;
async function until(action, description, timeout = 15000) {
  const end = Math.min(Date.now() + timeout, deadline);
  while (Date.now() < end) { const result = await action(); if (result) return result; await delay(50); }
  throw new Error(`Timed out: ${description}`);
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function check(name, action) {
  try { await action(); passes++; console.log(`PASS: ${name}`); }
  catch (error) { failures++; console.error(`FAIL: ${name}\n${error.stack ?? error}`); }
}
const canonical = data => Object.fromEntries(tables.map(name => [name, [...data[name]].sort((a, b) => String(a[name === 'notes' ? 'date' : 'id']).localeCompare(String(b[name === 'notes' ? 'date' : 'id'])))]));
const sameRecords = (actual, expected) => assert.deepEqual(canonical(actual), canonical(expected), 'Every field of every row in all six tables must survive');
const emptyData = () => Object.fromEntries(tables.map(name => [name, []]));

function makeFixture(createCustomTheme, date, prefix, calendar, mode) {
  const timestamp = '2026-10-08T12:34:56.000Z';
  const base = { title: `${prefix} برنامه`, createdAt: timestamp, updatedAt: timestamp };
  const custom = createCustomTheme(`${prefix}-theme`, `${prefix} تم شخصی`, 'hacker');
  custom.linkModes = false;
  custom.modes.dark.background = { kind: 'gradient', color: '#123456', endColor: '#abcdef', angle: 270, future: 'background metadata' };
  custom.modes.dark.accent = '#fedcba';
  custom.modes.dark.effect = 'liquid-glass';
  custom.future = { nested: [null, 1, false, 'preserved'] };
  const id = name => `${prefix}-${name}`;
  return {
    format: 'rooz-planner-backup', version: 1, exportedAt: timestamp,
    data: {
      tasks: [
        { ...base, id: id('timed'), date, kind: 'timed', startTime: '09:00', endTime: '10:00', description: 'Details\nجزئیات', status: 'open', color: '#123456', extra: { keep: [true, null, 2] } },
        { ...base, id: id('todo'), title: `${prefix} TODO restored`, date, kind: 'todo', status: 'done', color: 'rebeccapurple' }
      ],
      schedule: [{ ...base, id: id('schedule'), date, startTime: '23:00', endTime: '07:00', color: '#123456', extra: 'overnight' }],
      goals: [
        { ...base, id: id('long'), kind: 'long-term', deadlineDate: '2027-12-31', note: 'Long term', extra: 1 },
        { ...base, id: id('mid'), kind: 'mid-term', relatedLongTermGoals: [{ goalId: id('long'), coefficient: 5, extra: 'relation' }],
          category: 'education', customCategory: '', why: 'why', importance: 10, deadlineChoice: 'yes', deadlineDate: '2027-01-01',
          dateReason: '', deadlineType: 'self-imposed', realism: 'probably', doneCriteria: 'done', milestones: ['First', 'Second'], keyMilestone: 1,
          firstAction: 'start', weeklyHours: 3.5, tradeoffs: '', difficulty: 1, obstacles: ['Time'], controllableObstacle: 0, motivationPlan: '',
          priorityChoice: 'unsure', competingGoals: '', adaptPlan: '', progressMeasures: '', reviewFrequency: 'other', reviewFrequencyOther: 'Daily',
          progressOneMonth: '', progressThreeMonths: '', progressHalfway: '', checkWant: 'yes', checkEffort: 'unsure', checkSpecific: 'yes',
          checkTimeframe: 'not-needed', checkInfluence: 'partly', checkFirstStep: 'no', finalWant: '', finalBecause: '', finalBy: '',
          finalSuccess: '', finalFirstStep: '', finalReviewDate: date, extra: { keep: ['goal'] } }
      ],
      shortTasks: [
        { ...base, id: id('job'), kind: 'short-term', mode: 'job', color: '#123456', priority: 10, relatedMidTermGoals: [{ goalId: id('mid'), coefficient: 2 }], triggerDate: date, triggerTime: '12:00', completed: true, completedDates: [], extra: 'job' },
        { ...base, id: id('routine'), kind: 'short-term', mode: 'routine', color: '#abcdef', priority: 5, relatedMidTermGoals: [], completed: false, completedDates: [date],
          routine: { pattern: 'selected', weekdays: [0, 4, 6], startDate: date, endDate: '2026-12-31', isTimed: true, startTime: '23:00', endTime: '07:00', extra: { keep: true } } },
        { ...base, id: id('untimed'), kind: 'short-term', mode: 'routine', color: '#abcdef', priority: 1, relatedMidTermGoals: [{ goalId: 'dangling-mid', coefficient: 1 }], completed: false, completedDates: [], routine: { pattern: 'daily', weekdays: [], startDate: date, isTimed: false } }
      ],
      notes: [
        { date, content: `${prefix} یادداشت\nsecond line`, updatedAt: timestamp, id: 'not-the-primary-key', extra: ['note'] },
        { date: '2025-01-02', content: 'A different day', updatedAt: timestamp, extra: { historic: true } }
      ],
      preferences: [
        { id: 'app', value: { calendar, theme: { activeThemeId: custom.id, mode, customThemes: [custom], extra: 'theme' }, extra: 'preferences' }, extra: 'row' },
        { id: 'legacy', value: { calendar: 'gregorian' }, extra: { legacy: true } }
      ]
    }
  };
}

try {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  await server.listen();
  browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  browser.on('error', error => errors.push(`Edge spawn: ${error.message}`));
  const port = await until(async () => { try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; } }, 'Edge debugging endpoint');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
  });
  let id = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(`${request.method}: ${JSON.stringify(message.error)}`)); else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(next, { resolve, reject, timeout, method }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  await command('Runtime.enable');
  await command('Page.enable');
  // Capture the real download Blob/anchor while preventing files outside the disposable profile.
  await command('Browser.setDownloadBehavior', { behavior: 'deny' });
  await command('Page.navigate', { url: server.resolvedUrls.local[0] });
  async function ready() {
    await until(() => evaluate("!!document.querySelector('.app-shell[aria-busy=false]') && !!document.querySelector('.note-section textarea:not(:disabled)')"), 'app ready');
    assert.equal(await evaluate("!!document.querySelector('.load-error')"), false, 'No storage loading error');
  }
  async function modules() {
    await evaluate(`(async () => {
      const { database } = await import('/src/storage/localDatabase.ts');
      const backup = await import('/src/storage/plannerBackup.ts');
      const themes = await import('/src/features/themes/registry.ts');
      const tables = ${JSON.stringify(tables)};
      window.backupCheck = { database, backup, themes, tables };
      window.backupCheck.raw = () => database.transaction('r', tables.map(name => database[name]), async () => Object.fromEntries(await Promise.all(tables.map(async name => [name, await database[name].toArray()]))));
    })()`);
  }
  async function raw() { return evaluate('window.backupCheck.raw()'); }
  async function exported() { return evaluate('window.backupCheck.backup.exportPlannerBackup()'); }
  async function seed(data) {
    await evaluate(`(async () => { const { database, tables } = window.backupCheck;
      await database.transaction('rw', tables.map(name => database[name]), async () => {
        for (const name of tables) { await database[name].clear(); await database[name].bulkAdd(${JSON.stringify(data)}[name]); }
      }); })()`);
  }
  async function reload() {
    await evaluate('window.backupReloadMarker = true');
    await command('Page.reload', { ignoreCache: true });
    await until(async () => {
      try { return await evaluate("typeof window.backupReloadMarker === 'undefined' && document.readyState === 'complete'"); }
      catch (error) {
        if (/context.*(destroyed|find)|Cannot find context/i.test(error.message)) return false;
        throw error;
      }
    }, 'new document after reload');
    await ready(); await modules();
  }
  async function settings() {
    if (!await evaluate("!!document.querySelector('.settings-dialog')")) await evaluate("document.querySelector('.settings-button').click()");
    await until(() => evaluate("!!document.querySelector('.settings-dialog') && document.querySelector('.settings-dialog').getAttribute('aria-busy') === 'false'"), 'settings ready');
  }
  async function closeSettings() {
    await evaluate("document.querySelector('.settings-header .icon-button').click()");
    await until(() => evaluate("!document.querySelector('.settings-dialog')"), 'settings closed');
  }
  async function clickText(text) {
    await evaluate(`(() => { const button = [...document.querySelectorAll('.settings-dialog button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Missing/enabled backup control'); button.click(); })()`);
  }
  async function selectFile(text, name = 'backup.json') {
    await settings();
    // Exercise the restore control without opening the OS picker; selection uses real FileList.
    await evaluate(`(() => {
      const input = document.querySelector('.settings-dialog input[type=file]');
      if (!input.hidden || !input.accept.includes('json')) throw new Error('Expected hidden JSON file input');
      const original = input.click; let clicked = false;
      input.click = () => { clicked = true; };
      try { [...document.querySelectorAll('.settings-dialog button')].find(button => button.textContent.trim() === 'بازیابی از فایل').click(); }
      finally { input.click = original; }
      if (!clicked) throw new Error('Restore control did not activate file input');
      const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: 'application/json' }));
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await until(() => evaluate("document.querySelector('.settings-dialog')?.getAttribute('aria-busy') === 'false' && (!!document.querySelector('.theme-confirm-dialog') || !!document.querySelector('.theme-error'))"), 'file validation');
    assert.equal(await evaluate("document.querySelector('input[type=file]').value"), '', 'File input resets for selecting the same file again');
  }
  async function restore(backup) {
    await selectFile(JSON.stringify(backup));
    assert.equal(await evaluate("!!document.querySelector('.theme-confirm-dialog')"), true, 'Valid file requests confirmation');
    await evaluate("document.querySelector('.theme-confirm-dialog .theme-danger').click()");
    await until(() => evaluate("!document.querySelector('.settings-dialog') && !document.querySelector('.theme-confirm-dialog')"), 'restore closes dialogs');
    await ready();
  }
  async function captureDownload() {
    await settings();
    await evaluate(`(() => {
      window.backupDownloads = [];
      const originalURL = URL.createObjectURL, originalClick = HTMLAnchorElement.prototype.click;
      const blobs = new Map();
      URL.createObjectURL = function(blob) { const url = originalURL.call(this, blob); blobs.set(url, blob); return url; };
      HTMLAnchorElement.prototype.click = function() {
        const blob = blobs.get(this.href);
        if (blob && this.download) window.backupDownloads.push({ name: this.download, type: blob.type, text: blob.text() });
        return originalClick.call(this);
      };
      window.stopBackupCapture = () => { URL.createObjectURL = originalURL; HTMLAnchorElement.prototype.click = originalClick; };
    })()`);
    try {
      await clickText('دریافت فایل پشتیبان');
      await until(() => evaluate('window.backupDownloads.length === 1'), 'actual download anchor and Blob');
      await until(() => evaluate("document.querySelector('.settings-dialog').getAttribute('aria-busy') === 'false'"), 'export finished');
      const download = await evaluate('(async () => { const file = window.backupDownloads[0]; return { ...file, text: await file.text }; })()');
      assert.equal(download.type, 'application/json');
      assert.match(download.name, /^rooz-backup-.*\.json$/);
      return JSON.parse(download.text);
    } finally { await evaluate('window.stopBackupCapture()'); }
  }
  async function appearance(backup) {
    const prefs = backup.data.preferences.find(row => row.id === 'app')?.value;
    const expected = prefs?.theme ?? await evaluate('window.backupCheck.themes.defaultThemePreferences');
    await until(() => evaluate(`document.documentElement.dataset.roozTheme === ${JSON.stringify(expected.activeThemeId)} && document.documentElement.dataset.themeMode === ${JSON.stringify(expected.mode)}`), 'restored theme immediately applied');
    assert.equal(await evaluate("document.querySelector('.topbar .calendar-switch').getAttribute('aria-checked')"), String((prefs?.calendar ?? 'persian') === 'persian'));
    if (prefs?.theme) {
      const custom = expected.customThemes[0];
      assert.equal(await evaluate("document.documentElement.dataset.themeParent"), custom.parentId);
      assert.equal(await evaluate("document.documentElement.style.getPropertyValue('--theme-accent')"), custom.modes[expected.mode].accent);
      assert.equal(await evaluate("document.documentElement.dataset.themeEffect"), custom.modes[expected.mode].effect);
    }
    assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), backup.data.notes.find(row => row.date === date)?.content ?? '');
  }

  await ready(); await modules();
  const date = await evaluate("import('/src/features/calendar/calendar.ts').then(module => module.todayKey())");
  const original = await evaluate(`(${makeFixture.toString()})(window.backupCheck.themes.createCustomTheme, ${JSON.stringify(date)}, 'old', 'persian', 'light')`);
  const replacement = await evaluate(`(${makeFixture.toString()})(window.backupCheck.themes.createCustomTheme, ${JSON.stringify(date)}, 'new', 'gregorian', 'dark')`);
  let downloaded;
  await check('Real IndexedDB export preserves all six tables and complete nested records', async () => {
    await seed(original.data); await reload();
    sameRecords(await raw(), original.data);
    sameRecords((await exported()).data, original.data);
    await appearance(original);
  });
  await check('Settings export captures the actual JSON download and parses losslessly', async () => {
    downloaded = await captureDownload();
    sameRecords(downloaded.data, original.data);
    assert.equal(downloaded.format, 'rooz-planner-backup'); assert.equal(downloaded.version, 1);
    await evaluate(`window.backupCheck.backup.parsePlannerBackup(${JSON.stringify(JSON.stringify(downloaded))})`);
  });
  await check('Restore confirmation cancellation preserves every record and preference', async () => {
    const before = await raw();
    await selectFile(JSON.stringify(replacement));
    assert.equal(await evaluate("document.querySelector('.theme-confirm-dialog').getAttribute('role')"), 'alertdialog');
    await evaluate("document.querySelector('.theme-confirm-dialog .secondary').click()");
    await until(() => evaluate("!document.querySelector('.theme-confirm-dialog')"), 'cancel confirmation');
    sameRecords(await raw(), before); await appearance(original);
  });
  await check('Invalid JSON, versions, missing tables, duplicates and malformed nested records preserve data', async () => {
    const cases = [['syntax', '{'], ['version', JSON.stringify({ ...replacement, version: 99 })]];
    const missing = structuredClone(replacement); delete missing.data.notes; cases.push(['missing-table', JSON.stringify(missing)]);
    const duplicate = structuredClone(replacement); duplicate.data.tasks.push(duplicate.data.tasks[0]); cases.push(['duplicate-key', JSON.stringify(duplicate)]);
    const theme = structuredClone(replacement); theme.data.preferences[0].value.theme.customThemes[0].modes.dark.accent = 'invalid'; cases.push(['nested-theme', JSON.stringify(theme)]);
    const routine = structuredClone(replacement); routine.data.shortTasks[1].routine.weekdays = [7]; cases.push(['nested-routine', JSON.stringify(routine)]);
    const before = await raw();
    for (const [name, text] of cases) {
      await selectFile(text, `${name}.json`);
      assert.equal(await evaluate("!!document.querySelector('.theme-confirm-dialog')"), false, name);
      assert.match(await evaluate("document.querySelector('.theme-error').textContent"), /اطلاعات فعلی تغییر نکرده/);
      sameRecords(await raw(), before); await appearance(original);
    }
  });
  await check('Native final-table constraint failure atomically rolls back clears and prior inserts', async () => {
    const before = await raw();
    const result = await evaluate(`(async () => {
      const { database, backup, tables } = window.backupCheck;
      const native = await new Promise((resolve, reject) => { const request = indexedDB.open(database.name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      let observed, hooked = [];
      function hook(key, row) {
        hooked.push(key);
        if (key !== 'legacy') return;
        // A separate connection queues a read during the final write, not after import returns.
        observed = new Promise((resolve, reject) => {
          const tx = native.transaction(tables, 'readonly'), data = {};
          for (const name of tables) { const request = tx.objectStore(name).getAll(); request.onsuccess = () => { data[name] = request.result; }; }
          tx.oncomplete = () => resolve(data); tx.onabort = () => reject(tx.error);
        });
        // Existing inline keys ignore the hook's return value; mutate the submitted row.
                row.id = 'app'; // Collide with the first preferences row inside real IndexedDB.
      }
      database.preferences.hook('creating', hook);
      let error;
      try { await backup.importPlannerBackup(${JSON.stringify(replacement)}); }
      catch (failure) { error = String(failure); }
      finally { database.preferences.hook('creating').unsubscribe(hook); }
      try { return { error, hooked, observed: await observed }; } finally { native.close(); }
    })()`);
    assert.match(result.error ?? '', /ConstraintError/);
    assert.deepEqual(result.hooked, ['app', 'legacy'], 'Failure occurs in final table after the other five tables were inserted');
    sameRecords(result.observed, before); sameRecords(await raw(), before);
    sameRecords((await exported()).data, before);
  });
  await check('Confirmed UI restore replaces rather than merges, changes calendar/theme immediately and survives reload', async () => {
    await evaluate(`(async () => {
      const { database, tables } = window.backupCheck;
      const native = await new Promise((resolve, reject) => { const request = indexedDB.open(database.name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      let observed;
      function hook(key) {
        if (key !== 'legacy') return;
        observed = new Promise((resolve, reject) => {
          const tx = native.transaction(tables, 'readonly'), data = {};
          for (const name of tables) { const request = tx.objectStore(name).getAll(); request.onsuccess = () => { data[name] = request.result; }; }
          tx.oncomplete = () => resolve(data); tx.onabort = () => reject(tx.error);
        });
      }
      database.preferences.hook('creating', hook);
      window.finishBackupObserver = async () => {
        database.preferences.hook('creating').unsubscribe(hook);
        try { return await observed; } finally { native.close(); }
      };
    })()`);
    let observed;
    try { await restore(replacement); }
    finally { observed = await evaluate('window.finishBackupObserver()'); }
    sameRecords(observed, replacement.data);
    sameRecords(await raw(), replacement.data); await appearance(replacement);
    assert.ok(await evaluate("[...document.querySelectorAll('.todo-title')].some(node => node.textContent === 'new TODO restored')"), 'Restored tasks loaded in UI');
    await reload(); sameRecords(await raw(), replacement.data); await appearance(replacement);
  });
  await check('Captured download restores the original complete records through File/DataTransfer', async () => {
    assert.ok(downloaded, 'Export download was captured');
    await restore(downloaded); sameRecords(await raw(), original.data); await appearance(original);
    await reload(); sameRecords((await exported()).data, original.data); await appearance(original);
  });
  await check('Pending daily note entered with browser input is included in Settings export', async () => {
    const text = 'Pending browser note — یادداشت قبل از ذخیره';
    await settings(); await closeSettings();
    await evaluate("(() => { const input = document.querySelector('.note-section textarea'); input.focus(); input.select(); })()");
    await command('Input.insertText', { text });
    assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), text);
    assert.ok(await evaluate("!!document.querySelector('.save-indicator .saving')"), 'Note is still pending when opening Settings');
    const file = await captureDownload();
    assert.equal(file.data.notes.find(note => note.date === date)?.content, text);
    const current = await raw(); sameRecords(file.data, current);
    sameRecords({ ...current, notes: original.data.notes }, original.data);
  });
  await check('Empty backup clears every table, applies defaults, survives reload and downloads empty data', async () => {
    const empty = { format: 'rooz-planner-backup', version: 1, exportedAt: new Date().toISOString(), data: emptyData() };
    await restore(empty); sameRecords(await raw(), empty.data); await appearance(empty);
    assert.equal(await evaluate("document.querySelectorAll('.todo-row').length"), 0);
    await reload(); sameRecords(await raw(), empty.data); await appearance(empty);
    sameRecords((await captureDownload()).data, empty.data);
  });
  await check('No uncaught browser exceptions', async () => { assert.deepEqual(errors, []); });
} catch (error) {
  failures++; console.error(`FAIL: browser harness\n${error.stack ?? error}`);
} finally {
  if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} }
  socket?.close();
  for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error('CDP closing')); }
  pending.clear();
  if (browser && browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill(); await Promise.race([exited, delay(3000)]);
  }
  try { await server?.close(); } catch (error) { failures++; console.error(`FAIL: Vite cleanup: ${error.message}`); }
  try { await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  catch (error) { failures++; console.error(`FAIL: profile cleanup: ${error.message}`); }
}
console.log(`Edge backup regression: ${passes} passed, ${failures} failed.`);
if (failures) process.exitCode = 1;
