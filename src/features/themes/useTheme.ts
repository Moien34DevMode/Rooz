import { useEffect } from 'react';
import { applyTheme } from './applyTheme';
import type { ThemePreferences } from './registry';

/** Mount once in the app shell with preferences owned by App persistence. */
export function useTheme(preferences: ThemePreferences): void {
  useEffect(() => applyTheme(preferences), [preferences]);
}
