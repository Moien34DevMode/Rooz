export type SelectRect = { left: number; right: number; top: number; bottom: number; width: number };
export type SelectViewport = { width: number; height: number; offsetLeft?: number; offsetTop?: number };
export type SelectPlacement = { left: number; top: number; width: number; maxHeight: number; height: number; side: 'above' | 'below' };

/** All coordinates are layout-viewport CSS pixels, including visualViewport offsets. */
export function placeSelectMenu({
  trigger, viewport, menuHeight, direction = 'ltr', minWidth = 160, maxHeight = 280, padding = 12, gap = 6,
}: {
  trigger: SelectRect;
  viewport: SelectViewport;
  menuHeight: number;
  direction?: 'ltr' | 'rtl';
  minWidth?: number;
  maxHeight?: number;
  padding?: number;
  gap?: number;
}): SelectPlacement {
  const viewportWidth = Math.max(0, viewport.width);
  const viewportHeight = Math.max(0, viewport.height);
  const insetX = Math.min(Math.max(0, padding), viewportWidth / 2);
  const insetY = Math.min(Math.max(0, padding), viewportHeight / 2);
  const leftBound = (viewport.offsetLeft ?? 0) + insetX;
  const rightBound = (viewport.offsetLeft ?? 0) + viewportWidth - insetX;
  const topBound = (viewport.offsetTop ?? 0) + insetY;
  const bottomBound = (viewport.offsetTop ?? 0) + viewportHeight - insetY;
  const width = Math.min(Math.max(0, trigger.width, minWidth), rightBound - leftBound);
  const left = Math.max(leftBound, Math.min(direction === 'rtl' ? trigger.right - width : trigger.left, rightBound - width));
  const below = Math.max(0, bottomBound - Math.max(topBound, trigger.bottom + gap));
  const above = Math.max(0, Math.min(bottomBound, trigger.top - gap) - topBound);
  const desiredHeight = Math.min(Math.max(0, menuHeight), Math.max(0, maxHeight));
  const side = desiredHeight <= below || below >= above ? 'below' : 'above';
  const available = side === 'below' ? below : above;
  const limit = Math.min(Math.max(0, maxHeight), available);
  const height = Math.min(desiredHeight, limit);
  const preferredTop = side === 'below' ? trigger.bottom + gap : trigger.top - gap - height;
  const top = Math.max(topBound, Math.min(preferredTop, bottomBound - height));
  return { left, top, width, maxHeight: limit, height, side };
}
