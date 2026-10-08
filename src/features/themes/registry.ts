export type ThemeMode = 'light' | 'dark';
export type ParentThemeId = 'mini' | 'hacker' | 'barbari';
export type ThemeAnimation = 'none' | 'subtle' | 'full' | 'tech';
export type ThemeEffect = 'none' | 'acrylic' | 'liquid-glass';

export interface ThemeBackground {
  kind: 'solid' | 'gradient';
  color: string;
  endColor: string;
  angle: number;
}
export interface ThemeAppearance {
  background: ThemeBackground;
  accent: string;
  animation: ThemeAnimation;
  effect: ThemeEffect;
}
export interface ThemePalette {
  surface: string;
  surfaceRaised: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
}
export interface ParentTheme {
  id: ParentThemeId;
  name: string;
  description: string;
  radius: number;
  modes: Record<ThemeMode, ThemeAppearance & ThemePalette>;
}
export interface CustomTheme {
  id: string;
  name: string;
  parentId: ParentThemeId;
  linkModes?: boolean;
  modes: Record<ThemeMode, ThemeAppearance>;
}
export interface ThemePreferences {
  activeThemeId: string;
  mode: ThemeMode;
  customThemes: CustomTheme[];
}

const appearance = (color: string, accent: string, animation: ThemeAnimation): ThemeAppearance => ({
  background: { kind: 'solid', color, endColor: color, angle: 135 }, accent, animation, effect: 'none'
});
const lightPalette: ThemePalette = { surface: '#ffffff', surfaceRaised: '#edf1ee', text: '#25322f', muted: '#617168', border: '#d8e0da', danger: '#a33434' };
const darkPalette: ThemePalette = { surface: '#1c2522', surfaceRaised: '#28352e', text: '#ecf2ee', muted: '#b0bdb5', border: '#43534a', danger: '#ffaaaa' };

// Parents supply defaults and geometry; custom surfaces follow their own background palette.
export const themeRegistry: Readonly<Record<ParentThemeId, ParentTheme>> = {
  mini: {
    id: 'mini', name: 'مینی', description: 'سبک و سریع؛ بدون افکت و حرکت', radius: 5,
    modes: {
      light: { ...lightPalette, ...appearance('#f5f6f3', '#517365', 'none') },
      dark: { ...darkPalette, ...appearance('#141a17', '#97c5a9', 'none') }
    }
  },
  hacker: {
    id: 'hacker', name: 'هکر', description: 'گوشه‌های تیز، شبکه و حس فنی', radius: 0,
    modes: {
      light: { surface: '#f8fffa', surfaceRaised: '#e4f1e7', text: '#102b1a', muted: '#45614e', border: '#9abb9f', danger: '#a33434', ...appearance('#edf5ef', '#16753b', 'tech') },
      dark: { surface: '#0c1911', surfaceRaised: '#13291b', text: '#c5f9d0', muted: '#94c49e', border: '#315a3c', danger: '#ffaaaa', ...appearance('#061009', '#60ed88', 'tech') }
    }
  },
  barbari: {
    id: 'barbari', name: 'بربری', description: 'تم پیش‌فرض؛ تمیز، نرم و آرام', radius: 16,
    modes: {
      light: { ...lightPalette, ...appearance('#f5f6f3', '#517365', 'subtle'), background: { kind: 'gradient', color: '#f5f6f3', endColor: '#e1ece5', angle: 135 } },
      dark: { ...darkPalette, ...appearance('#121a16', '#97c5a9', 'subtle'), background: { kind: 'gradient', color: '#121a16', endColor: '#213b30', angle: 135 } }
    }
  }
};
export const parentThemes: readonly ParentTheme[] = Object.values(themeRegistry);
export const defaultThemePreferences: ThemePreferences = { activeThemeId: 'barbari', mode: 'light', customThemes: [] };
export const themeAnimations: readonly ThemeAnimation[] = ['none', 'subtle', 'full', 'tech'];
export const themeEffects: readonly ThemeEffect[] = ['none', 'acrylic', 'liquid-glass'];

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const isParent = (value: unknown): value is ParentThemeId => parentThemes.some(parent => parent.id === value);
const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

