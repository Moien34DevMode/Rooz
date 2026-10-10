import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

export const iconSpecs = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false }
];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

// A day-planner clock and checkmark, rasterized with 2x2 supersampling.
// All maskable artwork stays inside the central 40%-radius safe circle.
export function renderIcon(size, maskable = false) {
  const background = [245, 246, 243];
  const green = [81, 115, 101];
  const paper = [234, 240, 236];
  const scale = maskable ? 0.72 : 1;
  function color(x, y) {
    x = (x - 0.5) / scale;
    y = (y - 0.5) / scale;
    const radius = Math.hypot(x, y);
    if (radius > 0.36) return background;
    if (radius > 0.325) return green;
    if (segmentDistance(x, y, 0, -0.20, 0, 0) < 0.019 ||
        segmentDistance(x, y, 0, 0, 0.13, 0.075) < 0.019) return green;
    if (segmentDistance(x, y, -0.14, 0.16, -0.075, 0.22) < 0.018 ||
        segmentDistance(x, y, -0.075, 0.22, 0.06, 0.105) < 0.018) return green;
    if (Math.abs(x) < 0.013 && Math.abs(y) > 0.265 ||
        Math.abs(y) < 0.013 && Math.abs(x) > 0.265) return green;
    return paper;
  }
  const raster = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (const sy of [0.25, 0.75]) {
        for (const sx of [0.25, 0.75]) {
          const sample = color((x + sx) / size, (y + sy) / size);
          sample.forEach((value, channel) => { sum[channel] += value; });
        }
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      sum.forEach((value, channel) => { raster[offset + channel] = Math.round(value / 4); });
      raster[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6; // RGBA, no palette or platform-dependent fonts.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raster)), chunk('IEND', Buffer.alloc(0))
  ]);
}

export async function generateIcons(directory = new URL('../public/icons/', import.meta.url)) {
  await mkdir(directory, { recursive: true });
  for (const { name, size, maskable } of iconSpecs) {
    await writeFile(new URL(name, directory), renderIcon(size, maskable));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateIcons();
}
