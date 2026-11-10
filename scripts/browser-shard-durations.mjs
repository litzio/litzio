// Manual refresh: node scripts/browser-shard-durations.mjs <5..10 successful CI run IDs>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { STABLE_SCENARIOS, partitionBrowserScenarios } from '../apps/editor/test/browser/scenarios.ts';

const runs = process.argv.slice(2);
if (runs.length < 5 || runs.length > 10 || new Set(runs).size !== runs.length || runs.some(id => !/^\d+$/.test(id))) {
  throw new Error('Supply 5..10 distinct successful CI run IDs, newest first. Requires gh authentication.');
}
const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
const samples = Object.fromEntries(STABLE_SCENARIOS.map(name => [name, []]));
for (const id of runs) {
  const run = JSON.parse(gh(['api', `repos/litzio/litzio/actions/runs/${id}`]));
  if (run.conclusion !== 'success' || run.path !== '.github/workflows/ci.yml') throw new Error(`${id}: not a successful CI run`);
  const seen = new Map();
  for (const line of gh(['run', 'view', id, '--repo', 'litzio/litzio', '--log']).split('\n')) {
    if (!line.startsWith('Editor browser regressions (')) continue;
    const match = /scenarios\.spec\.ts:\d+:\d+ › ([\w-]+) \(([\d.]+)(ms|s|m)\)/.exec(line);
    if (!match || !Object.hasOwn(samples, match[1])) continue;
    if (seen.has(match[1])) throw new Error(`${id}: duplicate scenario ${match[1]}`);
    seen.set(match[1], Number(match[2]) * ({ ms: 0.001, s: 1, m: 60 }[match[3]]));
  }
  // Never silently train on documentation-only or incomplete runs.
  for (const name of STABLE_SCENARIOS) {
    if (!seen.has(name)) throw new Error(`${id}: missing ${name}; choose a complete successful run`);
    samples[name].push(seen.get(name));
  }
  console.log(`${id}: ${seen.size} scenarios`);
}
const seconds = Object.fromEntries(Object.keys(samples).sort().map(name => {
  const sorted = samples[name].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return [name, Math.round(median * 1000) / 1000];
}));
writeFileSync(new URL('../apps/editor/test/browser/scenario-durations.json', import.meta.url),
  JSON.stringify({ runs, seconds }, null, 2) + '\n');
for (const count of [8, 12]) {
  const weighted = partitionBrowserScenarios(STABLE_SCENARIOS, count, seconds);
  const roundRobin = Array.from({ length: count }, (_, index) => STABLE_SCENARIOS.filter((_, i) => i % count === index));
  const totals = groups => groups.map(group => Math.round(group.reduce((sum, name) => sum + seconds[name], 0) * 10) / 10);
  console.log(`${count} shards: round-robin ${JSON.stringify(totals(roundRobin))}; weighted ${JSON.stringify(totals(weighted))}`);
}