export function normalizeThemeAppearance(value: unknown, parentId: ParentThemeId, mode: ThemeMode): ThemeAppearance {
  const input = record(value);
  const background = record(input.background);
  const fallback = themeRegistry[parentId].modes[mode];
  return {
    background: {
      kind: background.kind === 'gradient' ? 'gradient' : background.kind === 'solid' ? 'solid' : fallback.background.kind,
      color: color(background.color, fallback.background.color),
      endColor: color(background.endColor, fallback.background.endColor),
      angle: typeof background.angle === 'number' && Number.isFinite(background.angle) ? Math.min(360, Math.max(0, background.angle)) : fallback.background.angle
    },
    accent: color(input.accent, fallback.accent),
    animation: parentId === 'mini' ? 'none' : themeAnimations.includes(input.animation as ThemeAnimation) ? input.animation as ThemeAnimation : fallback.animation,
    effect: parentId === 'mini' ? 'none' : themeEffects.includes(input.effect as ThemeEffect) ? input.effect as ThemeEffect : fallback.effect
  };
}

/** Accepts persisted/untrusted JSON, drops malformed customs, and never mutates input. */
export function normalizeThemePreferences(value: unknown): ThemePreferences {
  const input = record(value);
  const customThemes: CustomTheme[] = [];
  const ids = new Set<string>(parentThemes.map(parent => parent.id));
  for (const item of Array.isArray(input.customThemes) ? input.customThemes : []) {
    const custom = record(item);
    if (typeof custom.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(custom.id) || ids.has(custom.id) || !isParent(custom.parentId)) continue;
    const modes = record(custom.modes);
    const name = typeof custom.name === 'string' ? custom.name.trim().slice(0, 60) : '';
    if (!name) continue;
    ids.add(custom.id);
    customThemes.push({ id: custom.id, name, parentId: custom.parentId, linkModes: custom.linkModes !== false, modes: {
      light: normalizeThemeAppearance(modes.light, custom.parentId, 'light'),
      dark: normalizeThemeAppearance(modes.dark, custom.parentId, 'dark')
    } });
  }
  return {
    activeThemeId: typeof input.activeThemeId === 'string' && ids.has(input.activeThemeId) ? input.activeThemeId : 'barbari',
    mode: input.mode === 'dark' ? 'dark' : 'light', customThemes
  };
}

export function createCustomTheme(id: string, name: string, parentId: ParentThemeId): CustomTheme {
  return { id, name, parentId, linkModes: true, modes: {
    light: normalizeThemeAppearance(undefined, parentId, 'light'),
    dark: normalizeThemeAppearance(undefined, parentId, 'dark')
  } };
}

/** Patch the active mode without resetting other fields; shared edits reach both modes. */
export function updateCustomAppearance(custom: CustomTheme, mode: ThemeMode, patch: Partial<ThemeAppearance>): CustomTheme {
  const update = (target: ThemeMode) => normalizeThemeAppearance({ ...custom.modes[target], ...patch }, custom.parentId, target);
  return { ...custom, modes: {
    light: mode === 'light' || custom.linkModes !== false ? update('light') : normalizeThemeAppearance(custom.modes.light, custom.parentId, 'light'),
    dark: mode === 'dark' || custom.linkModes !== false ? update('dark') : normalizeThemeAppearance(custom.modes.dark, custom.parentId, 'dark')
  } };
}

/** Explicitly linking copies the displayed appearance, never silently discards saved independent modes. */
export function setCustomModeLink(custom: CustomTheme, mode: ThemeMode, linked: boolean): CustomTheme {
  const appearance = custom.modes[mode];
  return { ...custom, linkModes: linked, modes: {
    light: normalizeThemeAppearance(linked ? appearance : custom.modes.light, custom.parentId, 'light'),
    dark: normalizeThemeAppearance(linked ? appearance : custom.modes.dark, custom.parentId, 'dark')
  } };
}

/** Mode toggles preserve the displayed customization; independent modes are an explicit opt-in. */
export function switchThemeMode(preferences: ThemePreferences, mode: ThemeMode): ThemePreferences {
  return { ...preferences, mode, customThemes: preferences.customThemes.map(custom =>
    custom.id === preferences.activeThemeId && custom.linkModes !== false
      ? setCustomModeLink(custom, preferences.mode, true)
      : custom
  ) };
}

export function resolveTheme(value: ThemePreferences) {
  const preferences = normalizeThemePreferences(value);
  const custom = preferences.customThemes.find(item => item.id === preferences.activeThemeId);
  const parent = themeRegistry[custom?.parentId ?? preferences.activeThemeId as ParentThemeId];
  const appearance = custom?.modes[preferences.mode] ?? normalizeThemeAppearance(parent.modes[preferences.mode], parent.id, preferences.mode);
  return { preferences, parent, appearance, palette: custom ? deriveThemePalette(appearance, preferences.mode) : parent.modes[preferences.mode] };
}

