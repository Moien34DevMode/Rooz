// Optional production regression: node tests/pwaBrowser.mjs (Windows Edge, Node 22+).
// Run npm run build separately first. No dependencies, source imports, or user profiles.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const executable = [process.env.EDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const pending = new Map(), exceptions = [], responses = [], workerVersions = new Map(), serverRequests = [];
const deadline = Date.now() + 240000;
let profile, server, browser, socket, command, origin, offline = false, passes = 0, failures = 0;
// Changing the served bytes exercises a real update without rewriting production files.
const workerRevisions = new Map();

async function until(action, description, timeout = 20000) {
  const end = Math.min(Date.now() + timeout, deadline);
  while (Date.now() < end) {
    try { const result = await action(); if (result) return result; }
    catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Inspected target navigated/i.test(error.message)) throw error;
    }
    await delay(80);
  }
  throw new Error(`Timed out: ${description}`);
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`${JSON.stringify(result.exceptionDetails)}\nExpression: ${expression}`);
  return result.result.value;
}
async function check(name, action) {
  await action(); passes++; console.log(`PASS: ${name}`);
}
async function ready() {
  await until(() => evaluate("document.readyState === 'complete' && !!document.querySelector('.app-shell[aria-busy=false]') && !!document.querySelector('.note-section textarea:not(:disabled)')"), 'production daily planner ready');
  assert.equal(await evaluate("!!document.querySelector('.load-error')"), false, 'No IndexedDB loading error');
}
async function reload() {
  await evaluate('window.pwaReloadMarker = true');
  // HTTP cache is disabled separately; a hard reload deliberately bypasses SW control.
  await command('Page.reload');
  await until(() => evaluate("typeof window.pwaReloadMarker === 'undefined' && document.readyState === 'complete'"), 'new document after reload');
  await ready();
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) throw new Error('Missing/enabled control: ' + ${JSON.stringify(selector)});
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error('Invisible control: ' + ${JSON.stringify(selector)});
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
async function screenshot(name, selector) {
  await mkdir(join(dist, 'pwa-checks'), { recursive: true });
  const clip = selector && await evaluate(`(() => {
    const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
    if (!elements.length) throw new Error('Missing screenshot scope');
    elements[0].scrollIntoView({ block: 'start', behavior: 'instant' });
    const rects = elements.map(element => element.getBoundingClientRect());
    const x = Math.max(0, Math.min(...rects.map(rect => rect.left)));
    const y = Math.max(0, Math.min(...rects.map(rect => rect.top)));
    return { x: x + scrollX, y: y + scrollY,
      width: Math.min(innerWidth, Math.max(...rects.map(rect => rect.right))) - x,
      height: Math.min(innerHeight, Math.max(...rects.map(rect => rect.bottom))) - y, scale: 1 };
  })()`);
  const result = await command('Page.captureScreenshot', { format: 'png', ...(clip && { clip, captureBeyondViewport: true }) });
  await writeFile(join(dist, 'pwa-checks', `${name}.png`), Buffer.from(result.data, 'base64'));
}
async function network(isOffline) {
  offline = isOffline;
  await command('Network.setCacheDisabled', { cacheDisabled: true });
  await command('Network.emulateNetworkConditions', { offline: isOffline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.equal(await evaluate('navigator.onLine'), !isOffline);
}
async function allFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'pwa-checks') continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await allFiles(join(directory, entry.name), `${name}/`));
    else result.push(name);
  }
  return result.sort();
}
async function sentinelIntact() {
  assert.equal(await evaluate(`(async () => {
    const cache = await caches.open('unrelated-pwa-browser-sentinel');
    return (await cache.match(new URL('/unrelated-sentinel', location.origin)))?.text();
  })()`), 'preserve this unrelated cache');
}
async function noteInIndexedDB(text) {
  // Inspect native IndexedDB readonly, rather than importing dev-only modules or seeding fixtures.
  return evaluate(`(async () => {
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(info.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!database.objectStoreNames.contains('notes')) continue;
        const rows = await new Promise((resolve, reject) => {
          const request = database.transaction('notes', 'readonly').objectStore('notes').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (rows.some(row => row.content === ${JSON.stringify(text)})) return true;
      } finally { database.close(); }
    }
    return false;
  })()`);
}
async function layout(cardRequired = true) {
  const geometry = await evaluate(`(() => {
    const card = document.querySelector('.install-app');
    const rect = card?.getBoundingClientRect();
    const body = getComputedStyle(document.body);
    return { width: innerWidth, pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      overflowX: body.overflowX, overflowY: body.overflowY, background: body.backgroundColor,
      card: rect && { left: rect.left, right: rect.right, width: rect.width, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth } };
  })()`);
  assert.ok(geometry.pageWidth <= geometry.width + 1, `No horizontal overflow: ${JSON.stringify(geometry)}`);
  assert.ok(!['hidden', 'clip'].includes(geometry.overflowY), 'Closed dialogs must restore body scrolling');
  assert.ok(geometry.background !== 'rgba(0, 0, 0, 0)', 'Production CSS must style the body');
  if (cardRequired) {
    assert.ok(geometry.card?.width > 0, 'Install card is visible');
    assert.ok(geometry.card.left >= -1 && geometry.card.right <= geometry.width + 1, 'Install card fits the viewport');
    assert.ok(geometry.card.scrollWidth <= geometry.card.clientWidth + 1, 'Install card contents do not overflow');
  }
}

