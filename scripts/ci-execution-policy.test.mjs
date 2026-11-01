import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';
import { executionPolicy, selectJobs, successfulQueueRun } from './ci-execution-policy.mjs';

const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const event = { merge_group: { base_sha: base, head_sha: sha } };
const expected = (quality, browser, http, desktop, update, smartquotes = false, brand = false) =>
  ({ quality, browser, http, desktop, brand, update, smartquotes, reused: false });
const full = expected(true, true, true, true, true, true, true);

test('merge_group payloads apply the same path rules as PRs to the entire group diff', async () => {
  const cases = [
    [['docs/test/README.md'], expected(false, false, false, false, false)],
    [['apps/editor/src/App.tsx'], expected(true, true, true, true, false)],
    [['apps/desktop/installer/cli.nsh'], expected(true, false, false, true, true, false, true)],
    [['pnpm-lock.yaml'], full],
    // Multiple PRs in one group: take the union, including a deleted file.
    [['docs/test/README.md', 'apps/editor/src/App.tsx', 'apps/desktop/installer/cli.nsh'], expected(true, true, true, true, true, false, true)],
    [['packages/cli/src/cli.ts'], expected(true, false, true, true, false)],
    [['plugins/docling/src/convert.ts'], expected(true, false, true, true, false)],
    [['unknown/config.json'], expected(true, true, true, true, true, false, true)],
    [['apps/editor/document/fixture.md'], expected(true, true, true, true, false)],
    [['apps/editor/shared/desktop-bridge.ts'], expected(true, true, true, true, true)],
  ];
  for (const [paths, jobs] of cases) {
    const git = args => {
      assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', `${base}..${sha}`]);
      return paths.join('\0') + '\0';
    };
    assert.deepEqual(await executionPolicy('merge_group', event, { git }), jobs);
    assert.deepEqual(selectJobs('pull_request', paths), selectJobs('merge_group', paths));
  }
  assert.deepEqual(await executionPolicy('merge_group', event, { git: () => { throw new Error('missing history'); } }), full);
  assert.deepEqual(await executionPolicy('merge_group', { merge_group: { base_sha: '--bad', head_sha: sha } }), full);
  assert.deepEqual(await executionPolicy('merge_group', event, { git: () => '' }), full);
});

test('actual group diff includes successive PR commits, removed paths and both sides of renames', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'litzio-queue-policy-'));
  const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const commit = message => {
    git(['add', '-A']); git(['commit', '-qm', message]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  const policy = (base_sha, head_sha) => executionPolicy('merge_group', { merge_group: { base_sha, head_sha } }, { git });
  try {
    git(['init', '-q']); git(['config', 'user.name', 'CI test']); git(['config', 'user.email', 'ci@example.invalid']);
    mkdirSync(path.join(dir, 'apps/editor/src'), { recursive: true });
    writeFileSync(path.join(dir, 'apps/editor/src/App.tsx'), 'editor\n');
    writeFileSync(path.join(dir, 'README.md'), 'docs\n');
    const initial = commit('base');
    writeFileSync(path.join(dir, 'README.md'), 'docs PR\n');
    const docs = commit('docs PR');
    assert.deepEqual(await policy(initial, docs), expected(false, false, false, false, false));
    git(['mv', 'apps/editor/src/App.tsx', 'EDITOR.md']);
    const group = commit('second PR renames product file');
    assert.deepEqual(await policy(initial, group), expected(true, true, true, true, false));
    assert.deepEqual(await policy(docs, group), expected(true, true, true, true, false));
    assert.deepEqual(await policy('f'.repeat(40), group), full);
    // With divergent trees, base..head includes a removed installer that a
    // merge-base diff would omit. Queue policy must use the supplied base tree.
    git(['checkout', '-qb', 'base-branch', initial]);
    mkdirSync(path.join(dir, 'apps/desktop'), { recursive: true });
    writeFileSync(path.join(dir, 'apps/desktop/installer.nsh'), 'installer\n');
    const divergent = commit('base tree includes installer');
    assert.deepEqual(await policy(divergent, docs), expected(true, false, false, true, true, false, true));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const successful = { event: 'merge_group', head_sha: sha, conclusion: 'success', status: 'completed',
  html_url: 'https://github.com/litzio/litzio/actions/runs/123' };
const apiInputs = { repository: 'litzio/litzio', sha, token: 'test-token' };
const response = runs => async (url, options) => {
  assert.match(url, /\/actions\/workflows\/ci.yml\/runs\?event=merge_group&head_sha=a{40}&status=success/);
  assert.equal(options.headers.Authorization, 'Bearer test-token');
  return { ok: true, json: async () => ({ workflow_runs: runs }) };
};

test('only a successful same-SHA merge_group run in this workflow permits master push reuse', async () => {
  assert.deepEqual(await successfulQueueRun({ ...apiInputs, fetchRuns: response([successful]) }), successful);
  const result = await executionPolicy('push', { ref: 'refs/heads/master' }, { ...apiInputs, fetchRuns: response([successful]) });
  assert.deepEqual(result, { quality: false, browser: false, http: false, desktop: false, brand: false, update: false, smartquotes: false, reused: true });
  for (const candidate of [null, { ...successful, event: 'pull_request' }, { ...successful, head_sha: base },
    { ...successful, conclusion: 'failure' }, { ...successful, conclusion: 'cancelled' },
    { ...successful, status: 'in_progress' }, { ...successful, html_url: undefined }]) {
    assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/master' }, {
      ...apiInputs, fetchRuns: response(candidate ? [candidate] : []),
    }), full);
  }
  for (const fetchRuns of [async () => { throw new Error('API unavailable'); },
    async () => ({ ok: false, status: 403 }), async () => ({ ok: true, json: async () => ({}) })]) {
    assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/master' }, { ...apiInputs, fetchRuns }), full);
  }
  assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/master' }), full, 'missing token fails safe');
  assert.deepEqual(await executionPolicy('push', { ref: 'refs/heads/other' }, {
    ...apiInputs, fetchRuns: () => assert.fail('non-master push must not reuse queue CI'),
  }), full);
});

