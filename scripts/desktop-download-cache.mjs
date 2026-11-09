// CI download cache configuration and master-only warming; never package or install the product.
import { createRequire } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') throw new Error('Desktop download cache requires Windows');
const manifest = new URL('../apps/desktop/package.json', import.meta.url);
const { devDependencies } = JSON.parse(readFileSync(manifest, 'utf8'));
if (process.argv[2] === 'configure') {
  // @electron/get uses this default, rather than ELECTRON_CACHE. Keep its native cache layout.
  appendFileSync(process.env.GITHUB_OUTPUT,
    `electron-cache=${path.join(process.env.LOCALAPPDATA, 'electron', 'Cache')}\n` +
    `versions=electron-${devDependencies.electron}-builder-${devDependencies['electron-builder']}\n`);
  appendFileSync(process.env.GITHUB_ENV,
    `ELECTRON_BUILDER_CACHE=${path.join(process.env.RUNNER_TEMP, 'electron-builder-cache')}\n`);
} else if (process.argv[2] === 'warm') {
  // Reuse the pinned builder's download functions/checksums without packaging.
  const require = createRequire(manifest);
  const builder = createRequire(require.resolve('electron-builder'));
  const { downloadElectronArtifactZip } = builder('app-builder-lib/out/util/electronGet.js');
  const { getMakeNsisPath, getNsisPluginsPath, getRceditBundle } = builder('app-builder-lib/out/toolsets/windows.js');
  await downloadElectronArtifactZip({ artifactName: 'electron', version: devDependencies.electron, platformName: 'win32', arch: 'x64',
    electronDownload: { force: false, checksums: require('electron/checksums.json') } });
  // packageConfiguration uses default toolsets; let the installed builder select their versions.
  await getMakeNsisPath();
  await getNsisPluginsPath();
  await getRceditBundle();
} else {
  throw new Error('Expected configure or warm');
}