const banner = '[data-install-placement=recommendation]';
const settingsInstall = '.settings-dialog [data-install-placement=settings]';
async function resize(width) {
  // Resize the same Windows device: do not switch platform or mobile emulation.
  await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await until(() => evaluate(`innerWidth === ${width}`), `${width}px viewport`);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
async function installButton(rootSelector, mode) {
  await until(() => evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(rootSelector + ' .install-app-button')});
    return button && ${mode === 'native' ? "!button.disabled && button.textContent.trim() === 'نصب برنامه'" : "!button.disabled && button.textContent.trim() === 'راهنمای نصب'"};
  })()`), `${mode} install action in ${rootSelector}`);
}
async function openSettings() {
  await click('.settings-button');
  await until(() => evaluate("document.querySelector('.settings-dialog')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('.theme-choices')"), 'settings ready');
}
async function closeSettings() {
  await click('.settings-header .icon-button');
  await until(() => evaluate("!document.querySelector('.settings-dialog')"), 'settings closes');
}
async function installGeometry(rootSelector) {
  const geometry = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    if (!root) throw new Error('Missing install placement');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
    const style = element => { const s = getComputedStyle(element); return { marginTop: parseFloat(s.marginTop), marginBottom: parseFloat(s.marginBottom), paddingTop: parseFloat(s.paddingTop), paddingLeft: parseFloat(s.paddingLeft), paddingRight: parseFloat(s.paddingRight), borderLeft: parseFloat(s.borderLeftWidth), borderRight: parseFloat(s.borderRightWidth), radius: parseFloat(s.borderTopLeftRadius), shadow: s.boxShadow }; };
    const children = [...root.querySelectorAll('.install-app-actions, .install-app-actions button, .install-app-guide, .install-app-guide-heading, .install-app-guide li')].map(element => ({ rect: rect(element), scroll: element.scrollWidth, client: element.clientWidth }));
    const sections = root.parentElement.querySelectorAll(':scope > .theme-settings-section');
    const themes = [...sections].find(section => section.querySelector('.theme-choices'));
    const storage = root.parentElement.querySelector('.theme-storage-section');
    return { width: innerWidth, shellScrollLeft: document.querySelector('.app-shell').scrollLeft, pageScrollX: scrollX, root: rect(root), style: style(root), actions: !!root.querySelector('.install-app-actions'), children,
      nav: document.querySelector('.view-navigation') && rect(document.querySelector('.view-navigation')),
      settings: root.matches('.theme-settings-section'), nested: root.querySelectorAll('.install-app, .theme-settings-section').length,
      themes: themes && { rect: rect(themes), style: style(themes) }, storage: storage && { rect: rect(storage), style: style(storage) },
      scroll: document.querySelector('.settings-scroll') && { width: document.querySelector('.settings-scroll').scrollWidth, client: document.querySelector('.settings-scroll').clientWidth } };
  })()`);
  const details = JSON.stringify(geometry);
  assert.ok(geometry.actions, 'Install controls are grouped in .install-app-actions');
  assert.ok(geometry.root.left >= -1 && geometry.root.right <= geometry.width + 1, details);
  for (const child of geometry.children) {
    assert.ok(child.rect.left >= geometry.root.left - 1 && child.rect.right <= geometry.root.right + 1, `Install action/guide fits placement: ${details}`);
    assert.ok(child.scroll <= child.client + 1, `Install action/guide has no overflow: ${details}`);
  }
  if (rootSelector === banner) {
    assert.ok(geometry.root.top - geometry.nav.bottom >= 16 - 1, `Recommendation separated from navigation: ${details}`);
    assert.ok(geometry.style.marginTop >= 20, 'Recommendation has a 20px top margin');
    assert.ok(Math.abs(geometry.root.left - geometry.nav.left) <= 1 && Math.abs(geometry.root.right - geometry.nav.right) <= 1, `Banner/nav edges align: ${details}`);
    await layout();
  } else {
    assert.ok(geometry.settings, 'Settings install root is a sibling theme-settings-section');
    assert.equal(geometry.nested, 0, 'No nested install card/section boxes');
    assert.ok(geometry.themes && geometry.storage, 'Theme and storage sibling sections exist');
    for (const sibling of [geometry.themes, geometry.storage]) {
      assert.ok(Math.abs(geometry.root.left + geometry.style.paddingLeft + geometry.style.borderLeft - sibling.rect.left - sibling.style.paddingLeft - sibling.style.borderLeft) <= 1, `Section left content edges align: ${details}`);
      assert.ok(Math.abs(geometry.root.right - geometry.style.paddingRight - geometry.style.borderRight - sibling.rect.right + sibling.style.paddingRight + sibling.style.borderRight) <= 1, `Section right content edges align: ${details}`);
      for (const key of ['paddingLeft', 'paddingRight', 'borderLeft', 'borderRight', 'radius', 'shadow']) assert.equal(geometry.style[key], sibling.style[key], `Install section uses sibling ${key}, not a boxed card`);
    }
    for (const key of ['marginTop', 'marginBottom', 'paddingTop']) assert.equal(geometry.style[key], geometry.storage.style[key], `Install section uses storage sibling ${key}`);
    assert.ok(geometry.root.top - geometry.themes.rect.bottom >= 16 - 1, `Gap after themes: ${details}`);
    assert.ok(geometry.storage.rect.top - geometry.root.bottom >= 16 - 1, `Gap before storage: ${details}`);
    assert.ok(geometry.scroll.width <= geometry.scroll.client + 1, 'Settings content has no horizontal overflow');
  }
}

