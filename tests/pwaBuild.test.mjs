import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { pwaBuild, serviceWorkerSource } from '../build/pwa.mjs';
import { iconSpecs, renderIcon } from '../build/generate-icons.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = join(root, 'public');

const manifest = JSON.parse(await readFile(join(publicDir, 'manifest.webmanifest'), 'utf8'));

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), name + '/'));
    else files.push(name);
  }
  return files.sort();
}

function worker(source, scope, initialFetch, immediateTimeout = false, timers = {}) {
  const listeners = new Map();
  const stores = new Map();
  const writes = [];
  let network = initialFetch;
  const cacheStorage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(key, response) {
          const url = typeof key === 'string' ? key : key.url;
          writes.push(url);
          entries.set(url, response.clone());
        },
        async match(key) {
          return entries.get(typeof key === 'string' ? key : key.url)?.clone();
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  runInNewContext(source, {
    self: { registration: { scope }, addEventListener(type, listener) { listeners.set(type, listener); } },
    caches: cacheStorage, URL, Request, Response, AbortController,
    fetch: request => network(request),
    setTimeout: (callback, delay) => {
      if (immediateTimeout && delay === 3000) { callback(); return 0; }
      return setTimeout(callback, delay);
    },
    clearTimeout,
    ...timers
  });
  return {
    stores, writes,
    setFetch(fetcher) { network = fetcher; },
    async lifecycle(type) {
      let pending;
      listeners.get(type)({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    fetch(url, { method = 'GET', mode = 'cors' } = {}) {
      let result;
      listeners.get('fetch')({ request: { url, method, mode }, respondWith(promise) { result = promise; } });
      return result;
    }
  };
}

const fixtureFiles = ['index.html', 'assets/main-abc123.js', 'assets/lazy-def456.js', 'assets/style-abc123.css',
  'manifest.webmanifest', ...iconSpecs.map(icon => 'icons/' + icon.name)];
const source = serviceWorkerSource(fixtureFiles, 'test-version');
const successfulFetch = async request => new Response('installed:' + request.url);

function pngRaster(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8);
  assert.equal(bytes[25], 6);
  const idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(idat));
  assert.equal(pixels.length, (width * 4 + 1) * height);
  return { width, height, pixels };
}

test('manifest is a relative, Persian RTL standalone app with separate any/maskable icons', () => {
  assert.equal(manifest.name, 'روز برنامه‌ریز شخصی');
  assert.equal(manifest.short_name, 'روز');
  assert.equal(manifest.lang, 'fa');
  assert.equal(manifest.dir, 'rtl');
  for (const field of ['id', 'start_url', 'scope']) assert.equal(manifest[field], './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#f5f6f3');
  assert.equal(manifest.background_color, '#f5f6f3');
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.type, icon.purpose]), [
    ['192x192', 'image/png', 'any'], ['512x512', 'image/png', 'any'], ['512x512', 'image/png', 'maskable']
  ]);
  assert.equal(new Set(manifest.icons.map(icon => icon.src)).size, 3);
});

test('committed PNGs match the generator, manifest dimensions and opaque maskable safe zone', async () => {
  for (const spec of iconSpecs) {
    const bytes = await readFile(join(publicDir, 'icons', spec.name));
    assert.deepEqual(bytes, renderIcon(spec.size, spec.maskable));
    const { width, height, pixels } = pngRaster(bytes);
    assert.equal(width, spec.size);
    assert.equal(height, spec.size);
    const listed = manifest.icons.find(icon => icon.src === 'icons/' + spec.name);
    if (spec.size !== 180) assert.equal(listed.sizes, `${width}x${height}`);
    for (let y = 0; y < height; y++) {
      assert.equal(pixels[y * (width * 4 + 1)], 0);
      for (let x = 0; x < width; x++) {
        const offset = y * (width * 4 + 1) + 1 + x * 4;
        assert.equal(pixels[offset + 3], 255);
        if (spec.maskable && Math.hypot((x + 0.5) / width - 0.5, (y + 0.5) / height - 0.5) >= 0.4) {
          assert.deepEqual([...pixels.subarray(offset, offset + 3)], [245, 246, 243]);
        }
      }
    }
  }
});

