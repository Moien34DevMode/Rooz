import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const {
  themeRegistry, parentThemes, defaultThemePreferences, normalizeThemePreferences,
  normalizeThemeAppearance, createCustomTheme, resolveTheme, getThemeVariables, deriveThemePalette, updateCustomAppearance, setCustomModeLink, switchThemeMode
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

test('custom light/dark overrides stay independent and derive semantic colors from their own background', () => {
  const custom = createCustomTheme('custom', 'My theme', 'hacker');
  custom.modes.light = { ...custom.modes.light, accent: '#123456', animation: 'full', effect: 'liquid-glass', background: { kind: 'gradient', color: '#ffffff', endColor: '#112233', angle: 45 } };
  custom.modes.dark = { ...custom.modes.dark, accent: '#abcdef', animation: 'none', effect: 'acrylic' };
  const light = resolveTheme(preferences(custom));
  const dark = resolveTheme(preferences(custom, 'dark'));
  assert.deepEqual(light.palette, deriveThemePalette(light.appearance, 'light'));
  assert.deepEqual(dark.palette, deriveThemePalette(dark.appearance, 'dark'));
  assert.notEqual(light.palette.surface, themeRegistry.hacker.modes.light.surface);
  assert.notEqual(dark.palette.surface, themeRegistry.hacker.modes.dark.surface);
  assert.equal(light.appearance.accent, '#123456');
  assert.equal(dark.appearance.accent, '#abcdef');
  assert.equal(light.appearance.effect, 'liquid-glass');
  assert.equal(dark.appearance.effect, 'acrylic');
  assert.ok(getThemeVariables(preferences(custom))['--theme-background'].includes('linear-gradient(45deg, #ffffff, #112233)'));
});

test('custom surfaces follow both background endpoints, not an inherited green palette or the accent', () => {
  const custom = createCustomTheme('blue-surfaces', 'Blue', 'barbari');
  custom.modes.dark.background = { kind: 'gradient', color: '#101827', endColor: '#183256', angle: 135 };
  custom.modes.dark.accent = '#0066ff';
  const blue = getThemeVariables(preferences(custom, 'dark'));
  assert.equal(blue['--theme-accent'], '#0066ff');
  assert.notEqual(blue['--theme-surface'], themeRegistry.barbari.modes.dark.surface);
  for (const key of ['--theme-surface', '--theme-surface-raised', '--theme-border', '--theme-muted']) {
    const hex = blue[key];
    assert.ok(parseInt(hex.slice(5, 7), 16) > parseInt(hex.slice(3, 5), 16), `${key} should follow the blue background`);
  }
  custom.modes.dark.accent = '#ff5500';
  const orangeAccent = getThemeVariables(preferences(custom, 'dark'));
  assert.equal(orangeAccent['--theme-surface'], blue['--theme-surface']);
  assert.notEqual(orangeAccent['--theme-accent-wash'], blue['--theme-accent-wash']);
  custom.modes.dark.background.endColor = '#701530';
  assert.notEqual(getThemeVariables(preferences(custom, 'dark'))['--theme-surface'], blue['--theme-surface']);
});

test('custom palettes keep readable text in either mode even with extreme background choices', () => {
  const luminosity = hex => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  for (const mode of ['light', 'dark']) for (const background of ['#ffffff', '#000000', '#00ff00', '#ff00ff', '#0000ff']) {
    const appearance = createCustomTheme('contrast', 'Contrast', 'barbari').modes[mode];
    appearance.background = { kind: 'solid', color: background, endColor: background, angle: 135 };
    const palette = deriveThemePalette(appearance, mode);
    for (const foreground of [palette.text, palette.muted]) {
      const a = luminosity(foreground), b = luminosity(palette.surface);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${mode} ${background} text contrast`);
    }
  }
});

test('shared custom edits preserve every changed setting when switching light/dark and reloading', () => {
  let custom = setCustomModeLink(createCustomTheme('linked', 'Linked', 'barbari'), 'light', true);
  custom = updateCustomAppearance(custom, 'light', { accent: '#0066ff', animation: 'full', effect: 'liquid-glass', background: { kind: 'gradient', color: '#101827', endColor: '#183256', angle: 40 } });
  assert.deepEqual(custom.modes.dark, custom.modes.light);
  const saved = normalizeThemePreferences(JSON.parse(JSON.stringify(preferences(custom, 'dark'))));
  assert.equal(saved.customThemes[0].linkModes, true);
  for (const mode of ['light', 'dark']) {
    assert.deepEqual(resolveTheme({ ...saved, mode }).appearance, custom.modes.light);
  }
  const before = JSON.stringify(custom);
  const changed = updateCustomAppearance(custom, 'dark', { animation: 'tech' });
  assert.equal(JSON.stringify(custom), before);
  assert.equal(changed.modes.light.animation, 'tech');
  assert.equal(changed.modes.dark.animation, 'tech');
  assert.equal(changed.modes.light.accent, '#0066ff');
  assert.deepEqual(changed.modes.light.background, custom.modes.light.background);
});

test('independent modes change only the active appearance until explicitly linked', () => {
  let custom = setCustomModeLink(createCustomTheme('independent', 'Independent', 'hacker'), 'light', false);
  const originalDark = JSON.stringify(custom.modes.dark);
  custom = updateCustomAppearance(custom, 'light', { accent: '#ff5500', effect: 'acrylic' });
  assert.equal(JSON.stringify(custom.modes.dark), originalDark);
  assert.equal(custom.modes.light.accent, '#ff5500');
  assert.equal(normalizeThemePreferences(preferences(custom)).customThemes[0].linkModes, false);
  const linked = setCustomModeLink(custom, 'light', true);
  assert.deepEqual(linked.modes.dark, linked.modes.light);
  linked.modes.dark.background.color = '#000000';
  assert.notEqual(linked.modes.light.background.color, '#000000');
  assert.equal(custom.linkModes, false);
});

test('legacy saved mode appearances are preserved during shared-mode migration', () => {
  const custom = createCustomTheme('legacy', 'Legacy', 'barbari');
  delete custom.linkModes;
  custom.modes.light.accent = '#ff5500'; custom.modes.dark.accent = '#0066ff';
  const saved = normalizeThemePreferences(preferences(custom));
  assert.equal(saved.customThemes[0].linkModes, true);
  assert.equal(saved.customThemes[0].modes.light.accent, '#ff5500');
  assert.equal(saved.customThemes[0].modes.dark.accent, '#0066ff');
});

test('mode switching keeps legacy shared customizations without mutating saved preferences', () => {
  const custom = createCustomTheme('legacy-toggle', 'Legacy', 'barbari');
  custom.modes.dark = { ...custom.modes.dark, accent: '#0066ff', effect: 'liquid-glass', animation: 'full' };
  const saved = preferences(custom, 'dark');
  const before = JSON.stringify(saved);
  const light = switchThemeMode(saved, 'light');
  assert.equal(JSON.stringify(saved), before);
  assert.equal(light.mode, 'light');
  assert.deepEqual(resolveTheme(light).appearance, custom.modes.dark);
  assert.deepEqual(resolveTheme(switchThemeMode(light, 'dark')).appearance, custom.modes.dark);
  const independent = { ...saved, customThemes: [{ ...custom, linkModes: false }] };
  assert.deepEqual(resolveTheme(switchThemeMode(independent, 'light')).appearance, custom.modes.light);
});

test('glass opacity adapts when a shared backdrop is dark but the UI mode is light', () => {
  const custom = setCustomModeLink(createCustomTheme('glass-contrast', 'Contrast', 'barbari'), 'dark', true);
  const appearance = { ...custom.modes.dark, background: { kind: 'gradient', color: '#101827', endColor: '#183256', angle: 135 }, accent: '#0066ff', effect: 'liquid-glass' };
  custom.modes = { light: appearance, dark: appearance };
  const light = getThemeVariables(preferences(custom, 'light'));
  const dark = getThemeVariables(preferences(custom, 'dark'));
  assert.ok(parseInt(light['--theme-glass-opacity']) > parseInt(dark['--theme-glass-opacity']));
  for (const variables of [light, dark]) for (const key of ['--theme-glass-opacity', '--theme-acrylic-opacity']) {
    assert.match(variables[key], /^\d+%$/);
    assert.ok(parseInt(variables[key]) <= 100);
  }
});

test('shared and independent appearance updates enforce mini restrictions', () => {
  for (const linked of [true, false]) {
    const custom = setCustomModeLink(createCustomTheme('mini-edit', 'Mini', 'mini'), 'light', linked);
    const updated = updateCustomAppearance(custom, 'light', { effect: 'liquid-glass', animation: 'full', accent: '#0066ff' });
    for (const mode of ['light', 'dark']) { assert.equal(updated.modes[mode].effect, 'none'); assert.equal(updated.modes[mode].animation, 'none'); }
  }
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
