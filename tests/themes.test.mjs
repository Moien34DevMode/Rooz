import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const {
  themeRegistry, parentThemes, defaultThemePreferences, normalizeThemePreferences,
  normalizeThemeAppearance, createCustomTheme, resolveTheme, getThemeVariables
} = await server.ssrLoadModule('/src/features/themes/registry.ts');
const { applyTheme } = await server.ssrLoadModule('/src/features/themes/applyTheme.ts');
const { SettingsDialog } = await server.ssrLoadModule('/src/components/SettingsDialog.tsx');

const preferences = (custom, mode = 'light') => ({ activeThemeId: custom.id, mode, customThemes: [custom] });

test('the registry exposes the three named parents, each in light and dark', () => {
  assert.deepEqual(parentThemes.map(({ id, name }) => [id, name]), [['mini', 'مینی'], ['hacker', 'هکر'], ['barbari', 'بربری']]);
  for (const parent of parentThemes) {
    for (const mode of ['light', 'dark']) {
      const resolved = resolveTheme({ activeThemeId: parent.id, mode, customThemes: [] });
      assert.equal(resolved.parent.id, parent.id);
      assert.ok(resolved.palette.text);
      assert.ok(resolved.appearance.background.color);
      assert.notEqual(parent.modes.light.text, parent.modes.dark.text);
    }
  }
  assert.equal(defaultThemePreferences.activeThemeId, 'barbari');
});

test('missing, malformed, and stale preferences safely become barbari light', () => {
  for (const value of [undefined, null, false, [], 'hacker', {}, { activeThemeId: 'gone', mode: 'system', customThemes: {} }]) {
    assert.deepEqual(normalizeThemePreferences(value), defaultThemePreferences);
  }
  assert.equal(normalizeThemePreferences({ mode: 'dark' }).mode, 'dark');
});

test('malformed custom themes, duplicate IDs, and built-in ID collisions are discarded', () => {
  const valid = createCustomTheme('custom-valid', '  من  ', 'hacker');
  const result = normalizeThemePreferences({ activeThemeId: valid.id, mode: 'dark', customThemes: [
    null, [], {}, { ...valid, id: 'barbari' }, { ...valid, id: 'bad id' }, { ...valid, parentId: 'missing' }, { ...valid, name: ' ' }, valid, { ...valid, name: 'duplicate' }
  ] });
  assert.equal(result.customThemes.length, 1);
  assert.equal(result.customThemes[0].name, 'من');
  assert.equal(result.activeThemeId, valid.id);
  assert.equal(result.mode, 'dark');
});

