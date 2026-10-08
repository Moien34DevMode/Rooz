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

A `CustomTheme` has `id`, `name`, `parentId`, `linkModes` (default `true`), and `modes.light` / `modes.dark`. Shared edits use `updateCustomAppearance`; mode toggles use `switchThemeMode`, keeping the displayed customization instead of resetting to another mode's defaults. `setCustomModeLink` explicitly links/unlinks appearances. With `linkModes: false`, each mode is independently editable. Existing stored mode values are preserved on load; switching a shared theme synchronizes the current appearance in the draft, and only an explicit save persists it. Each mode has `background: { kind: 'solid' | 'gradient', color, endColor, angle }`, `accent`, `animation: 'none' | 'subtle' | 'full' | 'tech'`, and `effect: 'none' | 'acrylic' | 'liquid-glass'`. Geometry comes from the parent. Custom surfaces, raised surfaces, borders, and muted colors are derived from the chosen background (both gradient endpoints), with neutral light/dark anchors for readability. Changing only the accent recolors focus/selection/heatmap tokens, not the background surfaces. Built-in themes retain their default palettes.

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

App owns loading/persistence. Pass normalized preferences as `theme`; `onThemeChange` must persist the entire value, update App state, and reject on failure. Settings stages selections, custom creation/edit/deletion, and mode changes; the single save action works directly from the editor, validates name/colors, and awaits this callback before closing. The shell has stable header/footer regions and a single `.settings-scroll` content region; compact color controls expand one at a time and the desktop preview sits beside grouped fields. Cancel, Escape, backdrop dismissal, and unmount restore the latest persisted theme. Calendar changes are immediate and are not part of the theme draft.

`onClearMemory` runs only after the irreversible-delete confirmation. App must clear **all** local planner records and preferences (including themes), refresh/reset its state, and reject on failure. On success Settings restores `defaultThemePreferences` and closes. The component deliberately does not access repositories or localStorage directly.

CSS overrides are scoped by `data-rooz-theme`, alias legacy tokens to semantic tokens, honor reduced motion, and enforce Mini's restrictions independently of its effect/animation attributes. Acrylic and liquid glass share a single material contract across daily/calendar panels, calendar summaries/month cards, dialogs, and the editor preview. Acrylic is a grain-textured, desaturated frosted surface; liquid glass is more transparent, with saturated backdrop blur and illuminated edges (a CSS glass treatment, not physical optical refraction). Background color fields make transparency visible even on a solid backdrop. Both fall back to solid surfaces without backdrop-filter support. Material opacity adapts to the background palette to protect readability when switching modes. Dialog chrome shares the shell material; footer backgrounds and negative sticky offsets are not used.

Motion has distinct soft/full/stepped panel entrances and hover feedback; full/tech modes also animate the small editor preview ornament. The animation-none, mini, and reduced-motion modes disable motion. Theme color controls are inline, use token-based presets plus saturation/value and hue controls, accept validated HEX text, and never open a native browser color popup. Dropdowns use the shared `SelectField`: native manual popovers promote menus to the browser top layer while retaining dialog DOM ownership; older browsers use a body portal with `aria-owns`. Viewport geometry uses actual menu size and handles scrolling/resizing/finite entrance animations. Options have an opaque surface, focus stays on the combobox, keyboard navigation scrolls only the list, and Escape closes a dropdown before its dialog. `useDialogFocus` manages focus containment and body scroll locking for settings, task creation and task management.

To add a parent, extend `ParentThemeId` and `themeRegistry` with both mode definitions; the parent selectors and custom-theme controls are registry-driven.
