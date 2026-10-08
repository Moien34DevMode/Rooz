export interface HSV { h: number; s: number; v: number }
export interface RGB { r: number; g: number; b: number }

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const hue = (value: number) => Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;

/** Accept only opaque hex colors; canonical values match the theme registry. */
export function normalizeHex(value: string): string | null {
  const text = value.trim();
  if (/^#[\da-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(text)) return `#${[...text.slice(1)].map(char => char + char).join('')}`.toLowerCase();
  return null;
}

export function hexToRgb(value: string): RGB | null {
  const hex = normalizeHex(value);
  return hex ? { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) } : null;
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const [red, green, blue] = [r, g, b].map(channel => clamp(channel, 0, 255) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const h = delta === 0 ? 0 : max === red ? 60 * ((green - blue) / delta) : max === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  return { h: hue(h), s: max === 0 ? 0 : delta / max * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const sector = hue(h) / 60;
  const saturation = clamp(s) / 100;
  const value = clamp(v) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(sector % 2 - 1));
  const m = value - chroma;
  const channels = sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x] : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const [r, g, b] = channels.map(channel => Math.round((channel + m) * 255));
  return { r, g, b };
}

export function hexToHsv(value: string): HSV | null {
  const rgb = hexToRgb(value);
  return rgb ? rgbToHsv(rgb) : null;
}

export const hsvToHex = (value: HSV) => rgbToHex(hsvToRgb(value));

/** Pointer coordinates are physical (left/right), independent of document direction. */
export function pointToSV(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): Pick<HSV, 's' | 'v'> {
  return { s: clamp((x - rect.left) / Math.max(1, rect.width) * 100), v: 100 - clamp((y - rect.top) / Math.max(1, rect.height) * 100) };
}

export function moveSV(value: HSV, key: string, step = 1): HSV | null {
  switch (key) {
    case 'ArrowLeft': return { ...value, s: clamp(value.s - step) };
    case 'ArrowRight': return { ...value, s: clamp(value.s + step) };
    case 'ArrowDown': return { ...value, v: clamp(value.v - step) };
    case 'ArrowUp': return { ...value, v: clamp(value.v + step) };
    case 'Home': return { ...value, s: 0 };
    case 'End': return { ...value, s: 100 };
    case 'PageDown': return { ...value, v: clamp(value.v - 10) };
    case 'PageUp': return { ...value, v: clamp(value.v + 10) };
    default: return null;
  }
}
