import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as gate from './pr-gate.mjs';

test('distinguishes conflicting heads, independent edits, and Git errors', t => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'pr-gate-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const file = 'shared file.txt';
  const commit = (name, content) => {
    writeFileSync(path.join(cwd, name), content);
    git('add', '--', name);
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
    return git('rev-parse', 'HEAD');
  };
  const compare = (left, right) => gate.mergeConflictFiles(
    spawnSync('git', ['merge-tree', '--write-tree', '--name-only', '-z', left, right], { cwd, encoding: 'utf8' }),
  );

  git('init', '-q');
  const base = commit(file, 'base\n');
  const queued = commit(file, 'queued\n');
  git('checkout', '-q', '--detach', base);
  const conflicting = commit(file, 'candidate\n');
  git('checkout', '-q', '--detach', base);
  const independent = commit('other.txt', 'candidate\n');

  assert.deepEqual(compare(queued, conflicting), [file]);
  assert.deepEqual(compare(queued, independent), []);
  assert.throws(() => compare(queued, 'missing-head'), /merge-tree/);
});
