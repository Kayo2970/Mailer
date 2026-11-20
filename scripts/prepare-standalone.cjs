/**
 * prepare-standalone.cjs — copies public assets and static files into .next/standalone
 * so that Next.js standalone runs completely self-contained in production.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standalone)) {
  console.error('[prepare-standalone] .next/standalone directory not found. Did you run next build with output: standalone?');
  process.exit(1);
}

// 1. Copy public/ -> .next/standalone/public/
const srcPublic = path.join(root, 'public');
const dstPublic = path.join(standalone, 'public');
if (fs.existsSync(srcPublic)) {
  fs.cpSync(srcPublic, dstPublic, { recursive: true });
  console.log('[prepare-standalone] Copied public/ -> .next/standalone/public/');
}

// 2. Copy .next/static/ -> .next/standalone/.next/static/
const srcStatic = path.join(root, '.next', 'static');
const dstStatic = path.join(standalone, '.next', 'static');
if (fs.existsSync(srcStatic)) {
  fs.cpSync(srcStatic, dstStatic, { recursive: true });
  console.log('[prepare-standalone] Copied .next/static/ -> .next/standalone/.next/static/');
}

console.log('[prepare-standalone] Standalone bundle ready for Electron packaging.');
