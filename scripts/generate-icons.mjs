// ============================================================
// PWA 图标生成 — 从 SVG 源生成各尺寸 PNG(动森色板:羊皮纸底+薄荷青硬币)
// 用法: node scripts/generate-icons.mjs
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = path.resolve('public/icons');

// 常规图标:圆角方底 + 青色硬币 + 白色 ¥(圆角笔触)
const glyph = `
  <path d="M196 148 L256 232 L316 148" stroke="#ffffff" stroke-width="30"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M256 232 V 348" stroke="#ffffff" stroke-width="30" stroke-linecap="round" fill="none"/>
  <path d="M206 276 H306" stroke="#ffffff" stroke-width="30" stroke-linecap="round" fill="none"/>
  <path d="M206 320 H306" stroke="#ffffff" stroke-width="30" stroke-linecap="round" fill="none"/>
`;

// 圆角方形(透明四角),launcher 图标
const roundedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#f7f3df"/>
  <circle cx="256" cy="256" r="150" fill="#19c8b9"/>
  ${glyph}
</svg>`;

// 满铺方形 + 硬币缩入 80% 安全区,maskable 用
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f7f3df"/>
  <circle cx="256" cy="256" r="120" fill="#19c8b9"/>
  <g transform="translate(0 -6) scale(0.8) translate(51.2 57.6)">${glyph}</g>
</svg>`;

async function render(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT_DIR, file));
  console.log(`✓ ${file} (${size}x${size})`);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'icon.svg'), roundedSvg.trim(), 'utf-8');
await render(roundedSvg, 192, 'pwa-192.png');
await render(roundedSvg, 512, 'pwa-512.png');
await render(maskableSvg, 512, 'maskable-512.png');
await render(maskableSvg, 180, 'apple-touch-icon.png');
console.log('完成');
