# Theme integration contract

Import from `src/features/themes` (the barrel imports `src/styles/themes.css`).

- `ThemePreferences`: `{ activeThemeId: string; mode: 'light' | 'dark'; customThemes: CustomTheme[] }`.
- `defaultThemePreferences`: Barbari, light, no custom themes.
- `normalizeThemePreferences(value: unknown): ThemePreferences`: validate persisted JSON on load; stale selections fall back to Barbari. Returns fresh data, strips unsupported values, and enforces Mini's no-motion/no-effect boundary in both modes.
- `themeRegistry`, `parentThemes`: Mini (`مینی`), Hacker (`هکر`), Barbari (`بربری`), with defaults and semantic palettes for each mode.
- `createCustomTheme(id, name, parentId)`: fresh defaults for both modes. Use a unique non-parent ID with letters, digits, underscores, or hyphens (maximum 80 characters).
- `normalizeThemeAppearance`, `resolveTheme`, `getThemeVariables`: pure helpers for inheritance, validation, and CSS token generation. Colors are six-digit hex values; gradients use a numeric angle from 0 to 360.
- `applyTheme(preferences, target?)`: apply tokens and attributes to `document.documentElement`, or an explicit HTMLElement. Returns an undo function restoring prior tokens, priorities, and attributes. Safe to call during SSR.
- `useTheme(preferences)`: mount once in App to apply the persisted selection, including before Settings opens. No storage is accessed by the theme module.
- Types: `ThemeMode`, `ParentThemeId`, `ThemeAnimation`, `ThemeEffect`, `ThemeBackground`, `ThemeAppearance`, `ThemePalette`, `ParentTheme`, `CustomTheme`.

A `CustomTheme` has `id`, `name`, `parentId`, and `modes.light` / `modes.dark`. Each mode has `background: { kind: 'solid' | 'gradient', color, endColor, angle }`, `accent`, `animation: 'none' | 'subtle' | 'full' | 'tech'`, and `effect: 'none' | 'acrylic' | 'liquid-glass'`. Semantic surface/text colors and geometry come from the parent.

## SettingsDialog

`SettingsDialogProps` is exported from `src/components/SettingsDialog.tsx`:

```ts
interface SettingsDialogProps {
  open: boolean;
  calendar: CalendarSystem;
  onCalendarChange: (calendar: CalendarSystem) => void | Promise<void>;
  onClose: () => void;
  theme: ThemePreferences;
  onThemeChange: (value: ThemePreferences) => Promise<void>;
  onClearMemory: () => Promise<void>;
}
```

App owns loading/persistence. Pass normalized preferences as `theme`; `onThemeChange` must persist the entire value, update App state, and reject on failure. Settings stages selections, custom creation/edit/deletion, and mode changes; the final save awaits this callback before closing. Cancel, Escape, backdrop dismissal, and unmount restore the latest persisted theme. Calendar changes are immediate and are not part of the theme draft.

`onClearMemory` runs only after the irreversible-delete confirmation. App must clear **all** local planner records and preferences (including themes), refresh/reset its state, and reject on failure. On success Settings restores `defaultThemePreferences` and closes. The component deliberately does not access repositories or localStorage directly.

CSS overrides are scoped by `data-rooz-theme`, alias legacy tokens to semantic tokens, honor reduced motion, and enforce Mini's restrictions independently of its effect/animation attributes. Acrylic and liquid glass fall back to solid surfaces without backdrop-filter support.

To add a parent, extend `ParentThemeId` and `themeRegistry` with both mode definitions; the parent selectors and custom-theme controls are registry-driven.
