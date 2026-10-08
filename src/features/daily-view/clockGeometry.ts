export const CLOCK_SIZE = 560;
export const CENTER = CLOCK_SIZE / 2;
export const FACE_RADIUS = 180;
export const AM_ARC_RADIUS = 207;
export const PM_ARC_RADIUS = 230;
export const AM_TASK_RADIUS = 252;
export const PM_TASK_RADIUS = 270;
export const clockAngle = (time: string) => { const [h, m] = time.split(':').map(Number); return ((h % 12) * 60 + m) / 720 * Math.PI * 2 - Math.PI / 2; };
export const pointAt = (angle: number, radius: number) => ({ x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius });
export const timePoint = (time: string, radius = FACE_RADIUS) => pointAt(clockAngle(time), radius);
export function rangePath(start: string, end: string, radius = PM_ARC_RADIUS) {
  const startAngle = clockAngle(start); let endAngle = clockAngle(end);
  if (endAngle <= startAngle) endAngle += Math.PI * 2;
  const a = pointAt(startAngle, radius), b = pointAt(endAngle, radius);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
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
