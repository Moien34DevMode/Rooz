import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { normalizeHex, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, hexToHsv, hsvToHex, pointToSV, moveSV } = await server.ssrLoadModule('/src/features/themes/colorMath.ts');
const { ThemeColorField } = await server.ssrLoadModule('/src/components/ThemeColorField.tsx');
const { SettingsDialog } = await server.ssrLoadModule('/src/components/SettingsDialog.tsx');
const { parentThemes, createCustomTheme } = await server.ssrLoadModule('/src/features/themes/registry.ts');

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('hex drafts accept only opaque three/six digit colors and normalize for persistence', () => {
  for (const [input, expected] of [['#ABCDEF', '#abcdef'], [' #aBc ', '#aabbcc'], ['#000', '#000000'], ['#ffffff', '#ffffff']]) assert.equal(normalizeHex(input), expected);
  for (const input of ['', '#', '#ab', '#abcd', '#12345', '#12345678', '123456', 'red', 'var(--theme-accent)', '#gggggg', '#123456; color:red']) {
    assert.equal(normalizeHex(input), null);
    assert.equal(hexToRgb(input), null);
    assert.equal(hexToHsv(input), null);
  }
});

test('RGB/HSV conversions cover primary/secondary colors, black, white and grayscale', () => {
  for (const [hex, h, s, v] of [
    ['#ff0000', 0, 100, 100], ['#ffff00', 60, 100, 100], ['#00ff00', 120, 100, 100],
    ['#00ffff', 180, 100, 100], ['#0000ff', 240, 100, 100], ['#ff00ff', 300, 100, 100],
    ['#000000', 0, 0, 0], ['#ffffff', 0, 0, 100], ['#808080', 0, 0, 128 / 255 * 100]
  ]) {
    const hsv = hexToHsv(hex);
    closeTo(hsv.h, h); closeTo(hsv.s, s); closeTo(hsv.v, v);
    assert.equal(hsvToHex(hsv), hex);
  }
});

test('RGB/HSV round trips preserve representative colors across the full cube', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const rgb = { r, g, b };
    assert.deepEqual(hsvToRgb(rgbToHsv(rgb)), rgb);
    assert.equal(hsvToHex(hexToHsv(rgbToHex(rgb))), rgbToHex(rgb));
  }
});

test('conversions wrap hue, clamp channels and avoid non-finite output', () => {
  assert.equal(hsvToHex({ h: 360, s: 100, v: 100 }), '#ff0000');
  assert.equal(hsvToHex({ h: -60, s: 100, v: 100 }), '#ff00ff');
  assert.equal(hsvToHex({ h: 780, s: 200, v: 200 }), '#ffff00');
  assert.equal(hsvToHex({ h: NaN, s: NaN, v: Infinity }), '#000000');
  assert.equal(rgbToHex({ r: -20, g: 300, b: 127.6 }), '#00ff80');
  assert.equal(rgbToHex({ r: NaN, g: Infinity, b: -Infinity }), '#000000');
});

test('pointer mapping clamps drags outside the plane, including zero-size bounds', () => {
  const rect = { left: 20, top: 30, width: 200, height: 100 };
  assert.deepEqual(pointToSV(20, 30, rect), { s: 0, v: 100 });
  assert.deepEqual(pointToSV(120, 80, rect), { s: 50, v: 50 });
  assert.deepEqual(pointToSV(300, 200, rect), { s: 100, v: 0 });
  assert.deepEqual(pointToSV(-100, -100, rect), { s: 0, v: 100 });
  assert.deepEqual(pointToSV(0, 0, { left: 0, top: 0, width: 0, height: 0 }), { s: 0, v: 100 });
});

test('plane keyboard mapping supports fine/coarse steps, endpoints and brightness', () => {
  const initial = { h: 120, s: 50, v: 50 };
  assert.deepEqual(moveSV(initial, 'ArrowLeft'), { h: 120, s: 49, v: 50 });
  assert.deepEqual(moveSV(initial, 'ArrowRight', 10), { h: 120, s: 60, v: 50 });
  assert.deepEqual(moveSV(initial, 'ArrowUp'), { h: 120, s: 50, v: 51 });
  assert.deepEqual(moveSV(initial, 'ArrowDown', 10), { h: 120, s: 50, v: 40 });
  assert.deepEqual(moveSV(initial, 'Home'), { h: 120, s: 0, v: 50 });
  assert.deepEqual(moveSV(initial, 'End'), { h: 120, s: 100, v: 50 });
  assert.deepEqual(moveSV(initial, 'PageUp'), { h: 120, s: 50, v: 60 });
  assert.deepEqual(moveSV(initial, 'PageDown'), { h: 120, s: 50, v: 40 });
  assert.deepEqual(moveSV({ h: 120, s: 100, v: 0 }, 'ArrowRight', 10), { h: 120, s: 100, v: 0 });
  assert.equal(moveSV(initial, 'Tab'), null);
  assert.equal(moveSV(initial, 'Escape'), null);
  assert.deepEqual(initial, { h: 120, s: 50, v: 50 });
});

