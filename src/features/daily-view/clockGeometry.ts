export const CLOCK_SIZE = 560;
export const CENTER = CLOCK_SIZE / 2;
export const FACE_RADIUS = 180;
export const SPIRAL_INNER_RADIUS = 207;
export const SPIRAL_OUTER_RADIUS = 267;
export const DAY_MINUTES = 1440;
export const timeMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const clockAngle = (time: string) => timeMinutes(time) % 720 / 720 * Math.PI * 2 - Math.PI / 2;
export const pointAt = (angle: number, radius: number) => ({ x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius });
export const timePoint = (time: string, radius = FACE_RADIUS) => pointAt(clockAngle(time), radius);

// Two continuous turns: midnight at the inner end, noon halfway, next midnight at the outer end.
export function spiralPoint(time: string) {
  const minutes = Math.max(0, Math.min(DAY_MINUTES, timeMinutes(time)));
  const radius = SPIRAL_INNER_RADIUS + minutes / DAY_MINUTES * (SPIRAL_OUTER_RADIUS - SPIRAL_INNER_RADIUS);
  return pointAt(minutes / 720 * Math.PI * 2 - Math.PI / 2, radius);
}

export function rangePath(start: string, end: string) {
  const startMinutes = Math.max(0, Math.min(DAY_MINUTES, timeMinutes(start)));
  const endMinutes = Math.max(startMinutes, Math.min(DAY_MINUTES, timeMinutes(end)));
  const steps = Math.max(1, Math.ceil((endMinutes - startMinutes) / 3));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const minutes = startMinutes + (endMinutes - startMinutes) * index / steps;
    const radius = SPIRAL_INNER_RADIUS + minutes / DAY_MINUTES * (SPIRAL_OUTER_RADIUS - SPIRAL_INNER_RADIUS);
    const point = pointAt(minutes / 720 * Math.PI * 2 - Math.PI / 2, radius);
    return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
  }).join(' ');
}

export function layoutCards(items: { id: string; startTime: string }[], _side: 'left' | 'right', scale = 1) {
  const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const minGap = 68, minY = 30, maxY = CLOCK_SIZE * scale - 30;
  const positions = sorted.map(item => Math.max(minY, Math.min(maxY, timePoint(item.startTime).y * scale)));
  for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i], positions[i - 1] + minGap);
  for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - minGap);
  if (positions[0] < minY) for (let i = 0; i < positions.length; i++) positions[i] = minY + i * minGap;
  return new Map(sorted.map((item, index) => [item.id, positions[index]]));
}