test('brand proof selects packaging, identity and dependency changes but skips ordinary product edits', () => {
  const selected = ['brand.ts', 'apps/desktop/src/main.ts', 'apps/desktop/installer/cli.nsh',
    'apps/desktop/assets/icon.ico', 'apps/desktop/scripts/package.ts', 'scripts/check-brand-build.ts',
    'package.json', 'packages/core/package.json', 'plugins/docling/package.json',
    'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches/markdown-it@13.0.2.patch',
    '.github/workflows/ci.yml', '.github/workflows/desktop-release.yml',
    'scripts/ci-execution-policy.mjs', 'scripts/ci-execution-policy.test.mjs',
    'scripts/ci-quality-mode.mjs', 'tsconfig.json', 'unknown/config.json'];
  const skipped = ['apps/editor/src/App.tsx', 'apps/editor/shared/desktop-bridge.ts',
    'apps/editor/src/shell/SettingsDialog.tsx', 'packages/core/src/index.ts',
    'packages/cli/src/cli.ts', 'plugins/docling/src/convert.ts', 'docs/guides/branding.md'];
  for (const event of ['pull_request', 'merge_group']) {
    for (const file of selected) assert.equal(selectJobs(event, [file]).brand, true, `${event}: ${file}`);
    for (const file of skipped) assert.equal(selectJobs(event, [file]).brand, false, `${event}: ${file}`);
    assert.equal(selectJobs(event, [...skipped, selected[0]]).brand, true, 'mixed group includes branding');
    assert.equal(selectJobs(event, []).brand, true, 'empty diff fails safe');
  }
});

test('smartquotes runs for dependency, patch and parser configuration changes, outside default Core tests', () => {
  for (const file of ['package.json', 'packages/core/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'patches/markdown-it@13.0.2.patch', 'patches/linkify-it@4.0.1.patch', 'packages/core/src/myst/parse.ts',
    'packages/core/src/myst/serialize.ts', 'packages/core/src/myst/footnote.ts',
    'packages/core/src/myst/literal-syntax.ts', 'packages/core/test/smartquotes-patch.test.ts']) {
    assert.equal(selectJobs('merge_group', [file]).smartquotes, true, file);
  }
  for (const file of ['docs/README.md', 'apps/editor/src/App.tsx', 'packages/core/src/index.ts',
    'packages/core/src/myst/figure.ts', 'packages/core/src/myst/table.ts',
    'packages/core/test/myst-regression.test.ts', 'scripts/ci-quality-mode.test.mjs']) {
    assert.equal(selectJobs('merge_group', [file]).smartquotes, false, file);
  }
  const { scripts } = JSON.parse(readFileSync(new URL('../packages/core/package.json', import.meta.url), 'utf8'));
  assert.ok(!scripts.test.includes('smartquotes'));
  assert.equal(scripts['test:smartquotes'], 'tsx --test test/smartquotes-patch.test.ts');
});