test('normalization is idempotent, JSON-persistable, and does not mutate or share input', () => {
  const custom = createCustomTheme('custom-one', 'شخصی', 'barbari');
  const input = preferences(custom);
  const before = JSON.stringify(input);
  const result = normalizeThemePreferences(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(normalizeThemePreferences(result), result);
  assert.deepEqual(normalizeThemePreferences(JSON.parse(JSON.stringify(result))), result);
  result.customThemes[0].modes.light.background.color = '#123456';
  assert.notEqual(input.customThemes[0].modes.light.background.color, '#123456');
});

test('invalid colors cannot inject CSS and invalid motion/effects use parent defaults', () => {
  const result = normalizeThemeAppearance({ accent: 'red; background:url(https://example.com)', background: { kind: 'url', color: '#fff', endColor: 'var(--evil)', angle: NaN }, animation: 'spin', effect: 'blur' }, 'barbari', 'light');
  assert.deepEqual(result, createCustomTheme('custom', 'x', 'barbari').modes.light);
  assert.equal(normalizeThemeAppearance({ accent: '#ABCDEF' }, 'barbari', 'light').accent, '#abcdef');
  assert.equal(normalizeThemeAppearance({ background: { angle: Infinity } }, 'hacker', 'dark').background.angle, 135);
  assert.equal(normalizeThemeAppearance({ background: { angle: -10 } }, 'hacker', 'dark').background.angle, 0);
  assert.equal(normalizeThemeAppearance({ background: { angle: 1000 } }, 'hacker', 'dark').background.angle, 360);
});

test('mini forcibly removes every animation and effect in both modes, including custom themes', () => {
  for (const animation of ['none', 'subtle', 'full', 'tech']) {
    for (const effect of ['none', 'acrylic', 'liquid-glass']) {
      const custom = createCustomTheme('mini-custom', 'mini custom', 'mini');
      for (const mode of ['light', 'dark']) custom.modes[mode] = { ...custom.modes[mode], animation, effect };
      const normalized = normalizeThemePreferences(preferences(custom));
      for (const mode of ['light', 'dark']) {
        assert.equal(normalized.customThemes[0].modes[mode].animation, 'none');
        assert.equal(normalized.customThemes[0].modes[mode].effect, 'none');
        const resolved = resolveTheme(preferences(custom, mode));
        assert.equal(resolved.appearance.animation, 'none');
        assert.equal(resolved.appearance.effect, 'none');
        assert.equal(getThemeVariables(preferences(custom, mode))['--theme-shadow'], 'none');
        assert.equal(getThemeVariables(preferences(custom, mode))['--theme-duration'], '0s');
      }
    }
  }
});

test('custom light/dark overrides stay independent and inherit semantic colors from their parent', () => {
  const custom = createCustomTheme('custom', 'My theme', 'hacker');
  custom.modes.light = { ...custom.modes.light, accent: '#123456', animation: 'full', effect: 'liquid-glass', background: { kind: 'gradient', color: '#ffffff', endColor: '#112233', angle: 45 } };
  custom.modes.dark = { ...custom.modes.dark, accent: '#abcdef', animation: 'none', effect: 'acrylic' };
  const light = resolveTheme(preferences(custom));
  const dark = resolveTheme(preferences(custom, 'dark'));
  assert.equal(light.palette.surface, themeRegistry.hacker.modes.light.surface);
  assert.equal(dark.palette.surface, themeRegistry.hacker.modes.dark.surface);
  assert.equal(light.appearance.accent, '#123456');
  assert.equal(dark.appearance.accent, '#abcdef');
  assert.equal(light.appearance.effect, 'liquid-glass');
  assert.equal(dark.appearance.effect, 'acrylic');
  assert.ok(getThemeVariables(preferences(custom))['--theme-background'].includes('linear-gradient(45deg, #ffffff, #112233)'));
});

test('missing mode definitions inherit the correct parent defaults', () => {
  const result = normalizeThemePreferences({ activeThemeId: 'custom', customThemes: [{ id: 'custom', name: 'x', parentId: 'hacker', modes: { light: { accent: '#123456' } } }] });
  assert.equal(result.customThemes[0].modes.light.accent, '#123456');
  assert.deepEqual(result.customThemes[0].modes.dark, createCustomTheme('custom', 'x', 'hacker').modes.dark);
});

test('hacker is sharp and gridded; barbari and mini have no grid', () => {
  const vars = id => getThemeVariables({ activeThemeId: id, mode: 'dark', customThemes: [] });
  assert.equal(vars('hacker')['--theme-radius'], '0px');
  assert.equal(vars('hacker')['--theme-background-size'], '32px 32px, 32px 32px, auto');
  assert.equal(vars('barbari')['--theme-background-size'], 'auto');
  assert.equal(vars('mini')['--theme-background-size'], 'auto');
});

test('accent foreground chooses contrast for black and white customization', () => {
  const custom = createCustomTheme('contrast', 'Contrast', 'barbari');
  for (const [accent, expected] of [['#000000', '#ffffff'], ['#ffffff', '#101810']]) {
    custom.modes.light.accent = accent;
    assert.equal(getThemeVariables(preferences(custom))['--theme-on-accent'], expected);
  }
});

test('deleting an active custom or corrupt active IDs falls back to barbari', () => {
  for (const activeThemeId of ['deleted', '__proto__', 'constructor', 'toString']) {
    assert.equal(resolveTheme({ activeThemeId, mode: 'dark', customThemes: [] }).parent.id, 'barbari');
  }
});

function fakeRoot() {
  const values = new Map();
  const attributes = new Map();
  return {
    style: {
      getPropertyValue: key => values.get(key)?.value ?? '',
      getPropertyPriority: key => values.get(key)?.priority ?? '',
      setProperty: (key, value, priority = '') => values.set(key, { value, priority }),
      removeProperty: key => values.delete(key)
    },
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key)
  };
}

