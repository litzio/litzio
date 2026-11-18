#!/usr/bin/env node
// Check that a Litzio PR can enter the merge queue; optionally comment and enqueue it.
// Usage: node pr-gate.mjs --pr <N> [--enqueue --note-file <file>]
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'litzio/litzio';
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const gh = args => run('gh', args);
const git = args => run('git', args);

export function mergeConflictFiles({ status, stdout, stderr, error }) {
  if (status === 0) return [];
  if (status !== 1) throw new Error(`git merge-tree failed: ${error?.message ?? stderr?.trim() ?? status}`);

  // With -z, Git writes the tree OID, the conflict paths, then an empty field before messages.
  const fields = stdout.split('\0');
  const end = fields.indexOf('', 1);
  if (end < 2) throw new Error('git merge-tree did not return conflict paths');
  return fields.slice(1, end);
}

function queueConflictProblems(pr, head) {
  let queued;
  try {
    const pages = JSON.parse(gh(['api', 'graphql', '--paginate', '--slurp', '-f',
      'query=query($endCursor:String){repository(owner:"litzio",name:"litzio"){mergeQueue(branch:"master"){entries(first:100,after:$endCursor){nodes{pullRequest{number headRefOid}} pageInfo{hasNextPage endCursor}}}}}']));
    queued = pages.flatMap(page => page.data.repository.mergeQueue.entries.nodes)
      .map(entry => entry.pullRequest).filter(entry => entry.number !== pr);
  } catch (error) {
    const problem = `merge queue lookup failed: ${error.message}`;
    console.error(problem);
    return [problem];
  }

  if (!queued.length) {
    console.error('merge queue: no other PRs on master');
    return [];
  }

  const labels = queued.map(entry => `#${entry.number}`).join(', ');
  const problems = [];
  try {
    git(['fetch', '-q', '--no-tags', '--no-write-fetch-head', 'origin', ...queued.map(entry => entry.headRefOid)]);
  } catch (error) {
    const problem = `merge queue: could not fetch heads for ${labels}: ${error.message}`;
    console.error(problem);
    return [problem];
  }

  for (const entry of queued) {
    try {
      const files = mergeConflictFiles(spawnSync('git',
        ['merge-tree', '--write-tree', '--name-only', '-z', entry.headRefOid, head], { encoding: 'utf8' }));
      if (files.length) problems.push(`merge queue conflict with PR #${entry.number}: ${files.join(', ')}`);
    } catch (error) {
      problems.push(`merge queue check failed for PR #${entry.number}: ${error.message}`);
    }
  }
  console.error(`merge queue: compared against ${labels} (${problems.length ? 'blocked' : 'no conflicts'})`);
  return problems;
}

export function ciProblems(checks) {
  const problems = [];
  const state = check => check.conclusion || check.state || check.status || '';
  const pending = checks.filter(check => !state(check) || ['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED'].includes(state(check)));
  const failed = checks.filter(check => state(check) && !pending.includes(check) && !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(state(check)));
  const required = checks.filter(check => check.name === 'Core, CLI, Editor, and browser regressions');
  if (required.length !== 1 || state(required[0]) !== 'SUCCESS') problems.push('required PR aggregate must report SUCCESS for the current head');
  if (pending.length) problems.push(`checks pending: ${pending.map(check => check.name ?? check.context).join(', ')}`);
  if (failed.length) problems.push(`checks failed: ${failed.map(check => `${check.name ?? check.context}=${state(check)}`).join(', ')}`);

  return problems;
}

// The record must state the review decision so that skipping a review is always a written judgment.
export const reviewDecision = note => /^독립 리뷰: (APPROVE \S+|생략 — \S)/.test(note.replace(/^\uFEFF/, '').trimStart());

async function main() {
  const argv = process.argv.slice(2);
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const pr = Number(option('--pr'));
  const enqueue = argv.includes('--enqueue');
  const noteFile = option('--note-file');
  if (!Number.isInteger(pr) || pr <= 0) throw new Error('Usage: pr-gate.mjs --pr <N> [--enqueue --note-file <file>]');
  if (enqueue && !noteFile) throw new Error('--enqueue requires --note-file with the orchestrator record');
  if (enqueue && !reviewDecision(readFileSync(noteFile, 'utf8'))) throw new Error('note must start with "독립 리뷰: APPROVE <head>" or "독립 리뷰: 생략 — <사유>"');

  if (!/github\.com[/:]litzio\/litzio(\.git)?$/.test(git(['remote', 'get-url', 'origin']))) {
    throw new Error('This script only runs inside the litzio/litzio repository');
}
const root = git(['rev-parse', '--show-toplevel']);

const view = JSON.parse(gh(['pr', 'view', String(pr), '--repo', REPO, '--json',
  'id,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,statusCheckRollup']));
const problems = [];
if (view.state !== 'OPEN') problems.push(`PR is ${view.state}`);
if (view.baseRefName !== 'master') problems.push(`base is ${view.baseRefName}, not master`);
if (view.isDraft) problems.push('PR is a draft (run `gh pr ready` first)');
if (view.mergeable === 'CONFLICTING') problems.push('PR conflicts with master');

const checks = view.statusCheckRollup ?? [];
problems.push(...ciProblems(checks));

const threads = JSON.parse(gh(['api', 'graphql', '-f',
  `query={repository(owner:"litzio",name:"litzio"){pullRequest(number:${pr}){reviewThreads(first:100){nodes{isResolved}}}}}`]))
  .data.repository.pullRequest.reviewThreads.nodes;
const unresolved = threads.filter(thread => !thread.isResolved).length;
if (unresolved) problems.push(`${unresolved} unresolved review thread(s)`);

if (view.state !== 'OPEN') {
  console.log(JSON.stringify({ pr, head: view.headRefOid, problems }, null, 2));
  process.exit(1);
}
git(['fetch', '-q', 'origin', 'master', view.headRefName]);
const fetched = git(['rev-parse', `refs/remotes/origin/${view.headRefName}`]);
if (fetched !== view.headRefOid) problems.push(`remote branch ${fetched} differs from PR head ${view.headRefOid}`);
else {
  // Reuse the repository's own provenance validator instead of re-implementing trailer rules.
  const { validateRange } = await import(pathToFileURL(path.join(root, 'scripts', 'commit-provenance.mjs')).href);
  const base = git(['merge-base', 'refs/remotes/origin/master', view.headRefOid]);
  try { validateRange(base, view.headRefOid, root); } catch (error) { problems.push(`provenance: ${error.message}`); }
}

problems.push(...queueConflictProblems(pr, view.headRefOid));
console.log(JSON.stringify({ pr, head: view.headRefOid, checks: checks.length, unresolved, problems }, null, 2));
if (problems.length) process.exit(1);
if (!enqueue) process.exit(0);

gh(['pr', 'comment', String(pr), '--repo', REPO, '--body-file', noteFile]);
const result = JSON.parse(gh(['api', 'graphql', '-f',
  'query=mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{position state}}}',
  '-f', `id=${view.id}`, '-f', `oid=${view.headRefOid}`]));
console.log(JSON.stringify(result.data.enqueuePullRequest.mergeQueueEntry));

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
