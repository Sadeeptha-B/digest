// Generates PWA/app icons from inline SVG into ./public.
// Run: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = '#0a0a0b'
// Keep in sync with the `accent-400` token in tailwind.config.js.
const FG = '#7faf93'

// "any" icon: rounded square with a play glyph (transparent corners).
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${BG}"/>
  <path d="M200 150 L380 256 L200 362 Z" fill="${FG}"/>
</svg>`

// "maskable" icon: full-bleed background, glyph kept within the ~80% safe zone.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <path d="M214 184 L356 256 L214 328 Z" fill="${FG}"/>
</svg>`

const targets = [
  { svg: anySvg, size: 192, file: 'pwa-192x192.png' },
  { svg: anySvg, size: 512, file: 'pwa-512x512.png' },
  { svg: maskableSvg, size: 512, file: 'pwa-maskable-512x512.png' },
  { svg: maskableSvg, size: 180, file: 'apple-touch-icon.png' },
]

for (const { svg, size, file } of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(publicDir, file))
  console.log(`wrote ${file} (${size}×${size})`)
}
