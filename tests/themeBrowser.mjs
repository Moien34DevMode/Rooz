// Optional real-browser regression check: node tests/themeBrowser.mjs (Windows Edge, Node 22+).
// Isolated temporary profile, existing Vite/CDP, no packages or access to user data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const executable = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable || typeof WebSocket === 'undefined') throw new Error('This optional check requires Windows Edge and Node 22+ with WebSocket.');
const profile = await mkdtemp(join(tmpdir(), 'rooz-theme-check-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let socket, command;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action, description, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await action(); if (result) return result; await delay(80); }
  throw new Error(`Timed out: ${description}`);
}
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const port = await until(async () => { try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; } }, 'Edge debugging endpoint');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(`${request.method}: ${JSON.stringify(message.error)}`)); else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  command = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(next, { resolve, reject, timeout, method }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).catch(error => { throw new Error(`${error.message}\nExpression: ${expression}`); });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function key(key, code = key, virtualKey = 0) {
    for (const type of ['keyDown', 'keyUp']) await command('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: virtualKey });
  }
  async function clickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  async function screenshot(name) {
    await delay(700);
    await mkdir('dist/theme-checks', { recursive: true });
    await writeFile(`dist/theme-checks/${name}.png`, Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  async function viewport(width, height) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(100);
  }
  async function setInput(selector, value) {
    await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); input.select(); })()`);
    await command('Input.insertText', { text: value });
  }
  async function setHex(index, value) {
    await setInput(`.theme-color-field:nth-child(${index + 1}) .theme-color-hex`, value);
    await until(() => evaluate(`document.querySelectorAll('.theme-color-hex')[${index}].value === ${JSON.stringify(value)}`), 'HEX editing');
  }
  async function openMenu(selector) {
    await evaluate(`(() => { const button = document.querySelector(${JSON.stringify(selector)}); button.scrollIntoView({ block: 'center' }); button.click(); })()`);
    await until(() => evaluate("!!document.querySelector('.select-menu[data-positioned=true]')"), 'placed dropdown');
    await checkMenuGeometry();
  }
  async function checkMenuGeometry() {
    const geometry = await evaluate(`(() => {
      const menu = document.querySelector('.select-menu');
      const trigger = document.getElementById(menu.dataset.selectOwner);
      const rect = menu.getBoundingClientRect(), anchor = trigger.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(18, rect.height / 2));
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        gap: menu.dataset.side === 'above' ? anchor.top - rect.bottom : rect.top - anchor.bottom,
        clickable: !!hit?.closest('.select-menu'), strategy: menu.dataset.selectStrategy,
        topLayer: menu.matches(':popover-open'), filter: getComputedStyle(menu).backdropFilter };
    })()`);
    assert.ok(geometry.left >= 10 && geometry.right <= geometry.viewportWidth - 10, JSON.stringify(geometry));
    assert.ok(geometry.top >= 10 && geometry.bottom <= geometry.viewportHeight - 10, JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.gap - 6) < 2, `Dropdown aligned to trigger: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.clickable, 'Popup is hit-testable, not hidden/clipped by a glass dialog');
    assert.equal(geometry.filter, 'none', 'Options have an opaque readable surface');
    if (geometry.strategy === 'popover') assert.equal(geometry.topLayer, true);
    return geometry;
  }
  async function selectOption(text) {
    const point = await evaluate(`(() => {
      const menu = document.querySelector('.select-menu');
      const option = Array.from(menu.querySelectorAll('[role=option]')).find(item => item.textContent.includes(${JSON.stringify(text)}));
      menu.scrollTop = option.offsetTop;
      const rect = option.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await clickAt(point.x, point.y);
    await until(() => evaluate("!document.querySelector('.select-menu')"), 'selected dropdown dismissed');
  }

  // Use an explicit indexed helper rather than matching unrelated nested buttons.
  async function editorChoose(index, text, expectedStrategy) {
    await evaluate(`(() => { const button = document.querySelectorAll('.theme-editor [role=combobox]')[${index}]; button.scrollIntoView({ block: 'center' }); button.click(); })()`);
    await until(() => evaluate("!!document.querySelector('.select-menu[data-positioned=true]')"), 'editor dropdown');
    const geometry = await checkMenuGeometry();
    if (expectedStrategy) assert.equal(geometry.strategy, expectedStrategy);
    await selectOption(text);
  }
  async function switchMode(mode) {
    await evaluate(`Array.from(document.querySelectorAll('.theme-mode-switch button')).find(button => button.textContent === '${mode === 'dark' ? 'تیره' : 'روشن'}').click()`);
    await until(() => evaluate(`document.documentElement.getAttribute('data-theme-mode') === '${mode}'`), 'mode switch');
  }
  const editorSnapshot = () => evaluate("({ colors: Array.from(document.querySelectorAll('.theme-color-hex')).map(input => input.value), name: document.querySelector('[data-theme-name]').value, angle: document.querySelector('.theme-angle-range').value, motion: document.querySelectorAll('.theme-editor [role=combobox]')[2].textContent, effect: document.querySelectorAll('.theme-editor [role=combobox]')[3].textContent })");
  const styles = () => evaluate("(() => { const elements = ['.theme-preview-card', '.settings-dialog', '.clock-agenda', '.calendar-panel', '.cv-summary', '.cv-year-month']; return Object.fromEntries(elements.filter(selector => document.querySelector(selector)).map(selector => { const style = getComputedStyle(document.querySelector(selector)); return [selector, { filter: style.backdropFilter, image: style.backgroundImage, background: style.backgroundColor, shadow: style.boxShadow, animation: style.animationName }]; })); })()");
  const footerBounds = () => evaluate("(() => { const root = document.querySelector('.settings-dialog'), footer = root.querySelector('.settings-footer'), scroll = root.querySelector('.settings-scroll'); const a = root.getBoundingClientRect(), b = footer.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, rootBottom: a.bottom, rootTop: a.top, outerScroll: root.scrollTop, innerScroll: scroll.scrollTop, position: getComputedStyle(footer).position, background: getComputedStyle(footer.querySelector('.dialog-actions')).backgroundColor }; })()");

  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await viewport(1440, 1000);
  await command('Page.navigate', { url });
  await until(() => evaluate("!document.getElementById('startup-loader') && !!document.querySelector('.clock-agenda')"), 'startup readiness');
  await evaluate("document.querySelector('.settings-button').click()");
  await until(() => evaluate("!!document.querySelector('[data-theme-create]')"), 'settings');
  await evaluate("document.querySelector('[data-theme-create]').click()");
  await until(() => evaluate("document.querySelectorAll('.theme-color-hex').length === 3"), 'compact editor');
  assert.equal(await evaluate("document.querySelectorAll('.theme-editor input[type=color], .theme-editor select').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.theme-color-details:not([hidden])').length"), 0);
  assert.equal(await evaluate("!!document.querySelector('.theme-storage-section')"), false, 'Dangerous memory action is separate from theme creation');
  await evaluate("document.querySelector('.theme-color-toggle').click()");
  await until(() => evaluate("document.querySelector('.theme-color-plane').getClientRects().length > 0"), 'expanded picker');
  await evaluate("document.querySelector('.theme-color-plane').scrollIntoView({ block: 'center' })");
  const bounds = await evaluate("(() => { const rect = document.querySelector('.theme-color-plane').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()");
  await clickAt(bounds.x, bounds.y);
  assert.equal(await evaluate("document.querySelector('.theme-color-plane').getAttribute('aria-valuenow')"), '50');
  await key('ArrowLeft', 'ArrowLeft', 37);
  assert.equal(await evaluate("document.querySelector('.theme-color-plane').getAttribute('aria-valuenow')"), '49');
  await evaluate("document.querySelectorAll('.theme-color-toggle')[1].click()");
  assert.equal(await evaluate("document.querySelectorAll('.theme-color-details:not([hidden])').length"), 1, 'Only one full color picker expands');
  await evaluate("document.querySelectorAll('.theme-color-toggle')[1].click()");
  await setInput('[data-theme-name]', 'آبی من');
  await setHex(0, '#101827'); await setHex(1, '#183256'); await setHex(2, '#0066ff');
  const solid = await styles();
  await editorChoose(3, 'اکریلیک');
  assert.ok((await styles())['.theme-preview-card'].image.includes('data:image/svg+xml'), 'Acrylic grain');
  await editorChoose(3, 'شیشه'); await editorChoose(2, 'کامل');
  const beforeSwitch = await editorSnapshot();
  await switchMode('dark'); assert.deepEqual(await editorSnapshot(), beforeSwitch, 'All custom settings remain on dark switch');
  await switchMode('light'); assert.deepEqual(await editorSnapshot(), beforeSwitch, 'All custom settings remain on light switch');
  await evaluate("document.querySelector('.settings-scroll').scrollTop = 0; document.activeElement?.blur()");
  await screenshot('glass-editor-light');
  await switchMode('dark');
  const palette = await evaluate("(() => { const style = getComputedStyle(document.documentElement); return { surface: style.getPropertyValue('--theme-surface').trim(), raised: style.getPropertyValue('--theme-surface-raised').trim(), accent: style.getPropertyValue('--theme-accent').trim() }; })()");
  assert.equal(palette.accent, '#0066ff');
  for (const key of ['surface', 'raised']) assert.ok(parseInt(palette[key].slice(5, 7), 16) > parseInt(palette[key].slice(3, 5), 16), `${key} follows blue backdrop`);
  const glass = await styles();
  for (const selector of Object.keys(glass)) {
    assert.notEqual(glass[selector].background, solid[selector].background, `${selector} translucent`);
    assert.ok(glass[selector].filter.includes('blur(30px)'), `${selector} glass blur`);
  }
  assert.equal(glass['.theme-preview-card'].animation, 'theme-full-enter');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.theme-preview-orb')).animationName"), 'none');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  await evaluate("document.querySelector('.theme-mode-link input').click()");
  await setHex(2, '#ff5500');
  await switchMode('light'); assert.equal((await editorSnapshot()).colors[2], '#0066ff', 'Independent light settings survive');
  await switchMode('dark'); assert.equal((await editorSnapshot()).colors[2], '#ff5500', 'Independent dark settings survive');
  await evaluate("document.querySelector('.theme-mode-link input').click()");
  await setHex(2, '#0066ff');
  const beforeScroll = await footerBounds();
  await evaluate("document.querySelector('.settings-scroll').scrollTop = 100000");
  const afterScroll = await footerBounds();
  assert.equal(afterScroll.outerScroll, 0, 'Dialog shell never scrolls');
  assert.equal(afterScroll.position, 'static', 'Footer is not sticky or negatively offset');
  assert.equal(afterScroll.background, 'rgba(0, 0, 0, 0)', 'No mismatched opaque footer patch');
  assert.ok(Math.abs(beforeScroll.top - afterScroll.top) < 1 && Math.abs(afterScroll.bottom - afterScroll.rootBottom) < 2, 'Footer stays inside shell while content scrolls');
  await setHex(2, '#oops');
  await evaluate("document.querySelector('.settings-footer .button.primary').click()");
  assert.ok(await evaluate("!!document.querySelector('.theme-editor .theme-color-hex[aria-invalid=true]')"), 'Invalid HEX blocks direct save');
  await setHex(2, '#0066ff');
  await evaluate("document.querySelector('.settings-scroll').scrollTop = 0; document.activeElement?.blur()");
  await screenshot('glass-editor');

  // The body-portal fallback also stays aligned under filters without Popover support.
  await evaluate("window.__showPopover = HTMLElement.prototype.showPopover; void Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: undefined, configurable: true })");
  await editorChoose(3, 'شیشه', 'body');
  await evaluate("void Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: window.__showPopover, configurable: true }); delete window.__showPopover");
  await evaluate("document.querySelector('.settings-footer .button.primary').click()");
  await until(() => evaluate("!document.querySelector('.settings-dialog')"), 'direct editor save');
  const savedId = await evaluate("document.documentElement.getAttribute('data-rooz-theme')");
  await command('Page.reload');
  await until(() => evaluate("!document.getElementById('startup-loader') && !!document.querySelector('.clock-agenda')"), 'saved theme startup');
  assert.equal(await evaluate("document.documentElement.getAttribute('data-rooz-theme')"), savedId);
  assert.equal(await evaluate("document.documentElement.getAttribute('data-theme-effect')"), 'liquid-glass');

  await evaluate("document.querySelector('.settings-button').click()");
  await until(() => evaluate("!!document.querySelector('[data-theme-edit]')"), 'saved settings');
  await evaluate("document.querySelector('.settings-scroll').scrollTop = 100000; document.activeElement?.blur()");
  await screenshot('glass-settings-footer');
  await evaluate("document.querySelector('[data-theme-edit]').click()");
  await until(() => evaluate("!!document.querySelector('.theme-preview-card')"), 'saved editor');
  assert.deepEqual(await editorSnapshot(), beforeSwitch, 'Colors, name, angle, motion and effect survive persistence');
  await viewport(390, 844);
  await switchMode('light'); assert.deepEqual(await editorSnapshot(), beforeSwitch);
  await switchMode('dark'); assert.deepEqual(await editorSnapshot(), beforeSwitch);
  await evaluate("document.querySelector('.settings-scroll').scrollTop = 0; document.activeElement?.blur()");
  await screenshot('color-editor-mobile');
  const mobileFooter = await footerBounds();
  assert.ok(mobileFooter.bottom < 844 && mobileFooter.rootTop >= 0);
  assert.ok(await evaluate("document.querySelector('.settings-scroll').scrollWidth <= document.querySelector('.settings-scroll').clientWidth + 1"), 'No mobile horizontal overflow');
  await editorChoose(0, 'مینی');
  for (const state of Object.values(await styles())) { assert.equal(state.filter, 'none'); assert.equal(state.shadow, 'none'); assert.equal(state.animation, 'none'); }
  assert.equal(await evaluate("document.querySelectorAll('.theme-editor [role=combobox]:disabled').length"), 2);
  await evaluate("document.querySelector('.settings-header .dialog-top button').click()");
  await until(() => evaluate("!document.querySelector('.settings-dialog')"), 'cancel restoration');
  assert.equal(await evaluate("document.documentElement.getAttribute('data-rooz-theme')"), savedId);
  assert.equal(await evaluate("document.documentElement.getAttribute('data-theme-effect')"), 'liquid-glass');

  // Reproduce the actual task-creation screenshot: glass form, expanded mid-term details, select.
  for (const size of [[1440, 1000], [390, 844]]) {
    await viewport(...size);
    await evaluate("document.querySelector('.do-button').click()");
    await until(() => evaluate("!!document.querySelector('.do-dialog')"), 'task dialog');
    await evaluate("Array.from(document.querySelectorAll('.do-type-switch button')).find(button => button.textContent.includes('میان‌مدت')).click()");
    await until(() => evaluate("!!document.querySelector('.mid-form details:nth-child(2)')"), 'mid-term fields');
    await evaluate("document.querySelector('.mid-form details:nth-child(2)').open = true");
    await openMenu('.mid-form details:nth-child(2) [role=combobox]');
    assert.equal(await evaluate("document.querySelector('.select-menu').dataset.selectStrategy"), 'popover');
    await evaluate("document.querySelector('.do-form-scroll').scrollTop += 20");
    await until(async () => { try { await checkMenuGeometry(); return true; } catch { return false; } }, 'dropdown follows scrolled trigger');
    const scrollBefore = await evaluate("document.querySelector('.do-form-scroll').scrollTop");
    await key('End', 'End', 35);
    assert.equal(await evaluate("document.querySelector('.do-form-scroll').scrollTop"), scrollBefore, 'Navigating options does not scroll the form');
    await checkMenuGeometry();
    await screenshot(size[0] < 600 ? 'task-dropdown-mobile' : 'task-dropdown-desktop');
    await key('Escape', 'Escape', 27);
    assert.ok(await evaluate("!!document.querySelector('.do-dialog') && !document.querySelector('.select-menu')"), 'First Escape closes only dropdown');
    await openMenu('.mid-form details:nth-child(2) [role=combobox]');
    await selectOption('خیر');
    assert.ok(await evaluate("document.querySelector('.mid-form details:nth-child(2) [role=combobox]').textContent.includes('خیر')"));
    await key('Escape', 'Escape', 27);
    await until(() => evaluate("!document.querySelector('.do-dialog')"), 'Escape closes form');
    assert.equal(await evaluate("document.body.style.overflow"), '', 'Body scroll lock releases');
  }
  await evaluate("document.querySelector('.all-tasks-button').click()");
  await until(() => evaluate("!!document.querySelector('.task-manager')"), 'manager');
  await openMenu('.manager-filters [role=combobox]');
  await selectOption('همه');
  await key('Escape', 'Escape', 27);
  assert.equal(await evaluate("!!document.querySelector('.task-manager')"), false);
  assert.deepEqual(errors, []);
  console.log('PASS: Edge theme mode retention/shared and independent editing, direct save/reload, compact desktop/mobile layout, stable glass footer, top-layer and fallback dropdown alignment/clicks, task/manager selects, keyboard dismissal/scroll, mini and reduced motion.');
  console.log('Screenshots: dist/theme-checks/glass-editor.png, glass-settings-footer.png, color-editor-mobile.png, task-dropdown-desktop.png, task-dropdown-mobile.png');
} finally {
  if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} }
  socket?.close(); browser.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