const workflow = () => load(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
test('cache-only master runs preserve pnpm OS stores and the exact Linux browser cache path and key', () => {
  const { jobs } = workflow();
  const warm = jobs['cache-warm'];
  assert.equal(warm.if, "needs.changes.outputs.reused == 'true'");
  assert.deepEqual(warm.strategy.matrix.os, jobs.http.strategy.matrix.os);
  assert.deepEqual(warm.strategy.matrix.include, jobs.http.strategy.matrix.include);
  const setup = warm.steps.find(step => step.uses?.startsWith('pnpm/action-setup@'));
  assert.deepEqual(setup, jobs.http.steps.find(step => step.uses?.startsWith('pnpm/action-setup@')));
  for (const name of ['Cache Playwright browsers', 'Install pinned Chromium']) {
    assert.deepEqual(warm.steps.find(step => step.name === name), jobs.http.steps.find(step => step.name === name));
  }
  assert.ok(warm.steps.some(step => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(!warm.steps.some(step => /test|package|build/.test(step.run ?? '')), 'cache warming must not repeat product validation');
});

test('aggregate accepts unselected skips but rejects failed, cancelled or skipped selected jobs', () => {
  const aggregate = workflow().jobs['quality-and-browser'];
  const script = aggregate.steps.find(step => step.name === 'Require all checks to pass').run;
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
  const defaults = { CHANGES_RESULT: 'success', QUALITY_RESULT: 'success', BROWSER_SELECTED: 'false', BROWSER_RESULT: 'skipped',
    HTTP_SELECTED: 'false', HTTP_RESULT: 'skipped', DESKTOP_SELECTED: 'false', DESKTOP_RESULT: 'skipped',
    BRAND_SELECTED: 'false', BRAND_RESULT: 'skipped', CACHE_SELECTED: 'false', CACHE_RESULT: 'skipped' };
  const run = env => spawnSync(bash, ['-c', script], { env: { ...process.env, ...defaults, ...env }, encoding: 'utf8' });
  assert.equal(run({}).status, 0, 'docs group');
  assert.equal(run({ CACHE_SELECTED: 'true', CACHE_RESULT: 'success' }).status, 0, 'reused push');
  for (const name of ['BROWSER', 'HTTP', 'DESKTOP', 'BRAND', 'CACHE']) {
    assert.equal(run({ [`${name}_SELECTED`]: 'true', [`${name}_RESULT`]: 'success' }).status, 0);
    for (const result of ['failure', 'cancelled', 'skipped']) {
      assert.equal(run({ [`${name}_SELECTED`]: 'true', [`${name}_RESULT`]: result }).status, 1, `${name}: ${result}`);
    }
    assert.equal(run({ [`${name}_RESULT`]: 'failure' }).status, 1);
  }
  assert.equal(run({ QUALITY_RESULT: 'skipped' }).status, 1);
  assert.equal(run({ CHANGES_RESULT: 'failure' }).status, 1);
  assert.equal(aggregate.steps.find(step => step.name === 'Reject a cancelled workflow').if, '${{ cancelled() }}');
});

test('brand proof runs independently and release publication waits without sharing its artifacts', () => {
  const ci = workflow();
  const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  assert.equal(ci.jobs.changes.outputs.brand, '${{ steps.policy.outputs.brand }}');
  assert.equal(ci.jobs.brand.needs, 'changes');
  assert.equal(ci.jobs.brand.if, "needs.changes.outputs.brand == 'true'");
  assert.ok(ci.jobs['quality-and-browser'].needs.includes('brand'));
  const aggregateEnv = ci.jobs['quality-and-browser'].steps.find(step => step.name === 'Require all checks to pass').env;
  assert.equal(aggregateEnv.BRAND_SELECTED, '${{ needs.changes.outputs.brand }}');
  assert.equal(aggregateEnv.BRAND_RESULT, '${{ needs.brand.result }}');
  assert.ok(!ci.jobs.desktop.steps.some(step => step.run?.includes('check-brand-build.ts')));
  for (const job of [ci.jobs.brand, release.jobs.brand]) {
    assert.equal(job['runs-on'], 'windows-latest');
    const commands = job.steps.filter(step => step.run).map(step => step.run);
    assert.deepEqual(commands, ['pnpm install --frozen-lockfile', 'pnpm --filter @litzio/desktop package',
      'pnpm exec tsx scripts/check-brand-build.ts']);
    assert.ok(job.steps.filter(step => step.run).every(step => step.if === undefined));
    const uploads = job.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].with.name, 'brand-config');
    assert.equal(uploads[0].if, 'always()');
    assert.equal(uploads[0].with['retention-days'], 7);
    assert.deepEqual(uploads[0].with.path.trim().split('\n'), [
      'tmp/brand-build/proof.json', 'tmp/brand-build/alternate-640-ko-dark.png']);
  }
  assert.equal(release.jobs.brand.needs, 'preflight');
  assert.equal(release.jobs.brand.if, undefined, 'every release mode checks the alternate brand');
  assert.deepEqual(release.jobs.brand.steps.find(step => step.uses?.startsWith('actions/checkout@')).with,
    { ref: '${{ needs.preflight.outputs.commit }}', 'persist-credentials': false });
  assert.equal(release.jobs.brand.environment, undefined, 'brand proof has no signing secrets');
  assert.ok(release.jobs.publish.needs.includes('brand'));
  assert.ok(!release.jobs.build.steps.some(step => step.run?.includes('check-brand-build.ts')),
    'brand packaging must never overwrite the artifacts selected for publication');
});