// Fire at the first application listener registration, before React mounts. This catches
// losing beforeinstallprompt between main's bootstrap and the lazy install component.
const installProbe = `(() => {
  const original = window.addEventListener;
  window.pwaProbe = { calls: 0, dispatched: 0, outcome: 'dismissed', early: false, injected: false };
  window.pwaDispatchInstall = outcome => {
    window.pwaProbe.dispatched++;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    let resolveChoice, consumed = false;
    Object.defineProperties(event, {
      platforms: { value: ['web'] },
      userChoice: { value: new Promise(resolve => { resolveChoice = resolve; }) },
      prompt: { value: async () => {
        if (consumed) throw new Error('Synthetic deferred prompt invoked twice');
        consumed = true;
        window.pwaProbe.calls++;
        resolveChoice({ outcome, platform: 'web' });
        return { outcome, platform: 'web' };
      } }
    });
    window.dispatchEvent(event);
    window.pwaProbe.prevented = event.defaultPrevented;
  };
  // Real headless installability events are observed but cannot overwrite this deterministic probe.
  original.call(window, 'beforeinstallprompt', event => {
    if (event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); }
  });
  window.addEventListener = function(type, listener, options) {
    original.call(this, type, listener, options);
    if (this === window && type === 'beforeinstallprompt' && !window.pwaProbe.injected && window.pwaAutoInject !== false) {
      window.pwaProbe.injected = true;
      window.pwaProbe.early = !document.querySelector('.app-shell');
      window.pwaDispatchInstall('dismissed');
    }
  };
})()`;

