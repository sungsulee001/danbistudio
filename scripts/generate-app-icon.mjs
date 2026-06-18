import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

const rootDir = process.cwd();
const outputDir = join(rootDir, 'build');
const icoPath = join(outputDir, 'icon.ico');
const pngPath = join(outputDir, 'icon.png');
const svgPath = join(outputDir, 'icon.svg');
const sizes = [16, 24, 32, 48, 64, 128, 256];
let crcTable;

mkdirSync(outputDir, { recursive: true });

const pngImages = sizes.map((size) => ({
  size,
  data: buildPng(size),
}));

writeFileSync(pngPath, pngImages[pngImages.length - 1].data);
writeFileSync(icoPath, buildIco(pngImages));
writeFileSync(svgPath, buildSvg());

console.log(`Generated Danbi Studio app icons in ${outputDir}`);

function buildPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const center = (size - 1) / 2;
  const radius = size * 0.46;
  const innerRadius = size * 0.28;

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const normalizedY = y / Math.max(1, size - 1);
      const stripe = Math.abs(Math.sin(angle * 3 + distance * 0.16));

      let color = [7, 10, 18, 0];
      if (distance <= radius) {
        const edge = Math.min(1, Math.max(0, (radius - distance) / (size * 0.12)));
        const glow = Math.max(0, 1 - distance / radius);
        color = [
          Math.round(20 + 18 * glow + 30 * normalizedY),
          Math.round(34 + 92 * glow),
          Math.round(46 + 105 * edge),
          255,
        ];

        if (Math.abs(dx) < size * 0.08 && y > size * 0.2 && y < size * 0.8) {
          color = [236, 253, 245, 255];
        }

        if (Math.abs(dy) < size * 0.08 && x > size * 0.2 && x < size * 0.8) {
          color = [52, 211, 153, 255];
        }

        if (distance < innerRadius && stripe > 0.72) {
          color = [125, 211, 252, 255];
        }
      }

      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.concat([
      u32be(size),
      u32be(size),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(images) {
  const directorySize = 6 + images.length * 16;
  let imageOffset = directorySize;
  const entries = [];

  for (const image of images) {
    const widthByte = image.size >= 256 ? 0 : image.size;
    entries.push(Buffer.concat([
      Buffer.from([widthByte, widthByte, 0, 0]),
      u16(1),
      u16(32),
      u32le(image.data.length),
      u32le(imageOffset),
    ]));
    imageOffset += image.data.length;
  }

  return Buffer.concat([
    u16(0),
    u16(1),
    u16(images.length),
    ...entries,
    ...images.map((image) => image.data),
  ]);
}

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Danbi Studio">
  <defs>
    <linearGradient id="bg" x1="36" x2="220" y1="24" y2="232" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="0.48" stop-color="#115e59"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="#020617"/>
  <circle cx="128" cy="128" r="104" fill="url(#bg)"/>
  <path d="M128 52v152M52 128h152" stroke="#ecfdf5" stroke-width="24" stroke-linecap="round"/>
  <path d="M76 86c28 30 76 30 104 0M76 170c28-30 76-30 104 0" fill="none" stroke="#7dd3fc" stroke-width="18" stroke-linecap="round"/>
</svg>
`;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    u32be(data.length),
    typeBuffer,
    data,
    u32be(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32be(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function u32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }

  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
