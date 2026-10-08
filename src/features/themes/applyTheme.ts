import '../../styles/themes.css';
import { getThemeVariables, resolveTheme, type ThemePreferences } from './registry';

/** Apply to documentElement (or an isolated preview root). Returns an exact undo. */
export function applyTheme(preferences: ThemePreferences, target?: HTMLElement): () => void {
  const root = target ?? (typeof document === 'undefined' ? undefined : document.documentElement);
  if (!root) return () => {};
  const { preferences: normalized, parent, appearance } = resolveTheme(preferences);
  const variables = getThemeVariables(normalized);
  const attributes: Record<string, string> = {
    'data-rooz-theme': normalized.activeThemeId,
    'data-theme-parent': parent.id,
    'data-theme-mode': normalized.mode,
    'data-theme-animation': appearance.animation,
    'data-theme-effect': appearance.effect
  };
  const previousVariables = Object.keys(variables).map(key => [key, root.style.getPropertyValue(key), root.style.getPropertyPriority(key)]);
  const previousAttributes = Object.keys(attributes).map(key => [key, root.getAttribute(key)]);
  for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);
  for (const [key, value] of Object.entries(attributes)) root.setAttribute(key, value);
  return () => {
    for (const [key, value, priority] of previousVariables) {
      if (value) root.style.setProperty(key, value, priority);
      else root.style.removeProperty(key);
    }
    for (const [key, value] of previousAttributes) {
      if (value === null) root.removeAttribute(key!);
      else root.setAttribute(key!, value!);
    }
  };
}
