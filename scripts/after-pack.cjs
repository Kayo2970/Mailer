/**
 * after-pack.cjs — electron-builder hook.
 *
 * electron-builder never copies a folder named `node_modules` through
 * `extraResources`, so the Next.js standalone server would ship without its
 * dependencies and crash on launch. Copy them in explicitly after packing.
 */
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, '.next', 'standalone', 'node_modules');
  if (!fs.existsSync(src)) {
    throw new Error(`[after-pack] ${src} not found — run "npm run build:standalone" first.`);
  }
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources');
  const dst = path.join(resources, '.next', 'standalone', 'node_modules');
  fs.cpSync(src, dst, { recursive: true, dereference: true });
  console.log(`[after-pack] Copied standalone node_modules -> ${dst}`);
};