function mixColors(first: string, second: string, firstWeight: number): string {
  return '#' + [1, 3, 5].map(index => Math.round(parseInt(first.slice(index, index + 2), 16) * firstWeight + parseInt(second.slice(index, index + 2), 16) * (1 - firstWeight)).toString(16).padStart(2, '0')).join('');
}

/** Neutral mode anchors keep text readable while surfaces inherit the chosen backdrop, not the parent hue. */
export function deriveThemePalette(appearance: ThemeAppearance, mode: ThemeMode): ThemePalette {
  const background = appearance.background;
  const seed = background.kind === 'gradient' ? mixColors(background.color, background.endColor, .5) : background.color;
  const dark = mode === 'dark';
  const surface = mixColors(seed, dark ? '#171a21' : '#ffffff', dark ? .26 : .12);
  const text = dark ? '#eef2f8' : '#1d2636';
  return {
    surface, text,
    surfaceRaised: mixColors(seed, dark ? '#2c313c' : '#f2f4f8', dark ? .22 : .2),
    muted: mixColors(text, surface, dark ? .8 : .68),
    border: mixColors(text, surface, dark ? .2 : .16),
    danger: dark ? '#ffaaaa' : '#a33434'
  };
}

const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};

function materialOpacity(palette: ThemePalette, appearance: ThemeAppearance, minimum: number): string {
  const { background, accent } = appearance;
  const colors = [background.color, background.kind === 'gradient' ? background.endColor : background.color];
  const backdropColors = [...colors, ...colors.map(color => mixColors(accent, color, .28))];
  const foregrounds = [palette.text, palette.muted].map(luminance);
  for (let percent = minimum; percent <= 100; percent += 2) {
    if (backdropColors.every(color => {
      const surface = luminance(mixColors(palette.surface, color, percent / 100));
      return foregrounds.every(text => (Math.max(text, surface) + .05) / (Math.min(text, surface) + .05) >= 4.5);
    })) return `${percent}%`;
  }
  return '100%';
}

/** Pure CSS token generation, usable by SSR and previews without touching the DOM. */
export function getThemeVariables(value: ThemePreferences): Record<string, string> {
  const { preferences, parent, appearance: a, palette: p } = resolveTheme(value);
  const base = a.background.kind === 'gradient' ? `linear-gradient(${a.background.angle}deg, ${a.background.color}, ${a.background.endColor})` : `linear-gradient(${a.background.color}, ${a.background.color})`;
  const grid = parent.id === 'hacker' ? `linear-gradient(${p.border}40 1px, transparent 1px), linear-gradient(90deg, ${p.border}40 1px, transparent 1px), ` : '';
  const onAccent = luminance(a.accent) > .179 ? '#101810' : '#ffffff';
  return {
    '--theme-background': grid + base,
    '--theme-background-size': parent.id === 'hacker' ? '32px 32px, 32px 32px, auto' : 'auto',
    '--theme-canvas': a.background.color,
    '--theme-surface': p.surface, '--theme-surface-raised': p.surfaceRaised,
    '--theme-background-end': a.background.kind === 'gradient' ? a.background.endColor : a.background.color,
    '--theme-glass-opacity': materialOpacity(p, a, 38),
    '--theme-acrylic-opacity': materialOpacity(p, a, 68),

    '--theme-text': p.text, '--theme-muted': p.muted, '--theme-border': p.border,
    '--theme-accent': a.accent, '--theme-on-accent': onAccent,
    '--theme-accent-wash': `color-mix(in srgb, ${a.accent} 14%, ${p.surface})`,
    '--calendar-heat-medium': `color-mix(in srgb, ${a.accent} 28%, ${p.surface})`,
    '--calendar-heat-high': `color-mix(in srgb, ${a.accent} 45%, ${p.surface})`,
    '--calendar-deadline': p.danger,
    '--theme-danger': p.danger, '--theme-danger-wash': `color-mix(in srgb, ${p.danger} 12%, ${p.surface})`,
    '--theme-radius': `${parent.radius}px`,
    '--theme-shadow': parent.id === 'mini' || parent.id === 'hacker' ? 'none' : preferences.mode === 'dark' ? '0 16px 50px #00000040' : '0 16px 50px #16203314',
    '--theme-duration': a.animation === 'none' ? '0s' : a.animation === 'subtle' ? '.2s' : a.animation === 'tech' ? '.16s' : '.45s',
    '--theme-easing': a.animation === 'tech' ? 'steps(4, end)' : 'cubic-bezier(.2, .8, .2, 1)',
    '--theme-overlay': preferences.mode === 'dark' ? '#05080e99' : '#16203355'
  };
}