test('a real Vite build includes lazy chunks, CSS, HTML and public files in a deterministic content version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rooz-pwa-'));
  try {
    await mkdir(join(directory, 'public'));
    await writeFile(join(directory, 'public', 'manifest.webmanifest'), JSON.stringify(manifest));
    await writeFile(join(directory, 'index.html'), '<!doctype html><script type="module" src="./main.js"></script>');
    await writeFile(join(directory, 'main.js'), 'import "./style.css"; window.loadPlanner = () => import("./lazy.js");');
    await writeFile(join(directory, 'lazy.js'), 'export const planner = "lazy-planner";');
    await writeFile(join(directory, 'style.css'), 'body { color: #517365; }');
    const options = {
      root: directory, configFile: false, base: './', publicDir, logLevel: 'silent',
      plugins: [pwaBuild()], build: { outDir: 'dist', emptyOutDir: true }
    };
    await build(options);
    const outDir = join(directory, 'dist');
    const first = await readFile(join(outDir, 'sw.js'), 'utf8');
    const files = JSON.parse(first.match(/const FILES = (.*);/)[1]);
    assert.deepEqual(files, (await listFiles(outDir)).filter(file => file !== 'sw.js'));
    assert.ok(files.some(file => /assets\/lazy-.*\.js$/.test(file)));
    assert.ok(files.some(file => /\.css$/.test(file)));
    assert.ok(files.includes('index.html'));
    assert.ok(files.includes('manifest.webmanifest'));
    for (const icon of iconSpecs) assert.ok(files.includes('icons/' + icon.name));
    assert.doesNotMatch(first, /(?:skipWaiting|clients\.claim)\s*\(/);
    assert.doesNotMatch(first, /indexedDB/);
    assert.match(first, /const VERSION = "[a-f0-9]{64}"/);
    await build(options);
    assert.equal(await readFile(join(outDir, 'sw.js'), 'utf8'), first);
    await writeFile(join(directory, 'lazy.js'), 'export const planner = "changed-planner";');
    await build(options);
    const changed = await readFile(join(outDir, 'sw.js'), 'utf8');
    assert.notEqual(changed.match(/const VERSION = (.*);/)[1], first.match(/const VERSION = (.*);/)[1]);
    const customPublic = join(directory, 'public');
    options.publicDir = customPublic;
    await build(options);
    const beforePublicChange = await readFile(join(outDir, 'sw.js'), 'utf8');
    await writeFile(join(customPublic, 'manifest.webmanifest'), JSON.stringify({ ...manifest, description: 'changed' }));
    await build(options);
    assert.notEqual((await readFile(join(outDir, 'sw.js'), 'utf8')).match(/const VERSION = (.*);/)[1],
      beforePublicChange.match(/const VERSION = (.*);/)[1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const pathname of ['/', '/Rooz/']) {
  const scope = 'https://example.test' + pathname;
  test(`worker precaches scope-relative shell, navigates offline, and leaves user/API data alone at ${pathname}`, async () => {
    const calls = [];
    const sw = worker(source, scope, async request => {
      calls.push(request);
      return successfulFetch(request);
    });
    await sw.lifecycle('install');
    assert.deepEqual(calls.map(request => request.url), fixtureFiles.map(file => new URL(file, scope).href));
    assert.ok(calls.every(request => request.cache === 'reload' && request.redirect === 'error'));
    const installedWrites = sw.writes.length;
    const indexBody = 'installed:' + new URL('index.html', scope).href;
    sw.setFetch(async () => { throw new Error('offline'); });
    for (const target of ['', '?date=2026-10-09', 'planner/day']) {
      assert.equal(await (await sw.fetch(new URL(target, scope).href, { mode: 'navigate' })).text(), indexBody);
    }
    for (const file of fixtureFiles.filter(file => file !== 'index.html')) {
      const response = await sw.fetch(new URL(file, scope).href);
      assert.equal(await response.text(), 'installed:' + new URL(file, scope).href);
    }
    sw.setFetch(async () => new Response('fresh HTML'));
    assert.equal(await (await sw.fetch(scope, { mode: 'navigate' })).text(), 'fresh HTML');
    for (const status of [404, 500, 206]) {
      sw.setFetch(async () => new Response('bad HTML', { status }));
      assert.equal(await (await sw.fetch(scope, { mode: 'navigate' })).text(), indexBody);
    }
    assert.equal(sw.writes.length, installedWrites, 'navigation must not rewrite the versioned shell');
    for (const url of [new URL('api/tasks', scope).href, new URL('assets/unknown.js', scope).href,
      new URL('assets/main-abc123.js?user=private', scope).href, 'https://other.test/asset.js']) {
      assert.equal(sw.fetch(url), undefined);
    }
    assert.equal(sw.fetch(new URL('manifest.webmanifest', scope).href, { method: 'POST' }), undefined);
    if (pathname !== '/') assert.equal(sw.fetch('https://example.test/Rooz-other/', { mode: 'navigate' }), undefined);
  });

  test(`worker timeout falls back and activation deletes only its own scope namespace at ${pathname}`, async () => {
    const sw = worker(source, scope, successfulFetch, true);
    await sw.lifecycle('install');
    const [current] = sw.stores.keys();
    const old = current.replace('test-version', 'old-version');
    const foreignScope = 'rooz-shell:' + encodeURIComponent('https://example.test/another/') + ':old-version';
    sw.stores.set(old, new Map());
    sw.stores.set(foreignScope, new Map());
    sw.stores.set('unrelated-cache', new Map());
    await sw.lifecycle('activate');
    assert.deepEqual([...sw.stores.keys()].sort(), [current, foreignScope, 'unrelated-cache'].sort());
    sw.setFetch(() => new Promise(() => {}));
    assert.equal(await (await sw.fetch(scope, { mode: 'navigate' })).text(), 'installed:' + new URL('index.html', scope).href);
  });
}

test('precache drains bodies before awaiting all headers under limited HTTP/1 connections', { timeout: 1000 }, async () => {
  const scope = 'https://example.test/Rooz/';
  const queue = [];
  const consumed = [];
  let active = 0;
  let peak = 0;
  function pump() {
    while (active < 2 && queue.length) {
      const { request, resolve } = queue.shift();
      active++;
      peak = Math.max(peak, active);
      const response = new Response('downloaded:' + request.url, {
        status: 201, statusText: 'Created', headers: { 'Content-Type': 'application/octet-stream', 'X-Shell': 'test' }
      });
      const readBody = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        assert.equal(sw.writes.length, 0, 'cache writes must wait for all complete bodies');
        const body = await readBody();
        consumed.push(request.url);
        active--;
        pump();
        return body;
      };
      resolve(response);
    }
  }
  const sw = worker(source, scope, request => new Promise(resolve => {
    queue.push({ request, resolve });
    pump();
  }));
  await sw.lifecycle('install');
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(queue.length, 0);
  assert.equal(consumed.length, fixtureFiles.length);
  assert.equal(sw.writes.length, fixtureFiles.length);
  const [cache] = sw.stores.values();
  for (const file of fixtureFiles) {
    const url = new URL(file, scope).href;
    const response = cache.get(url);
    assert.equal(response.status, 201);
    assert.equal(response.statusText, 'Created');
    assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
    assert.equal(response.headers.get('X-Shell'), 'test');
    assert.equal(await response.text(), 'downloaded:' + url);
  }
});

test('precache deadline aborts stalled headers and bodies and clears every timer', async () => {
  for (const phase of ['headers', 'body']) {
    const pendingTimers = new Map();
    const requests = [];
    let nextTimer = 0;
    let cleared = 0;
    let bodyStarted = 0;
    const sw = worker(source, 'https://example.test/Rooz/', request => {
      requests.push(request);
      const stalled = () => new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      });
      if (phase === 'headers') return stalled();
      const response = new Response('unused');
      response.arrayBuffer = () => { bodyStarted++; return stalled(); };
      return Promise.resolve(response);
    }, false, {
      setTimeout(callback, delay) {
        assert.equal(delay, 30000);
        const id = ++nextTimer;
        pendingTimers.set(id, callback);
        return id;
      },
      clearTimeout(id) { pendingTimers.delete(id); cleared++; }
    });
    sw.stores.set('unrelated-cache', new Map());
    const installing = sw.lifecycle('install');
    const rejected = assert.rejects(installing, error => error.name === 'AbortError');
    // Flush both the VM and host microtask queues before firing deadlines.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bodyStarted, phase === 'body' ? fixtureFiles.length : 0);
    assert.equal(pendingTimers.size, fixtureFiles.length);
    for (const callback of [...pendingTimers.values()]) callback();
    await rejected;
    assert.ok(requests.every(request => request.signal.aborted));
    assert.equal(pendingTimers.size, 0);
    assert.equal(cleared, fixtureFiles.length);
    assert.equal(sw.writes.length, 0);
    assert.deepEqual([...sw.stores.keys()], ['unrelated-cache']);
  }
});