test('color field SSR renders inline, labelled controls and parent/mode token presets without side effects', () => {
  let calls = 0;
  for (const parent of parentThemes) for (const mode of ['light', 'dark']) {
    const palette = parent.modes[mode];
    const markup = renderToStaticMarkup(createElement(ThemeColorField, {
      label: 'رنگ تأکید', value: palette.accent, onChange: () => { calls++; },
      presets: [{ label: 'سطح', value: palette.surface, token: '--theme-surface' }]
    }));
    assert.match(markup, /<fieldset/);
    assert.match(markup, /aria-labelledby=/);
        assert.match(markup, /رنگ تأکید — انتخاب رنگ/);
        assert.match(markup, /aria-expanded="false"/);
        assert.match(markup, /class="theme-color-details" hidden=""/);
    assert.match(markup, /role="slider" tabindex="0"/);
    assert.match(markup, /aria-valuetext="اشباع/);
    assert.match(markup, /aria-describedby=/);
    assert.match(markup, /class="theme-range theme-hue-range" type="range"/);
    assert.match(markup, /class="theme-color-hex" type="text"/);
    assert.match(markup, /aria-invalid="false"/);
    assert.match(markup, /background:var\(--theme-surface\)/);
    assert.doesNotMatch(markup, /type="color"|<select|<dialog/);
    assert.doesNotMatch(markup, /<label\b[^>]*>(?:(?!<\/label>)[^])*?<label\b/);
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const match of markup.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
  }
  assert.equal(calls, 0);
});

test('invalid and disabled color fields expose their state in SSR', () => {
  const invalid = renderToStaticMarkup(createElement(ThemeColorField, { label: 'رنگ', value: '#oops', presets: [], onChange: () => assert.fail('SSR must not apply a color') }));
  assert.match(invalid, /aria-invalid="true"/);
  assert.match(invalid, /این متن هنوز اعمال نشده است/);
  const disabled = renderToStaticMarkup(createElement(ThemeColorField, { label: 'رنگ', value: '#123456', disabled: true, presets: [], onChange: () => {} }));
  assert.match(disabled, /<fieldset[^>]*disabled=""/);
  assert.match(disabled, /role="slider" tabindex="-1" aria-disabled="true"/);
});

test('settings SSR preserves its dialog contract and does not persist or show native color/select inputs', () => {
  const custom = createCustomTheme('controls-custom', 'شخصی', 'hacker');
  const props = { open: true, calendar: 'persian', theme: { activeThemeId: custom.id, mode: 'dark', customThemes: [custom] }, onClose: () => assert.fail(), onCalendarChange: () => assert.fail(), onThemeChange: () => assert.fail(), onClearMemory: () => assert.fail() };
  const markup = renderToStaticMarkup(createElement(SettingsDialog, props));
  assert.match(markup, /role="dialog" aria-modal="true"/);
  assert.match(markup, /ویرایش تم/);
  assert.doesNotMatch(markup, /type="color"|<select/);
  assert.equal(renderToStaticMarkup(createElement(SettingsDialog, { ...props, open: false })), '');
});

test('editor wiring keeps native popups out and guards invalid drafts before confirming', async () => {
  // The editor opens after a client action, so SSR alone cannot inspect its conditional subtree.
  const source = await readFile(new URL('../src/components/SettingsDialog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<select\b|type="color"/);
  assert.equal((source.match(/<SelectField\b/g) ?? []).length, 4);
  assert.equal((source.match(/<ThemeColorField\b/g) ?? []).length, 3);
  assert.match(source, /querySelector<HTMLInputElement>\('\.theme-color-hex:enabled:invalid'\)/);
  assert.match(source, /if \(lock\.current \|\| !validateColors\(\)\) return;/);
  assert.match(source, /className="settings-scroll"/);
  assert.match(source, /className="settings-footer"/);
  assert.match(source, /updateCustomAppearance/);
  assert.match(source, /setCustomModeLink/);
  assert.ok(source.includes('[role="combobox"][aria-expanded="true"]'));
  assert.match(source, /if \(expanded\) \{ expanded\.click\(\); expanded\.focus\(\); \}/);
  for (const className of ['theme-material-preview', 'theme-preview-orb', 'theme-preview-card', 'theme-preview-action']) assert.ok(source.includes(`className="${className}"`) || source.includes(` ${className}"`));
  const css = await readFile(new URL('../src/styles/themeControls.css', import.meta.url), 'utf8');
  for (const token of ['--theme-background', '--theme-surface', '--theme-text', '--theme-accent', '--theme-border']) assert.ok(css.includes(`var(${token})`));
  assert.match(css, /::-webkit-slider-thumb/);
  assert.match(css, /::-moz-range-thumb/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