try {
  assert.ok(executable && typeof WebSocket !== 'undefined', 'Requires Windows Edge (or EDGE_PATH) and Node 22+ with WebSocket');
  const files = await allFiles(dist).catch(error => { throw new Error(`Production dist is required; have the parent run npm run build first. ${error.message}`); });
  for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) assert.ok(files.includes(file), `Build is missing ${file}; run npm run build first`);
  const requiredFiles = files.filter(file => file === 'index.html' || file.endsWith('.webmanifest') || /\.(js|css|png)$/.test(file) && file !== 'sw.js');
  assert.ok(requiredFiles.filter(file => file.endsWith('.js')).length > 1, 'Production build includes lazy JavaScript chunks');
  assert.ok(requiredFiles.some(file => file.endsWith('.css')), 'Production build includes CSS');
  profile = await mkdtemp(join(tmpdir(), 'rooz-pwa-check-'));
  server = createServer(async (request, response) => {
    // CDP offline can be target-specific: also deny every server request, including SW fetches.
    if (offline) { request.socket.destroy(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      serverRequests.push(pathname);
      const prefix = pathname.startsWith('/Rooz/') ? '/Rooz/' : '/';
      const relative = pathname.slice(prefix.length) || 'index.html';
      const path = resolve(dist, relative);
      if (path !== dist && !path.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
      let bytes = await readFile(path);
      if (relative === 'sw.js' && workerRevisions.has(prefix)) bytes = Buffer.concat([bytes, Buffer.from(`\n// Browser update probe ${workerRevisions.get(prefix)}\n`)]);
      // Deliberately no Service-Worker-Allowed header: each worker's natural directory scope must work.
      response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch (error) { response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500).end(); }
  });
  server.requestTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let spawnError;
  browser.on('error', error => { spawnError = error; });
  const port = await until(async () => {
    if (spawnError) throw spawnError;
    // Windows Edge may hand off to its browser process and exit successfully.
    if (browser.exitCode !== null && browser.exitCode !== 0) throw new Error(`Edge exited early: ${browser.exitCode}`);
    try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; }
  }, 'Edge debugging endpoint');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })).json();
  const target = targets.find(item => item.type === 'page');
  assert.ok(target, 'Edge exposes a page CDP target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
  });
  let id = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(`${request.method}: ${JSON.stringify(message.error)}`)); else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') console.log('Browser warning:', message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    if (message.method === 'Network.responseReceived') responses.push(message.params.response);
    if (message.method === 'ServiceWorker.workerVersionUpdated') {
      for (const version of message.params.versions) workerVersions.set(version.versionId, version);
    }
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error('CDP is closed')); return; }
    const next = ++id;
    const timeout = Math.max(1, Math.min(15000, deadline - Date.now()));
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
    pending.set(next, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('ServiceWorker.enable');
  await command('Browser.setDownloadBehavior', { behavior: 'deny' });
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const desktopUA = (await command('Browser.getVersion')).userAgent;
  const probe = await command('Page.addScriptToEvaluateOnNewDocument', { source: installProbe });

  for (const prefix of ['/', '/Rooz/']) {
    const scope = origin + prefix;
    const label = prefix === '/' ? 'root' : 'subpath';
    await network(false);
    await command('Page.navigate', { url: scope });
    await ready();
    await check(`${prefix} real manifest, resolved scopes and PNG icons`, async () => {
      const linked = await evaluate("document.querySelector('link[rel=manifest]')?.href");
      assert.equal(linked, scope + 'manifest.webmanifest');
      let result;
      try { result = await command('Page.getAppManifest'); }
      catch (error) {
        if (!/-32601|wasn't found|not supported/i.test(error.message)) throw error;
        console.log('INFO: Page.getAppManifest unavailable; checking the linked production manifest via fetch');
      }
      let manifest;
      if (result) {
        assert.equal(result.url, linked);
        assert.deepEqual(result.errors ?? [], [], 'Browser manifest parser reports no errors');
        assert.ok(result.data, 'Browser retrieved manifest data');
        manifest = JSON.parse(result.data);
        if (result.parsed?.scope) assert.equal(result.parsed.scope, scope);
      } else manifest = await evaluate(`fetch(${JSON.stringify(linked)}).then(response => { if (!response.ok) throw new Error('Manifest fetch failed'); return response.json(); })`);
      for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field], linked).href, scope, `Relative ${field}`);
      assert.equal(manifest.display, 'standalone');
      assert.equal(manifest.lang, 'fa'); assert.equal(manifest.dir, 'rtl');
      assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
      for (const icon of manifest.icons) {
        const url = new URL(icon.src, linked).href;
        assert.ok(url.startsWith(scope + 'icons/'), 'Icon resolves under this deployment prefix');
        const image = await evaluate(`(async () => {
          const response = await fetch(${JSON.stringify(url)}, { cache: 'no-store' });
          const bytes = new Uint8Array(await response.arrayBuffer());
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const result = { status: response.status, type: response.headers.get('content-type'), signature: [...bytes.slice(0, 8)], size: bitmap.width + 'x' + bitmap.height };
          bitmap.close(); return result;
        })()`);
        assert.equal(image.status, 200); assert.equal(image.type, 'image/png');
        assert.deepEqual(image.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(image.size, icon.sizes);
      }
    });
    await check(`${prefix} early install event is captured; dismissed prompt is consumed once`, async () => {
      const state = await evaluate('window.pwaProbe');
      assert.equal(state.injected, true, 'Application registers beforeinstallprompt');
      assert.equal(state.early, true, 'Listener captures the event before the app mounts');
      assert.equal(state.prevented, true, 'Native automatic prompt is prevented');
      await installButton(banner, 'native');
      await click('.install-app-button');
      await until(() => evaluate('window.pwaProbe.calls === 1'), 'dismissed native prompt invoked');
      await installButton(banner, 'manual');
      await click('.install-app-button');
      await until(() => evaluate("!!document.querySelector('.install-app-guide') && document.querySelector('.install-app-guide').getClientRects().length > 0"), 'manual guide after consumed prompt');
      assert.equal(await evaluate('window.pwaProbe.calls'), 1, 'Consumed prompt is not invoked twice');
      await screenshot(`${label}-dismissed-guide`);
      // A reload closes any guide and re-establishes an independent synthetic event.
      await reload();
    });
    await check(`${prefix} Windows deferred prompt survives desktop/phone resizes and works from banner and settings`, async () => {
      const initial = await evaluate('({ calls: window.pwaProbe.calls, dispatched: window.pwaProbe.dispatched })');
      assert.equal(initial.calls, 0, 'Reload supplies one unconsumed early prompt');
      // Required desktop -> 320 -> 1440 -> 390 -> desktop sequence, then tablet coverage.
      // One retained event throughout, without dispatching a replacement.
      for (const width of [1280, 320, 1440, 390, 1280, 768, 1280]) {
        await resize(width);
        await installButton(banner, 'native');
        await click(banner + ' .install-app-help');
        await until(() => evaluate(`!!document.querySelector('${banner} .install-app-guide')`), 'banner help opens without consuming prompt');
        await installGeometry(banner);
        if (width === 1280 || width === 390) await screenshot(`${label}-${width}-main-install`, '.view-navigation, ' + banner);
        await click(banner + ' .install-app-dismiss');
        await openSettings();
        await installButton(settingsInstall, 'native');
        await click(settingsInstall + ' .install-app-help');
        await until(() => evaluate(`!!document.querySelector('${settingsInstall} .install-app-guide')`), 'settings help opens without consuming prompt');
        await installGeometry(settingsInstall);
        if (width === 1280 || width === 390) await screenshot(`${label}-${width}-settings-install`, settingsInstall);
        await click(settingsInstall + ' .install-app-dismiss');
        await closeSettings();
        assert.deepEqual(await evaluate('({ calls: window.pwaProbe.calls, dispatched: window.pwaProbe.dispatched })'), initial, 'Resize/help never consumes or replaces deferred event');
      }
      await click(banner + ' .install-app-button');
      await until(() => evaluate('window.pwaProbe.calls === 1'), 'desktop banner invokes native prompt exactly once');
      await installButton(banner, 'manual');
      // A consumed event cannot be reused: only now supply the next native event.
      await evaluate("window.pwaDispatchInstall('dismissed')");
      await resize(390);
      await openSettings();
      await installButton(settingsInstall, 'native');
      await click(settingsInstall + ' .install-app-button');
      await until(() => evaluate('window.pwaProbe.calls === 2'), 'phone-width settings invokes fresh native prompt exactly once');
      await installButton(settingsInstall, 'manual');
      await click(settingsInstall + ' .install-app-button');
      await until(() => evaluate(`!!document.querySelector('${settingsInstall} .install-app-guide')`), 'consumed settings prompt falls back to guide');
      assert.equal(await evaluate('window.pwaProbe.calls'), 2, 'Manual fallback never reuses either consumed event');
      assert.equal(await evaluate('window.pwaProbe.dispatched'), initial.dispatched + 1, 'Exactly one fresh event per consumed invocation');
      await closeSettings();
      await resize(1280);
      await reload();
    });
    await check(`${prefix} production SW activates with all app shell and lazy assets cached`, async () => {
      await until(() => evaluate(`navigator.serviceWorker.getRegistration(${JSON.stringify(scope)}).then(registration => registration?.scope === ${JSON.stringify(scope)} && registration.active?.state === 'activated')`), 'actual dist/sw.js active', 30000);
      await reload();
      await until(() => evaluate(`navigator.serviceWorker.controller?.scriptURL === ${JSON.stringify(scope + 'sw.js')}`), 'reload obtains the scope-specific controller');
      const registration = await evaluate(`navigator.serviceWorker.ready.then(registration => ({ scope: registration.scope, script: registration.active.scriptURL }))`);
      assert.deepEqual(registration, { scope, script: scope + 'sw.js' });
      const cached = await evaluate(`(async () => {
        const names = (await caches.keys()).filter(name => name.startsWith('rooz-shell:' + encodeURIComponent(${JSON.stringify(scope)}) + ':'));
        return Promise.all(names.map(async name => ({ name, entries: await Promise.all((await (await caches.open(name)).keys()).map(async request => {
          const response = await (await caches.open(name)).match(request);
          return { url: request.url, status: response.status, type: response.headers.get('content-type') };
        })) })));
      })()`);
      assert.equal(cached.length, 1, 'Exactly one versioned shell for this scope');
      for (const file of requiredFiles) {
        const entry = cached[0].entries.find(item => item.url === scope + file);
        assert.ok(entry, `SW cache contains ${prefix}${file}`); assert.equal(entry.status, 200);
        assert.ok(entry.type?.startsWith(mime[extname(file)]?.split(';')[0]), `Correct cached MIME for ${file}`);
      }
      assert.ok(!cached[0].entries.some(item => item.url.includes('/pwa-checks/')), 'Screenshots are not in the SW precache');
      await evaluate(`(async () => { const cache = await caches.open('unrelated-pwa-browser-sentinel'); await cache.put(new URL('/unrelated-sentinel', location.origin), new Response('preserve this unrelated cache')); })()`);
    });
    const note = `PWA ${label} offline note ${Date.now()} — یادداشت ماندگار`;
    await check(`${prefix} UI note is saved in native IndexedDB`, async () => {
      await click('.note-section textarea');
      await evaluate("document.querySelector('.note-section textarea').select()");
      await command('Input.insertText', { text: note });
      assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), note);
      await evaluate("document.querySelector('.note-section textarea').blur()");
      await until(() => evaluate("document.querySelector('.save-indicator')?.textContent.includes('ذخیره شد')"), 'note save completes');
      assert.equal(await noteInIndexedDB(note), true, 'Actual typed note exists in IndexedDB');
    });
    await check(`${prefix} full cold reload and previously unopened lazy views work offline`, async () => {
      responses.length = 0;
      await network(true);
      await reload();
      assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), note, 'Saved note survives offline reload');
      assert.ok(responses.some(response => response.url === scope && response.fromServiceWorker), 'Navigation HTML came from the real SW');
      assert.ok(responses.some(response => /\.js$/.test(response.url) && response.fromServiceWorker), 'Production JavaScript came from SW with HTTP cache disabled');
      assert.ok(responses.some(response => /\.css$/.test(response.url) && response.fromServiceWorker), 'Production CSS came from SW');
      await click('.view-tabs button:nth-child(3)');
      await until(() => evaluate("!!document.querySelector('.cv-month-grid')"), 'monthly lazy view renders offline');
      await screenshot(`${label}-offline-monthly`);
      await click('.view-tabs button:first-child'); await ready();
      await click('.all-tasks-button');
      await until(() => evaluate("!!document.querySelector('.task-manager .manager-search input')"), 'tasks manager renders offline');
      await click('.manager-header .icon-button');
      await until(() => evaluate("!document.querySelector('.task-manager')"), 'tasks dialog closes');
      await click('.settings-button');
      await until(() => evaluate("document.querySelector('.settings-dialog')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('.theme-choices')"), 'settings lazy chunk renders offline');
      await screenshot(`${label}-offline-settings`);
      await click('.settings-header .icon-button');
      await until(() => evaluate("!document.querySelector('.settings-dialog')"), 'settings closes');
      await layout(); await sentinelIntact();
      assert.equal(await noteInIndexedDB(note), true);
      // Each uncached lazy import must also be served by SW, never a successful network response.
      const appResponses = responses.filter(response => response.url.startsWith(scope) && /\.(js|css)$/.test(new URL(response.url).pathname));
      assert.ok(appResponses.length > 1);
      assert.ok(appResponses.every(response => response.fromServiceWorker), 'Every offline app JS/CSS response comes from SW');
      await reload();
      assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), note);
    });
    await check(`${prefix} accepted synthetic prompt and appinstalled hide the card`, async () => {
      await evaluate("window.pwaDispatchInstall('accepted')");
      const before = await evaluate('window.pwaProbe.calls');
      await installButton(banner, 'native');
      await click('.install-app-button');
      await until(() => evaluate(`window.pwaProbe.calls === ${before + 1}`), 'accepted prompt invoked');
      await evaluate("window.dispatchEvent(new Event('appinstalled'))");
      await until(() => evaluate("!document.querySelector('.install-app') || document.querySelector('.install-app').getClientRects().length === 0"), 'appinstalled hides install card');
    });
    await network(false);
    await check(`${prefix} real SW update waits, activates safely, and preserves user data and other caches`, async () => {
      await reload();
      workerRevisions.set(prefix, Date.now());
      const activeBefore = await evaluate(`(async () => {
        const registration = await navigator.serviceWorker.getRegistration(${JSON.stringify(scope)});
        window.pwaPreviousWorker = registration.active;
        await registration.update();
        return registration.active?.state;
      })()`);
      assert.equal(activeBefore, 'activated');
      await until(() => evaluate(`navigator.serviceWorker.getRegistration(${JSON.stringify(scope)}).then(registration => registration.waiting?.state === 'installed')`), 'updated worker waits for open planner', 30000);
      assert.equal(await evaluate(`navigator.serviceWorker.getRegistration(${JSON.stringify(scope)}).then(registration => registration.active === window.pwaPreviousWorker && navigator.serviceWorker.controller === window.pwaPreviousWorker)`), true, 'No skipWaiting or forced takeover of the open planner');
      assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), note);
      await sentinelIntact();
      const waitingVersion = await until(() => [...workerVersions.values()].find(version => version.scriptURL === scope + 'sw.js' && version.status === 'installed'), 'CDP observes the waiting update');
      // Leaving the only app client allows normal browser-managed activation; never unregister.
      await command('Page.navigate', { url: 'about:blank' });
      await until(() => evaluate("location.href === 'about:blank' && document.readyState === 'complete'"), 'old app client leaves');
      await until(() => workerVersions.get(waitingVersion.versionId)?.status === 'activated', 'CDP observes update activation with no app clients', 30000);
      await command('Page.navigate', { url: scope }); await ready();
      await until(() => evaluate(`navigator.serviceWorker.getRegistration(${JSON.stringify(scope)}).then(registration => registration.active?.state === 'activated' && !registration.waiting && !registration.installing)`), 'updated SW activates normally', 30000);
      await reload();
      await sentinelIntact();
      assert.equal(await noteInIndexedDB(note), true, 'SW activation does not wipe IndexedDB');
      assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), note);
      if (prefix === '/Rooz/') assert.equal(await evaluate(`caches.keys().then(names => names.some(name => name.startsWith('rooz-shell:' + encodeURIComponent(${JSON.stringify(origin + '/')}) + ':')))`), true, 'Subpath activation leaves the root deployment cache intact');
      await network(true); await reload();
      assert.equal(await evaluate("document.querySelector('.note-section textarea').value"), note, 'Updated worker still supports offline reload');
      await network(false);
    });
  }

  await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: probe.identifier });
  const absentProbe = await command('Page.addScriptToEvaluateOnNewDocument', { source: 'window.pwaAutoInject = false;\n' + installProbe });
  await check('Windows without an install event uses honest pending/manual labels; a late event enables native install', async () => {
    await resize(1440);
    await reload();
    const assertHonestButton = async selector => {
      const button = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector + ' .install-app-button')});
        return button && { disabled: button.disabled, text: button.textContent.trim(), help: !!document.querySelector(${JSON.stringify(selector + ' .install-app-help')}) };
      })()`);
      assert.ok(button, 'Install action exists without a native event');
      if (button.disabled) {
        assert.equal(button.text, 'در حال آماده‌سازی…', 'Pending button does not falsely advertise native readiness');
        assert.ok(button.help, 'Pending readiness retains a separate manual-help action');
      } else assert.equal(button.text, 'راهنمای نصب', 'Absent native event is explicitly a manual guide');
    };
    await assertHonestButton(banner);
    await installButton(banner, 'manual');
    assert.equal(await evaluate('window.pwaProbe.dispatched'), 0, 'No synthetic event supplied yet');
    for (const width of [320, 390, 768, 1440]) {
      await resize(width);
      await assertHonestButton(banner);
      await click(banner + ' .install-app-button');
      await until(() => evaluate(`!!document.querySelector('${banner} .install-app-guide')`), 'manual banner guide');
      await installGeometry(banner);
      if (width === 390 || width === 1440) await screenshot(`windows-${width}-manual-main`, '.view-navigation, ' + banner);
      await click(banner + ' .install-app-dismiss');
      await openSettings();
      await assertHonestButton(settingsInstall);
      await click(settingsInstall + ' .install-app-button');
      await until(() => evaluate(`!!document.querySelector('${settingsInstall} .install-app-guide')`), 'manual settings guide');
      await installGeometry(settingsInstall);
      if (width === 390 || width === 1440) await screenshot(`windows-${width}-manual-settings`, settingsInstall);
      await closeSettings();
      assert.equal(await evaluate('window.pwaProbe.calls'), 0, 'No native prompt invoked without an event');
    }
    // Keep both stale manual guides open when native readiness arrives.
    await click(banner + ' .install-app-button');
    await until(() => evaluate(`!!document.querySelector('${banner} .install-app-guide')`), 'stale banner guide open');
    await openSettings();
    await click(settingsInstall + ' .install-app-button');
    await until(() => evaluate(`!!document.querySelector('${settingsInstall} .install-app-guide')`), 'stale settings guide open');
    await evaluate("window.pwaDispatchInstall('dismissed')");
    await installButton(banner, 'native');
    await installButton(settingsInstall, 'native');
    await until(() => evaluate("![...document.querySelectorAll('.install-app-guide')].some(guide => guide.getClientRects().length)"), 'late native readiness closes stale manual guidance');
    await click(settingsInstall + ' .install-app-button');
    await until(() => evaluate('window.pwaProbe.calls === 1'), 'late native event works from desktop settings');
    await closeSettings();
  });
  await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: absentProbe.identifier });
  await check('iPhone manual installation guide and 320px card have no overflow', async () => {
    await command('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    await reload();
    await layout();
    await installButton(banner, 'manual');
    await click('.install-app-button');
    await until(() => evaluate("!!document.querySelector('.install-app-guide') && document.querySelector('.install-app-guide').getClientRects().length > 0"), 'iOS manual guide opens without beforeinstallprompt');
    const text = await evaluate("document.querySelector('.install-app-guide').textContent");
    assert.match(text, /Add to Home Screen|افزودن به صفحه/iu);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile manual guide does not overflow');
    await screenshot('iphone-320-guide');
    await click('.install-app-dismiss');
    await until(() => evaluate("!document.querySelector('.install-app-guide') || document.querySelector('.install-app-guide').getClientRects().length === 0"), 'install guide close control works');
    const cardVisible = await evaluate("!!document.querySelector('.install-app')?.getClientRects().length");
    await layout(cardVisible); await screenshot('iphone-320-dismissed');
    await command('Network.setUserAgentOverride', { userAgent: desktopUA });
  });
  await check('Dismissed recommendation stays hidden after reload while settings installation still works', async () => {
    await click('.install-app-hide');
    await until(() => evaluate("!document.querySelector('[data-install-placement=recommendation]')"), 'recommendation dismissed');
    await reload();
    assert.equal(await evaluate("!!document.querySelector('[data-install-placement=recommendation]')"), false, 'Dismissal survives reload');
    await click('.settings-button');
    await until(() => evaluate("!!document.querySelector('.settings-dialog [data-install-placement=settings] .install-app-button')"), 'settings install action');
    assert.equal(await evaluate("!!document.querySelector('.settings-dialog .install-app-hide')"), false, 'Persistent settings action cannot be dismissed');
    await evaluate(`(() => {
      window.settingsInstallCalls = 0;
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.settingsInstallCalls++; };
      event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
      window.dispatchEvent(event);
    })()`);
    await installButton(settingsInstall, 'native');
    await click('.settings-dialog .install-app-button');
    await until(() => evaluate('window.settingsInstallCalls === 1'), 'settings invokes retained native install action');
    await installButton(settingsInstall, 'manual');
    await click('.settings-dialog .install-app-button');
    await until(() => evaluate("!!document.querySelector('.settings-dialog .install-app-guide')"), 'settings manual fallback');
    await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate("document.querySelector('.settings-scroll').scrollWidth <= document.querySelector('.settings-scroll').clientWidth + 1"), 'Settings installation fits 320px');
    await screenshot('settings-install-after-dismissal');
    await click('.settings-dialog .install-app-dismiss');
    assert.equal(await evaluate("!!document.querySelector('.settings-dialog .install-app-guide')"), false);
    await click('.settings-header .icon-button');
    assert.equal(await evaluate("!!document.querySelector('[data-install-placement=recommendation]')"), false, 'Settings does not restore the banner');
  });
  await check('No uncaught production browser exceptions', async () => { assert.deepEqual(exceptions, []); });
} catch (error) {
  failures++; console.error(`FAIL: Edge PWA regression\n${error.stack ?? error}`);
  if (command && socket?.readyState === WebSocket.OPEN) {
    console.error('Server requests:', serverRequests);
    try { console.error('Worker state:', await evaluate("navigator.serviceWorker.getRegistrations().then(items => items.map(item => ({scope: item.scope, active: item.active?.state, installing: item.installing?.state, waiting: item.waiting?.state})))"), [...workerVersions.values()]); } catch {}
  }
  if (command && socket?.readyState === WebSocket.OPEN && existsSync(join(dist, 'index.html'))) {
    try { await screenshot('failure'); } catch {}
  }
} finally {
  // All waits/commands are bounded and cleanup also runs after assertion/startup failures.
  if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} }
  socket?.close();
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('CDP closing')); }
  pending.clear();
  if (browser?.pid && browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
      await Promise.race([new Promise(resolve => { killer.once('exit', resolve); killer.once('error', resolve); }), delay(3000)]);
    } else browser.kill('SIGKILL');
    await Promise.race([exited, delay(3000)]);
  }
  if (server) {
    server.closeAllConnections();
    await Promise.race([new Promise(resolve => server.close(resolve)), delay(3000)]);
  }
  if (profile) {
    try { await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
    catch (error) { failures++; console.error(`FAIL: temporary profile cleanup: ${error.message}`); }
  }
}
console.log(`Edge PWA regression: ${passes} passed, ${failures} failed. Screenshots: dist/pwa-checks/`);
if (failures) process.exitCode = 1;
