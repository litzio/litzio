// Master push cache-warm only: use the pinned builder's own downloads/checksums, without packaging.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

if (process.platform !== 'win32') throw new Error('Desktop download cache warming requires Windows');
const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const { downloadElectronArtifactZip } = builder('app-builder-lib/out/util/electronGet.js');
const { getMakeNsisPath, getNsisPluginsPath, getRceditBundle } = builder('app-builder-lib/out/toolsets/windows.js');
const { devDependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await downloadElectronArtifactZip({ artifactName: 'electron', version: devDependencies.electron, platformName: 'win32', arch: 'x64' });
// packageConfiguration uses the default toolsets; let the installed builder select their versions.
await getMakeNsisPath();
await getNsisPluginsPath();
await getRceditBundle();
