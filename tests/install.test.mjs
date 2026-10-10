import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const install = await server.ssrLoadModule('/src/features/install/install.ts');
const { InstallApp } = await server.ssrLoadModule('/src/components/InstallApp.tsx');

test('install card renders accessible Persian controls without browser APIs during SSR', () => {
  const html = renderToStaticMarkup(createElement(InstallApp));
  assert.match(html, /راهنمای نصب/);
  assert.match(html, /data-install-mode="manual"/);
  assert.match(html, /class="install-app-button"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /class="install-app-guide"/);
  assert.match(html, /class="install-app-hide"/);
  const settings = renderToStaticMarkup(createElement(InstallApp, { placement: 'settings' }));
  assert.match(settings, /data-install-placement="settings"/);
  assert.doesNotMatch(settings, /class="install-app-hide"/);
});

test('early prompts, one-shot cancellation, retries, installed mode and Apple guidance stay consistent', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const window = new EventTarget(), media = new EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  const storage = new Map();
  window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const navigator = { userAgent: 'Android', platform: 'Linux', maxTouchPoints: 1 };
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true });
  let notifications = 0, calls = 0;
  const unsubscribe = install.subscribeInstall(() => notifications++);
  const prompt = (outcome, rejects = false) => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { calls++; if (rejects) throw new Error('Unavailable'); };
    event.userChoice = Promise.resolve({ outcome, platform: 'web' });
    window.dispatchEvent(event);
    return event;
  };
  try {
    install.initializeInstall();
    install.initializeInstall();
    const early = prompt('dismissed');
    assert.equal(early.defaultPrevented, true);
    assert.equal(install.getInstallState().prompt, early, 'Captured before React subscribes');
    for (const width of [1440, 320, 768, 390, 1440]) {
      window.innerWidth = width;
      window.dispatchEvent(new Event('resize'));
      assert.equal(install.getInstallState().prompt, early, 'Resize never replaces native readiness');
    }
    install.hideInstallRecommendation();
    assert.equal(install.getInstallState().recommendationHidden, true);
    assert.equal(storage.get('rooz-install-recommendation-hidden'), 'true');
    assert.equal(install.getInstallState().prompt, early, 'Hiding recommendation does not consume the settings install event');
    window.localStorage.setItem = () => { throw new Error('Storage blocked'); };
    assert.doesNotThrow(() => install.hideInstallRecommendation());
    const pending = install.promptInstall();
    assert.equal(install.getInstallState().prompting, true);
    assert.equal(await install.promptInstall(), null, 'Two placements cannot invoke a browser event twice');
    assert.equal(await pending, 'dismissed');
    assert.equal(install.getInstallState().prompting, false);
    assert.equal(await install.promptInstall(), null);
    assert.equal(calls, 1, 'Canceled browser event can only be used once');
    prompt('accepted');
    assert.equal(await install.promptInstall(), 'accepted');
    assert.equal(install.getInstallState().installed, false, 'Acceptance alone does not prove installation');
    prompt('dismissed', true);
    await assert.rejects(install.promptInstall(), /Unavailable/);
    assert.equal(install.getInstallState().prompt, null);
    assert.equal(install.getInstallState().prompting, false, 'Failed native prompt releases both placements');
    navigator.userAgent = 'iPhone';
    assert.equal(install.isAppleMobile(), true);
    prompt('accepted');
    assert.equal(install.getInstallState().prompt, null, 'Apple devices use manual guidance');
    navigator.userAgent = 'Macintosh'; navigator.platform = 'MacIntel'; navigator.maxTouchPoints = 5;
    assert.equal(install.isAppleMobile(), true, 'Desktop-mode iPad detected');
    window.dispatchEvent(new Event('appinstalled'));
    assert.equal(install.getInstallState().installed, true);
    assert.equal(install.getInstallState().prompt, null);
    media.matches = true; media.dispatchEvent(new Event('change'));
    assert.equal(install.getInstallState().installed, true);
    assert.ok(notifications > 0);
    assert.deepEqual(install.getServerInstallState(), { installed: false, recommendationHidden: false, checking: false, prompting: false, prompt: null });
  } finally {
    unsubscribe();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator;
  }
});
