// SPIKE (spike/ollama-local-model): run three Korean assistant tasks through an isolated built Host
// with both existing provider connections routed to a local Ollama model. Never part of CI.
// Usage: LITZIO_SPIKE_OLLAMA_MODEL=<model> pnpm exec tsx scripts/spike-ollama/run.mjs <codex|copilot> [permissionMode] [taskId]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { DAEMON_PROTOCOL } from '../../apps/editor/shared/daemon-version.ts';
import { isolatedHostEnvironment } from '../../test/helpers/isolated-host-environment.ts';
import { parse, serialize } from '../../packages/core/src/index.ts';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const [provider = 'codex', permissionMode = 'full-access', only] = process.argv.slice(2);
const model = process.env.LITZIO_SPIKE_OLLAMA_MODEL;
if (!model || !['codex', 'copilot'].includes(provider)) throw new Error('Usage: LITZIO_SPIKE_OLLAMA_MODEL=<model> run.mjs <codex|copilot> [permissionMode] [taskId]');
const cliEntry = path.join(checkout, 'packages/cli/dist/cli.mjs');
const doc = (title, body) => serialize(parse(`---\nlitzio: 1\ntitle: ${title}\n---\n\n${body}\n`));
const read = (folder, name) => fs.existsSync(path.join(folder, name)) ? fs.readFileSync(path.join(folder, name), 'utf8') : '';
const REPORT = doc('생산 라인 점검 보고', '담당 팀: 품질 1팀\n\n| 라인 | 결과 |\n| --- | --- |\n| A 라인 | 정상 |\n| B 라인 | 이상: 컨베이어 소음 |\n| C 라인 | 정상 |');
const check = file => spawnSync(process.execPath, [cliEntry, 'check', file, '--format', 'json'], { cwd: checkout, encoding: 'utf8', timeout: 30_000, windowsHide: true }).status === 0;
const tasks = [
  { id: 1, name: '문서 내용 질문', message: '점검보고.md 문서를 읽고, 이상이 발견된 라인과 그 내용을 한 문장으로 알려 주세요.',
    judge: (folder, answer) => /B\s*라인/.test(answer) && /소음/.test(answer) && read(folder, '점검보고.md') === REPORT },
  { id: 2, name: '기존 문서 작은 수정(CLI)', message: '점검보고.md에서 "담당 팀: 품질 1팀"을 "담당 팀: 품질 2팀"으로 고친 뒤 litzio check로 문서를 검사해 주세요.',
    judge: folder => { const s = read(folder, '점검보고.md'); return s.includes('품질 2팀') && !s.includes('품질 1팀') && s.includes('B 라인') && check(path.join(folder, '점검보고.md')); } },
  { id: 3, name: '새 문서 만들기', message: '같은 폴더에 주간요약.md라는 새 리치오 문서를 만들어 주세요. 제목은 "주간 요약", 본문에는 "B 라인 소음 점검이 필요하다."라는 문장 하나를 넣고 litzio check로 검사해 주세요.',
    judge: folder => { const s = read(folder, '주간요약.md'); return s.includes('주간 요약') && s.includes('B 라인') && check(path.join(folder, '주간요약.md')); } },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'litzio-spike-ollama-'));