test('applyTheme sets all semantic tokens and normalized mode/parent/effect attributes', () => {
  const root = fakeRoot();
  const custom = createCustomTheme('mini-custom', 'Mini', 'mini');
  custom.modes.dark.effect = 'liquid-glass'; custom.modes.dark.animation = 'full';
  applyTheme(preferences(custom, 'dark'), root);
  assert.equal(root.getAttribute('data-rooz-theme'), 'mini-custom');
  assert.equal(root.getAttribute('data-theme-parent'), 'mini');
  assert.equal(root.getAttribute('data-theme-mode'), 'dark');
  assert.equal(root.getAttribute('data-theme-effect'), 'none');
  assert.equal(root.getAttribute('data-theme-animation'), 'none');
  for (const [key, value] of Object.entries(getThemeVariables(preferences(custom, 'dark')))) assert.equal(root.style.getPropertyValue(key), value);
});

test('preview undo restores prior tokens, priorities, and attributes without affecting unrelated styles', () => {
  const root = fakeRoot();
  root.style.setProperty('--theme-accent', '#ff0000', 'important');
  root.style.setProperty('--unrelated', 'keep');
  root.setAttribute('data-theme-mode', 'external');
  const undo = applyTheme(defaultThemePreferences, root);
  const undoDraft = applyTheme({ activeThemeId: 'hacker', mode: 'dark', customThemes: [] }, root);
  undoDraft();
  assert.equal(root.getAttribute('data-rooz-theme'), 'barbari');
  undo();
  assert.equal(root.style.getPropertyValue('--theme-accent'), '#ff0000');
  assert.equal(root.style.getPropertyPriority('--theme-accent'), 'important');
  assert.equal(root.style.getPropertyValue('--theme-surface'), '');
  assert.equal(root.style.getPropertyValue('--unrelated'), 'keep');
  assert.equal(root.getAttribute('data-theme-mode'), 'external');
  assert.equal(root.getAttribute('data-rooz-theme'), null);
});

test('applyTheme is safe without a browser DOM (SSR)', () => {
  assert.equal(typeof applyTheme(defaultThemePreferences), 'function');
  assert.doesNotThrow(() => applyTheme(defaultThemePreferences)());
});

test('the settings dialog renders accessible parent/custom selections without invoking persistence', () => {
  const custom = createCustomTheme('custom-safe', '<script>bad</script>', 'hacker');
  let calls = 0;
  const props = { open: true, calendar: 'persian', theme: preferences(custom, 'dark'), onClose: () => { calls++; }, onCalendarChange: async () => { calls++; }, onThemeChange: async () => { calls++; }, onClearMemory: async () => { calls++; } };
  const markup = renderToStaticMarkup(createElement(SettingsDialog, props));
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby=/);
  for (const parent of parentThemes) assert.ok(markup.includes(parent.name));
  assert.ok(markup.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!markup.includes('<script>bad</script>'));
  assert.ok(markup.includes('همه‌ی هدف‌ها، کارها، بازه‌ها، یادداشت‌ها، تنظیمات و تم‌های شخصی'));
  assert.equal(calls, 0);
  assert.equal(renderToStaticMarkup(createElement(SettingsDialog, { ...props, open: false })), '');
});
