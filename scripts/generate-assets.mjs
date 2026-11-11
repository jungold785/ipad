/*
 * Generates the app icons and the placeholder photos.
 *
 * Zero dependencies on purpose: this repo ships static files and has no
 * package.json, so the assets are produced by a small hand-rolled PNG encoder.
 *
 *   node scripts/generate-assets.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------ PNG encoder */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, shade) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const rgb = shade(x, y);
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      offset += 3;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ icons */

const BG = [11, 15, 20];
const ACCENT = [88, 199, 255];

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function iconSample(px, py, size) {
  const cx = size / 2;
  const cy = size / 2;
  const ringRadius = size * 0.33;
  const ringWidth = size * 0.06;
  const handWidth = size * 0.05;
  const handLength = size * 0.22;

  const distance = Math.hypot(px - cx, py - cy);
  if (Math.abs(distance - ringRadius) <= ringWidth / 2) {
    return ACCENT;
  }

  const minuteEnd = {
    x: cx + Math.sin(0.9) * handLength,
    y: cy - Math.cos(0.9) * handLength,
  };
  const hourEnd = { x: cx, y: cy - handLength * 0.72 };
  const onMinute = segmentDistance(px, py, cx, cy, minuteEnd.x, minuteEnd.y) <= handWidth / 2;
  const onHour = segmentDistance(px, py, cx, cy, hourEnd.x, hourEnd.y) <= handWidth / 2;
  if (onMinute || onHour) {
    return ACCENT;
  }

  return BG;
}

function makeIcon(size) {
  const samples = 3;
  return (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let sy = 0; sy < samples; sy += 1) {
      for (let sx = 0; sx < samples; sx += 1) {
        const px = x + (sx + 0.5) / samples;
        const py = y + (sy + 0.5) / samples;
        const rgb = iconSample(px, py, size);
        r += rgb[0];
        g += rgb[1];
        b += rgb[2];
      }
    }
    const total = samples * samples;
    return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
  };
}

/* ----------------------------------------------------------- placeholder */

function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeGradient(width, height, base, blobs) {
  const span = Math.max(width, height);
  return (x, y) => {
    let r = base[0];
    let g = base[1];
    let b = base[2];
    for (let i = 0; i < blobs.length; i += 1) {
      const blob = blobs[i];
      const dx = (x - blob.x * width) / (blob.r * span);
      const dy = (y - blob.y * height) / (blob.r * span);
      const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const weight = falloff * falloff * blob.weight;
      r += blob.color[0] * weight;
      g += blob.color[1] * weight;
      b += blob.color[2] * weight;
    }
    return [clamp255(r), clamp255(g), clamp255(b)];
  };
}

/* ------------------------------------------------------------------ build */

function write(relativePath, buffer) {
  const target = join(ROOT, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  process.stdout.write('wrote ' + relativePath + '\n');
}

write('docs/icons/icon-180.png', encodePng(180, 180, makeIcon(180)));
write('docs/icons/icon-192.png', encodePng(192, 192, makeIcon(192)));

const WIDTH = 1024;
const HEIGHT = 768;

write(
  'docs/photos/sample-1.png',
  encodePng(
    WIDTH,
    HEIGHT,
    makeGradient(WIDTH, HEIGHT, [8, 14, 26], [
      { x: 0.28, y: 0.32, r: 0.62, weight: 1.15, color: [26, 92, 168] },
      { x: 0.74, y: 0.66, r: 0.55, weight: 0.95, color: [18, 168, 166] },
      { x: 0.52, y: 0.14, r: 0.34, weight: 0.55, color: [96, 176, 255] },
    ])
  )
);

write(
  'docs/photos/sample-2.png',
  encodePng(
    WIDTH,
    HEIGHT,
    makeGradient(WIDTH, HEIGHT, [22, 10, 32], [
      { x: 0.68, y: 0.3, r: 0.58, weight: 1.1, color: [126, 40, 168] },
      { x: 0.24, y: 0.74, r: 0.6, weight: 0.95, color: [188, 44, 122] },
      { x: 0.5, y: 0.5, r: 0.3, weight: 0.5, color: [232, 118, 188] },
    ])
  )
);

write(
  'docs/photos/sample-3.png',
  encodePng(
    WIDTH,
    HEIGHT,
    makeGradient(WIDTH, HEIGHT, [34, 16, 8], [
      { x: 0.34, y: 0.68, r: 0.6, weight: 1.15, color: [214, 104, 40] },
      { x: 0.72, y: 0.3, r: 0.5, weight: 0.9, color: [168, 54, 70] },
      { x: 0.5, y: 0.52, r: 0.26, weight: 0.6, color: [255, 186, 92] },
    ])
  )
);