const data = path.join(root, 'data');
fs.mkdirSync(data, { recursive: true });
for (const key of Object.keys(process.env)) if (/^LITZIO_.*_SETTINGS_FILE$/.test(key)) delete process.env[key];
Object.assign(process.env, isolatedHostEnvironment(root, data));
const reasoningEffort = provider === 'codex' ? 'low' : 'medium';
fs.writeFileSync(path.join(data, 'assistant.json'), JSON.stringify({ provider, permissionMode, model, reasoningEffort, responseLanguage: 'ko' }));
const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const child = spawn(process.execPath, [cliEntry, 'daemon', 'run', '--root', root, '--port', String(port)], { cwd: checkout, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
console.log('Host PID', child.pid, 'port', port);
const exited = once(child, 'exit');
let startup = '', log = ''; child.stdout.on('data', d => { startup += d; }); child.stderr.on('data', d => { log += d; });
const url = `http://127.0.0.1:${port}`;
const api = async (method, suffix = '', body) => {
  const res = await fetch(url + '/api/assistant/conversations' + suffix, { method, headers: { Origin: url, Connection: 'close', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const value = await res.json(); if (!res.ok) throw new Error(JSON.stringify(value)); return value;
};
const get = async route => (await fetch(url + route, { headers: { Origin: url }, signal: AbortSignal.timeout(120_000) })).json();
const results = [];
try {
  for (let n = 0; !startup.includes('HTTP:'); n++) { if (child.exitCode !== null || n === 60) throw new Error('Host startup failed: ' + log); await delay(500); }
  const models = await get(`/api/assistant/models?provider=${provider}`);
  console.log('models:', JSON.stringify(models.models?.map(m => m.model) ?? models));
  const diag = await get(`/api/assistant/diagnostics?provider=${provider}`);
  console.log('diagnostics:', JSON.stringify({ connected: diag.connected, account: diag.account ?? null, version: diag.version, error: diag.error, accountError: diag.accountError, rateLimits: !!diag.rateLimits }));
  for (const task of tasks.filter(t => !only || String(t.id) === only)) {
    const folder = path.join(root, `task${task.id}`); fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, '점검보고.md'), REPORT);
    const start = Date.now(), submissionId = crypto.randomUUID();
    const r = { id: task.id, name: task.name, provider, permissionMode, stop: '', answer: '', tools: [] };
    let conversation;
    try {
      conversation = (await api('POST', '', { action: 'send', submissionId, provider, permissionMode, model, reasoningEffort, folders: [folder], message: `작업 폴더: ${folder}\n${task.message}` })).conversation;
      while (Date.now() - start < 600_000) {
        const submission = await api('GET', '?submissionId=' + submissionId);
        if (submission.submission?.status === 'rejected') throw new Error(JSON.stringify(submission));
        if (submission.conversation) conversation = submission.conversation;
        if (conversation?.id) conversation = await api('GET', '?id=' + encodeURIComponent(conversation.id));
        const turn = conversation?.turns.at(-1);
        if (turn?.items.some(i => i.question?.approval && i.question.status === 'pending')) { r.stop = 'approval pending'; break; }
        if (turn && turn.status !== 'inProgress') { r.stop = turn.status; break; }
        await delay(1000);
      }
      if (!r.stop) r.stop = 'timeout';
    } catch (e) { r.stop = 'error: ' + e.message; }
    r.seconds = +((Date.now() - start) / 1000).toFixed(1);
    const items = conversation?.turns.flatMap(t => t.items) ?? [];
    r.answer = items.filter(i => i.kind === 'assistant').map(i => i.text).join('\n');
    r.tools = items.filter(i => i.kind === 'tool').map(i => ({ status: i.status, kind: i.work?.kind, text: (i.text ?? '').slice(0, 300), detail: (i.work?.detail ?? '').slice(0, 300) }));
    r.usage = conversation?.tokenUsage;
    r.error = conversation?.turns.at(-1)?.error;
    if (conversation?.turns.some(t => t.status === 'inProgress')) await api('POST', '', { action: 'interrupt', id: conversation.id }).catch(() => {});
    try { r.passed = !!task.judge(folder, r.answer); } catch (e) { r.passed = false; r.judgeError = e.message; }
    r.files = fs.readdirSync(folder);
    results.push(r);
    console.log(`\n=== task ${task.id} ${task.name}: ${r.passed ? 'PASS' : 'FAIL'} (${r.stop}, ${r.seconds}s)`);
    for (const t of r.tools) console.log('  tool', t.status, t.kind ?? '-', JSON.stringify(t.text).slice(0, 250), JSON.stringify(t.detail).slice(0, 200));
    console.log('  answer:', JSON.stringify(r.answer).slice(0, 500));
    if (r.error) console.log('  error:', JSON.stringify(r.error).slice(0, 500));
    console.log('  usage:', JSON.stringify(r.usage ?? null));
    console.log('  files:', r.files.join(', '));
  }
} finally {
  fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
  try {
    const health = await fetch(url + '/daemon/health', { headers: { 'x-litzio-protocol': DAEMON_PROTOCOL } }).then(r => r.json());
    if (health.pid === child.pid) await fetch(url + '/daemon/stop', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, 'x-litzio-protocol': DAEMON_PROTOCOL }, body: JSON.stringify({ ...health, confirm: true }) });
    await Promise.race([exited, delay(30_000)]);
  } catch {}
  if (child.exitCode === null) child.kill();
  console.log('\nresults:', path.join(root, 'results.json'), 'host exit', child.exitCode);
}
