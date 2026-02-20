/**
 * postinstall: node_modules에 로컬 패키지(packages/*) 링크 생성.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const nodeModules = path.join(appRoot, 'node_modules');
const packagesDir = path.join(appRoot, 'packages');

const localPackages = [
  'expo-acrcloud-module',
  'expo-media-session-module',
  'expo-media-store-module',
  'expo-share-url-module',
  'expo-shazam-module',
];

localPackages.forEach((name) => {
  const target = path.join(packagesDir, name);
  const linkPath = path.join(nodeModules, name);

  if (!fs.existsSync(target)) {
    console.warn(`[link-local-packages] skip ${name}: packages/${name} not found`);
    return;
  }

  if (fs.existsSync(linkPath)) {
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(linkPath);
        if (path.resolve(resolved) === path.resolve(target)) {
          return;
        }
      }
    } catch (_) {}
  }

  try {
    if (fs.existsSync(linkPath)) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    const targetPath = process.platform === 'win32' ? path.resolve(target) : path.relative(path.dirname(linkPath), target);
    fs.symlinkSync(targetPath, linkPath, type);
    console.log(`[link-local-packages] linked: node_modules/${name} -> packages/${name}`);
  } catch (e) {
    console.warn(`[link-local-packages] failed to link ${name}:`, e.message);
  }
});
