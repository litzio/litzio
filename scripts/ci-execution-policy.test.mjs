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
const expected = (quality, browser, http, desktop, update, smartquotes = false, fullLayout = update) =>
  ({ quality, browser, http, desktop, update, fullLifecycle: update, fullLayout, smartquotes, reused: false });
const full = expected(true, true, true, true, true, true);
test('merge_group payloads apply the same path rules as PRs to the entire group diff', async () => {
  const cases = [
    [['docs/test/README.md'], expected(false, false, false, false, false)],
    [['apps/editor/src/App.tsx'], expected(true, true, true, true, false, false, true)],
    [['apps/desktop/installer/cli.nsh'], expected(true, false, false, true, true, false)],
    [['pnpm-lock.yaml'], full],
    // Multiple PRs in one group: take the union, including a deleted file.
    [['docs/test/README.md', 'apps/editor/src/App.tsx', 'apps/desktop/installer/cli.nsh'], expected(true, true, true, true, true, false)],
    [['packages/cli/src/cli.ts'], expected(true, false, true, true, false)],
    [['packages/core/src/write.ts'], expected(true, true, true, true, false)],
    [['apps/editor/src/components/ui/settings.tsx'], expected(true, true, true, true, false, false, true)],
    [['apps/editor/shared/ai.ts'], expected(true, true, true, true, false, false, true)],
    [['apps/editor/server/ai-host.ts'], expected(true, true, true, true, false)],
    [['apps/editor/package.json'], expected(true, true, true, true, false, false, true)],
    [['apps/editor/package.json'], expected(true, true, true, true, false, false, true)],
    [['.agents/skills/litzio-orchestrator/scripts/pr-gate.mjs'], expected(false, false, false, false, false)],
    [['.agents/skills/litzio-orchestrator/SKILL.md'], expected(false, false, false, false, false)],
    [['.agents/skills/litzio-orchestrator/agents/openai.yaml'], expected(false, false, false, false, false)],
    [['.agents/skills/litzio-orchestrator/SKILL.md', 'apps/editor/server/ai-host.ts'], expected(true, true, true, true, false)],
    [['apps/editor/src/components/ui/settings.tsx', 'apps/desktop/src/main.ts'], expected(true, true, true, true, true, false)],
    [['.agents/other/config.json'], expected(true, true, true, true, true, false)],
    [['unknown/config.json'], expected(true, true, true, true, true, false)],
    [['apps/editor/document/fixture.md'], expected(true, true, true, true, false)],
    [['apps/editor/shared/desktop-bridge.ts'], { ...expected(true, true, true, true, true), fullLifecycle: false }],
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
test('only audited policy tooling skips product jobs, with mixed changes taking the union', () => {
  const policyPaths = [
    'scripts/issues.mjs', 'scripts/issue-policy.mjs', 'scripts/issue-policy.test.mjs',
    'scripts/check-issue-event.mjs', 'scripts/check-docs.ts', 'scripts/check-docs.test.ts',
    'scripts/ci-execution-policy.mjs', 'scripts/ci-execution-policy.test.mjs',
    'scripts/ci-quality-mode.mjs', 'scripts/ci-quality-mode.test.mjs',
    '.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/decision.yml',
    '.github/ISSUE_TEMPLATE/enhancement.yml', '.github/ISSUE_TEMPLATE/task.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.agents/skills/litzio-orchestrator/scripts/pr-gate.mjs',
    '.claude/skills/litzio-orchestrator/SKILL.md',
  ];
  const { reused, ...none } = expected(false, false, false, false, false);
  for (const eventName of ['pull_request', 'merge_group']) {
    assert.deepEqual(selectJobs(eventName, [...policyPaths, 'docs/README.md']), none);
    for (const file of policyPaths) {
      assert.deepEqual(selectJobs(eventName, [file]), none, file);
      for (const product of ['apps/editor/src/App.tsx', 'apps/desktop/src/main.ts',
        'packages/cli/src/cli.ts', 'packages/core/src/myst/parse.ts']) {
        assert.deepEqual(selectJobs(eventName, [file, product]), selectJobs(eventName, [product]),
          `${file} + ${product}`);
      }
    }
    for (const file of ['scripts/new-policy.mjs', 'scripts/check-plugin-boundaries.ts',
      'scripts/commit-provenance.mjs', 'test/helper.ts',
      'brand.ts', 'tsconfig.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
      '.github/workflows/ci.yml', 'unknown/config.json']) {
      const { reused, ...jobs } = full;
      // smartquotes has its own narrower dependency rule.
      assert.deepEqual(selectJobs(eventName, [...policyPaths, file]),
        { ...jobs, smartquotes: selectJobs(eventName, [file]).smartquotes }, file);
    }
    assert.equal(selectJobs(eventName, [...policyPaths, 'test/fixture.md']).quality, true,
      'test Markdown retains product quality');
    assert.deepEqual(selectJobs(eventName, []), selectJobs('push', policyPaths));
  }
  assert.deepEqual(selectJobs('push', policyPaths), selectJobs('workflow_dispatch', policyPaths));
});
test('HTTP selection always retains Windows unit coverage in Desktop', () => {
  // Every tracked path exercises the current classifications, including unknown fallback.
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const event of ['pull_request', 'merge_group', 'push']) {
    for (const file of [...paths, 'unknown/new-file']) {
      const jobs = selectJobs(event, [file]);
      assert.ok(!jobs.http || jobs.desktop, `${event}: ${file}`);
    }
    const jobs = selectJobs(event, paths);
    assert.ok(!jobs.http || jobs.desktop, `${event}: mixed diff`);
  }
  const { jobs } = workflow();
  assert.ok(jobs.desktop.steps.some(step => step.run === 'pnpm test' && !step.if));
  for (const run of ['pnpm --filter @litzio/cli package', 'pnpm --filter @litzio/cli test:packaged']) {
    assert.ok(jobs.http.steps.some(step => step.run === run && !step.if));
  }
  assert.ok(jobs.http.steps.some(step => step.run?.startsWith('pnpm browser:test http-host') && !step.if));
  assert.ok(!jobs.http.steps.some(step => /tsx --test|@litzio\/editor .*test/.test(step.run ?? '')),
    'HTTP owns packaged/production checks; Desktop owns Windows unit/integration checks');
  const editor = JSON.parse(readFileSync(new URL('../apps/editor/package.json', import.meta.url), 'utf8'));
  assert.ok(editor.scripts.test.split(/\s+/).includes('test/file-identity.test.ts'));
});
test('Core changes select Editor browser consumers without broadening other jobs', () => {
  const paths = [
    'packages/core/src/write.ts',
  ];
  const { reused, ...jobs } = expected(true, true, true, true, false);
  for (const event of ['pull_request', 'merge_group']) {
    for (const file of paths) {
      assert.deepEqual(selectJobs(event, [file]),
        jobs, `${event}: ${file}`);
    }
  }
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
    assert.deepEqual(await policy(initial, group), expected(true, true, true, true, false, false, true));
    assert.deepEqual(await policy(docs, group), expected(true, true, true, true, false, false, true));
    assert.deepEqual(await policy('f'.repeat(40), group), full);
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    writeFileSync(path.join(dir, 'scripts/issues.mjs'), 'issue tool\n');
    const tooling = commit('add policy tool');
    assert.deepEqual(await policy(group, tooling), expected(false, false, false, false, false));
    git(['rm', 'scripts/issues.mjs']);
    const deleted = commit('delete policy tool');
    assert.deepEqual(await policy(tooling, deleted), expected(false, false, false, false, false));
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    git(['mv', 'EDITOR.md', 'scripts/issues.mjs']);
    const renamed = commit('rename documentation to policy tool');
    assert.deepEqual(await policy(deleted, renamed), expected(false, false, false, false, false));
    git(['mv', 'scripts/issues.mjs', 'apps/editor/src/App.tsx']);
    const product = commit('rename policy tool to product');
    assert.deepEqual(await policy(renamed, product), expected(true, true, true, true, false, false, true));
    assert.deepEqual(await policy(product, renamed), expected(true, true, true, true, false, false, true),
      'reverse rename retains the removed product path');
    git(['mv', 'apps/editor/src/App.tsx', 'scripts/unknown.mjs']);
    const unknown = commit('rename product to unknown script');
    assert.deepEqual(await policy(product, unknown), { ...full, smartquotes: false });
    // Whole group combines the earlier product deletion and later tooling changes.
    assert.deepEqual(await policy(initial, renamed), expected(true, true, true, true, false, false, true));
    // With divergent trees, base..head includes a removed installer that a
    // merge-base diff would omit. Queue policy must use the supplied base tree.
    git(['checkout', '-qb', 'base-branch', initial]);
    mkdirSync(path.join(dir, 'apps/desktop'), { recursive: true });
    writeFileSync(path.join(dir, 'apps/desktop/installer.nsh'), 'installer\n');
    const divergent = commit('base tree includes installer');
    assert.deepEqual(await policy(divergent, docs), expected(true, false, false, true, true, false));
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
  assert.deepEqual(result, { quality: false, browser: false, http: false, desktop: false, update: false, fullLifecycle: false, fullLayout: false, smartquotes: false, reused: true });
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
  const script = aggregate.steps.find(step => step.env?.CHANGES_RESULT && step.env?.HTTP_SELECTED).run;
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
  const defaults = { CHANGES_RESULT: 'success', QUALITY_RESULT: 'success', BROWSER_SELECTED: 'false', BROWSER_RESULT: 'skipped',
    HTTP_SELECTED: 'false', HTTP_RESULT: 'skipped', DESKTOP_SELECTED: 'false', DESKTOP_RESULT: 'skipped',
    CACHE_SELECTED: 'false', CACHE_RESULT: 'skipped' };
  const run = env => spawnSync(bash, ['-c', script], { env: { ...process.env, ...defaults, ...env }, encoding: 'utf8' });
  assert.equal(run({}).status, 0, 'docs group');
  assert.equal(run({ CACHE_SELECTED: 'true', CACHE_RESULT: 'success' }).status, 0, 'reused push');
  for (const name of ['BROWSER', 'HTTP', 'DESKTOP', 'CACHE']) {
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
test('alternate brand jobs are absent from CI and release gates', () => {
  const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  const ci = workflow();
  assert.equal(ci.jobs.brand, undefined);
  assert.equal(ci.jobs.changes.outputs.brand, undefined);
  assert.ok(!ci.jobs['quality-and-browser'].needs.includes('brand'));
  assert.equal(release.jobs.brand, undefined);
  assert.ok(!release.jobs.publish.needs.includes('brand'));
});
test('lifecycle scope keeps representative Beta and removal but selects full for sensitive or unknown inputs', () => {
  const representative = ['apps/editor/shared/desktop-bridge.ts',
    'apps/editor/src/shell/SettingsDialog.tsx', 'apps/editor/src/shell/MessageArea.tsx',
    'apps/desktop/src/host-protocol.ts', 'apps/desktop/test/host-protocol.test.ts',
    'apps/desktop/src/explorer.ts', 'apps/desktop/test/explorer.test.ts',
    'apps/desktop/src/first-document.ts', 'apps/desktop/test/first-document.test.ts'];
  const sensitive = ['apps/desktop/installer/cli.nsh', 'apps/desktop/scripts/package.ts',
    'apps/desktop/src/cli-integration.ts', 'apps/desktop/src/uninstall-cli.ts',
    'apps/desktop/src/windows-environment.ts', 'apps/desktop/src/updates.ts',
    'apps/desktop/src/update-policy.ts', 'apps/desktop/src/github-provider.ts',
    'apps/desktop/src/signatures.ts', 'apps/desktop/src/main.ts',
    'apps/desktop/src/preferences.ts', 'apps/desktop/src/preload.ts',
    'apps/desktop/package.json', 'apps/desktop/test/packaged/update.e2e.ts',
    'apps/desktop/test/packaged/uninstall.e2e.ts', 'apps/desktop/new-input.ts',
    'brand.ts', 'pnpm-lock.yaml', 'patches/new.patch', 'unknown/config.json',
    '.github/workflows/ci.yml', 'scripts/new-build.mjs'];
  for (const file of representative) {
    const jobs = selectJobs('pull_request', [file]);
    assert.equal(jobs.update, true, file);
    assert.equal(jobs.fullLifecycle, false, file);
  }
  for (const file of sensitive) assert.equal(selectJobs('pull_request', [file]).fullLifecycle, true, file);
  // These packaging inputs alone retain update=false, but must promote an update-target diff.
  const buildInputs = ['packages/cli/scripts/build.ts',
    'apps/editor/vite.config.ts',
    'apps/editor/public/licenses/Shadcn-copied-source.txt',
    'apps/editor/public/licenses/index.html',
    ...['packages/cli', 'packages/core', 'packages/file-commit',
      'apps/editor'].map(path => `${path}/tsconfig.json`)];
  for (const file of buildInputs) {
    assert.equal(selectJobs('pull_request', [file]).update, false, file);
    assert.equal(selectJobs('pull_request', [representative[0], file]).fullLifecycle, true, file);
  }
  // Only representative union/fallback boundaries need both event entry points.
  for (const event of ['pull_request', 'merge_group']) {
    for (const paths of [
      ['apps/desktop/src/host-protocol.ts', 'packages/cli/scripts/build.ts'],
      [representative[0], 'apps/desktop/src/updates.ts'],
      [representative[0], 'unknown/config.json'],
    ]) assert.equal(selectJobs(event, paths).fullLifecycle, true, paths.join(' + '));
    assert.equal(selectJobs(event, ['apps/editor/src/App.tsx']).update, false);
  }
  const ci = workflow();
  assert.equal(ci.jobs.changes.outputs.fullLifecycle, '${{ steps.policy.outputs.fullLifecycle }}');
  const steps = ci.jobs.desktop.steps;
  const updates = steps.filter(step => step.run === 'pnpm --filter @litzio/desktop test:update');
  assert.equal(updates[0].if, "needs.changes.outputs.fullLifecycle == 'true'");
  assert.equal(updates[1].if, "needs.changes.outputs.update == 'true'");
  assert.equal(updates[1].env.LITZIO_TEST_UPDATE_CHANNEL, 'beta');
  const removal = steps.find(step => step.run === 'pnpm --filter @litzio/desktop test:uninstall');
  assert.equal(removal.if, "needs.changes.outputs.update == 'true'");
  assert.equal(removal.env.LITZIO_TEST_LIFECYCLE_SCOPE,
    "${{ needs.changes.outputs.fullLifecycle == 'true' && 'full' || 'representative' }}");
  const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  const releaseSteps = Object.values(release.jobs).flatMap(job => job.steps ?? []);
  const fullUpdates = releaseSteps.filter(step => step.run === 'pnpm --filter @litzio/desktop test:update');
  assert.equal(fullUpdates.length, 2);
  assert.ok(fullUpdates.every(step => !step.if));
  assert.equal(fullUpdates[0].env?.LITZIO_TEST_UPDATE_CHANNEL, undefined);
  assert.equal(fullUpdates[1].env.LITZIO_TEST_UPDATE_CHANNEL, 'beta');
  const fullRemoval = releaseSteps.find(step => step.run === 'pnpm --filter @litzio/desktop test:uninstall');
  assert.ok(!fullRemoval.if);
  assert.equal(fullRemoval.env?.LITZIO_TEST_LIFECYCLE_SCOPE, undefined);
});
test('layout scope promotes shell/native/style and unknown inputs independently of lifecycle', () => {
  const representative = ['packages/core/src/myst/figure.ts', 'apps/editor/src/components/FigureView.tsx',
    'packages/core/src/write.ts', 'apps/editor/src/dev/panel.tsx',
    'apps/editor/src/dev/panel.css'];
  const sensitive = ['apps/editor/src/App.tsx', 'apps/editor/src/shell/TopBar.tsx',
    'apps/editor/src/shell/new-control.tsx', 'apps/editor/src/styles.css', 'apps/editor/src/tokens.css',
    'apps/editor/shared/desktop-bridge.ts', 'apps/editor/index.html', 'apps/editor/vite.config.ts',
    'apps/editor/src/components/ui/button.tsx', 'apps/editor/src/components/ui/new-control.tsx',
    'apps/editor/src/theme.ts', 'apps/editor/public/theme-init.js', 'apps/editor/src/locales.ts',
    'apps/editor/src/i18n.ts', 'apps/editor/src/preferences.ts', 'apps/editor/src/shortcuts.ts',
    'apps/editor/src/document-tabs.ts', 'apps/editor/src/lib/utils.ts', 'apps/editor/src/ui/primitives.tsx',
    'apps/editor/src/ui-message.ts', 'apps/editor/src/AiSettings.tsx', 'apps/editor/src/App.tsx',
    'apps/editor/src/AiSettings.tsx', 'apps/editor/src/preferences.ts',
    'apps/editor/src/components/CopyButton.tsx', 'packages/cli/scripts/build.ts',
    'apps/editor/tsconfig.json',
    'apps/editor/test/layout-rules.browser.js', 'apps/editor/test/desktop-updates.browser.js',
    'apps/desktop/src/main.ts', 'apps/desktop/src/preload.ts', 'apps/desktop/package.json',
    'apps/desktop/test/packaged/caption-pixels.ts', 'pnpm-lock.yaml', 'unknown/new-input.ts'];
  for (const file of representative) assert.equal(selectJobs('pull_request', [file]).fullLayout, false, file);
  for (const file of sensitive) assert.equal(selectJobs('pull_request', [file]).fullLayout, true, file);
  for (const event of ['pull_request', 'merge_group']) {
    assert.equal(selectJobs(event, [representative[0], sensitive[0]]).fullLayout, true);
    assert.equal(selectJobs(event, [representative[0], 'unknown/new-input.ts']).fullLayout, true);
    // Shared UI and transitive build inputs must promote an otherwise representative diff.
    for (const input of ['apps/editor/src/components/ui/button.tsx', 'apps/editor/src/locales.ts',
      'packages/cli/scripts/build.ts', 'apps/editor/tsconfig.json',
      'apps/editor/public/licenses/Shadcn-copied-source.txt']) {
      assert.equal(selectJobs(event, [representative[0], input]).fullLayout, true, input);
    }
    assert.equal(selectJobs(event, [sensitive[0]]).fullLifecycle, false);
    assert.equal(selectJobs(event, []).fullLayout, true);
  }
  assert.equal(selectJobs('workflow_dispatch', representative).fullLayout, true);
  const ci = workflow();
  assert.equal(ci.jobs.changes.outputs.fullLayout, '${{ steps.policy.outputs.fullLayout }}');
  for (const job of ['browser', 'desktop']) {
    const step = ci.jobs[job].steps.find(step => job === 'browser'
      ? step.name === 'Run Editor browser regressions' : step.run === 'pnpm --filter @litzio/desktop test:packaged');
    assert.equal(step.env.LITZIO_TEST_LAYOUT_SCOPE,
      "${{ needs.changes.outputs.fullLayout == 'true' && 'full' || 'representative' }}");
  }
  const release = load(readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'));
  for (const job of Object.values(release.jobs)) {
    assert.equal(job.env?.LITZIO_TEST_LAYOUT_SCOPE, undefined);
    for (const step of job.steps ?? []) assert.equal(step.env?.LITZIO_TEST_LAYOUT_SCOPE, undefined);
  }
});