test('successful precache clears deadlines only after consuming each body', async () => {
  const pendingTimers = new Set();
  let cleared = 0;
  let consumed = 0;
  const sw = worker(source, 'https://example.test/Rooz/', async request => {
    const response = await successfulFetch(request);
    const readBody = response.arrayBuffer.bind(response);
    response.arrayBuffer = async () => {
      assert.equal(pendingTimers.size + cleared, fixtureFiles.length);
      const body = await readBody();
      consumed++;
      return body;
    };
    return response;
  }, false, {
    setTimeout(callback) { pendingTimers.add(callback); return callback; },
    clearTimeout(id) {
      assert.ok(consumed > cleared, 'body must finish before its deadline is cleared');
      assert.ok(pendingTimers.delete(id));
      cleared++;
    }
  });
  await sw.lifecycle('install');
  assert.equal(consumed, fixtureFiles.length);
  assert.equal(cleared, fixtureFiles.length);
  assert.equal(pendingTimers.size, 0);
});

test('failed or redirected precache downloads fail installation without caching bad responses', async () => {
  for (const failure of ['network', 'status', 'partial', 'redirect']) {
    const sw = worker(source, 'https://example.test/Rooz/', async request => {
      if (!request.url.endsWith('manifest.webmanifest')) return successfulFetch(request);
      if (failure === 'network') throw new Error('offline');
      if (failure === 'redirect') return { ok: true, status: 200, type: 'basic', redirected: true };
      return new Response('bad', { status: failure === 'partial' ? 206 : 404 });
    });
    sw.stores.set('unrelated-cache', new Map());
    await assert.rejects(sw.lifecycle('install'));
    assert.equal(sw.writes.length, 0);
    assert.deepEqual([...sw.stores.keys()], ['unrelated-cache']);
  }
});

test('missing cached shell or asset fails gracefully without poisoning the cache', async () => {
  const scope = 'https://example.test/Rooz/';
  const sw = worker(source, scope, async () => { throw new Error('offline'); });
  assert.equal((await sw.fetch(scope, { mode: 'navigate' })).status, 503);
  assert.equal((await sw.fetch(new URL('assets/main-abc123.js', scope).href)).status, 503);
  sw.setFetch(async () => new Response('bad', { status: 500 }));
  assert.equal((await sw.fetch(new URL('assets/main-abc123.js', scope).href)).status, 500);
  assert.equal(sw.writes.length, 0);
});
