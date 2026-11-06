// Temporary adapter, deliberately outside the production Host/catalog contract.
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parse, serialize, validateStructure } from '@litzio/core';
import { createAssistantHost } from './assistant-host.ts';
import { hostPaths } from './host-paths.ts';
import { RootAccess } from './file-access.ts';
import { executeDocumentTool } from './assistant-document-tools.ts';

const text = z.string().min(1).max(4000);
const question = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]*$/), label: text, hint: z.string().max(500) }).strict();
const interview = z.object({ title: text, message: text, questions: z.array(question).min(2).max(8) }).strict();
const graph = z.object({ title: text, message: text, nodes: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]*$/), label: text, detail: text }).strict()).min(2).max(10), edges: z.array(z.object({ source: text, target: text, label: z.string().max(200) }).strict()).min(1).max(20) }).strict();
const report = z.object({ title: text, blocks: z.array(z.union([z.object({ type: z.literal('paragraph'), text }).strict(), z.object({ type: z.literal('heading'), text, level: z.number().int().min(1).max(6) }).strict()])).min(1).max(60) }).strict();
// Deliberately bounded spike routing: questions, negation, conditions and mixed edits do not match.
export function isReportApproval(message: string) {
  const normalized = message.trim().replace(/[.!。！]+$/, '').replace(/\s+/g, ' ');
  return ['이대로 보고서를 만들어 줘', '이대로 보고서 만들어 줘', '이대로 보고서를 만들어 주세요', '이대로 보고서 만들어 주세요', '이 흐름대로 보고서를 만들어 주세요', '현재 흐름을 승인합니다. 보고서를 만들어 주세요'].includes(normalized);
}
export async function createSpike(options: { base?: string; host?: Pick<ReturnType<typeof createAssistantHost>, 'invoke' | 'close'> } = {}) {
  const base = options.base ?? path.resolve(import.meta.dirname, '../../../spike-artifacts/followup', new Date().toISOString().replace(/[:.]/g, '-'));
  const root = path.join(base, 'documents'); mkdirSync(root, { recursive: true });
  const data = path.join(base, 'host'); mkdirSync(data, { recursive: true });
  const access = new RootAccess([root]);
  const host = options.host ?? createAssistantHost(access, path.join(data, 'assistant.json'), { paths: hostPaths({}, { ...process.env, LITZIO_DATA_DIR: data, LITZIO_ASSISTANT_CWD: path.join(data, 'assistant') }) });
  const state: any = { taskId: randomUUID(), revision: 0, answers: {}, comments: [], history: [], calls: [], busy: false };
  let epoch = 0;
  const save = () => writeFileSync(path.join(base, 'session.json'), JSON.stringify(state, null, 2));
  const ask = async (stage: string, context: unknown, schema: z.ZodType, instruction: string) => {
    const token = ++epoch; state.busy = true; state.error = undefined;
    const call: any = { stage, model: 'gpt-6-luna', effort: 'low', startedAt: new Date().toISOString(), input: context }; state.calls.push(call); save();
    try {
      const sent = await host.invoke('assistantConversation', { action: 'send', id: state.conversationId, provider: 'codex', model: 'gpt-6-luna', reasoningEffort: 'low', permissionMode: 'read-only', folders: [root], message: `한국어 보고서 공동 작업. 도구 호출이나 파일 읽기/쓰기 없이 JSON 객체 하나만 답하세요. 코드 펜스 금지. ${instruction}\n현재 작업의 전체 입력: ${JSON.stringify(context)}` });
      state.conversationId = sent.id;
      if (token !== epoch) { await host.invoke('assistantConversation', { action: 'interrupt', id: sent.id }); throw new Error('요청을 취소했습니다. 입력과 의견은 보존됩니다.'); }
      const deadline = Date.now() + 180000;
      while (true) {
        if (token !== epoch) throw new Error('요청을 취소했습니다. 입력과 의견은 보존됩니다.');
        const conversation = await host.invoke('assistantConversations', { id: sent.id });
        const turn = conversation.turns.at(-1);
        if (turn && turn.status !== 'inProgress') {
          if (turn.status !== 'completed' || turn.error) throw new Error(turn.error ?? turn.status);
          const output = turn.items.filter((i: any) => i.kind === 'assistant').map((i: any) => i.text).join('\n');
          const value = schema.parse(JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, '')));
          call.output = value; call.status = 'completed'; call.actualModel = conversation.model; call.tokenUsage = conversation.tokenUsage; call.finishedAt = new Date().toISOString();
          return value as any;
        }
        if (Date.now() > deadline) { await host.invoke('assistantConversation', { action: 'interrupt', id: sent.id }); throw new Error('모델 응답 시간이 초과되었습니다.'); }
        await new Promise(r => setTimeout(r, 400));
      }
    } catch (e) { call.status = 'failed'; call.error = String((e as Error).message); throw e; }
    finally { state.busy = false; save(); }
  };
  const graphInstruction = '형식: {title,message,nodes:[{id,label,detail}],edges:[{source,target,label}]}. 3~7개의 의미 있는 절차를 구성하세요. 각 id는 영문 소문자로 시작하는 영문/숫자/밑줄 식별자. 기존 노드는 같은 id를 반드시 보존. 노드 의견을 해당 id에 반영. edges는 존재하는 노드만 연결. message에 반영한 변경을 짧게 설명.';
  return { async handle(method: string, url: string, input: any) {
    if (method === 'POST' && url === '/shutdown') { ++epoch; await host.close(); return { closed: true }; }
    if (method === 'GET') return state;
    if (url === '/cancel') { ++epoch; if (state.conversationId) await host.invoke('assistantConversation', { action: 'interrupt', id: state.conversationId }); return state; }
    if (state.busy) throw new Error('현재 응답을 기다리거나 중단해 주세요.');
    if (input.revision !== state.revision) throw new Error('최신 작업을 다시 확인하세요.');
    try {
      if (url === '/message') {
        if (!state.graph || state.document) throw new Error('현재 흐름을 확인한 뒤 승인해 주세요.');
        const message = text.parse(input.message);
        state.history.push({ role: 'user', text: message });
        if (!isReportApproval(message)) {
          state.history.push({ role: 'assistant', text: '보고서를 만들지는 않았습니다. 수정 의견은 노드를 선택해 전달해 주세요. 현재 흐름을 승인하려면 “이대로 보고서를 만들어 줘”라고 알려주세요.' });
          save(); return state;
        }
        url = '/approve'; input = { ...input, approved: true, approvalMessage: message };
      }
      if (url === '/start') {
        if (state.form) throw new Error('이미 시작한 작업입니다.');
        state.request = text.parse(input.message); state.history.push({ role: 'user', text: state.request });
        state.form = await ask('interview', { taskId: state.taskId, request: state.request }, interview, '사용자의 주제에 적합한 인터뷰 질문을 직접 설계하세요. 형식: {title,message,questions:[{id,label,hint}]}. 질문 3~5개, hint는 입력 예시. 아직 흐름도나 보고서를 만들지 마세요.');
        if (new Set(state.form.questions.map((q: any) => q.id)).size !== state.form.questions.length) throw new Error('중복 질문 ID');
        state.history.push({ role: 'assistant', text: state.form.message }); state.revision++;
      } else if (url === '/flow' || url === '/revise') {
        if (!state.form || state.document) throw new Error('이 작업은 수정할 수 없습니다.');
        if (url === '/flow') {
          const answers = z.record(z.string(), text).parse(input.answers);
          if (Object.keys(answers).length !== state.form.questions.length || state.form.questions.some((q: any) => !answers[q.id])) throw new Error('모든 질문에 답해 주세요.');
          state.answers = answers;
        } else {
          if (!state.graph?.nodes.some((n: any) => n.id === input.nodeId)) throw new Error('노드가 없습니다.');
          state.comments.push({ id: randomUUID(), nodeId: input.nodeId, revision: state.revision, text: text.parse(input.message) });
        }
        state.history.push({ role: 'user', text: input.message || '입력 완료' });
        const next = await ask(url === '/flow' ? 'flow' : 'revise', { taskId: state.taskId, revision: state.revision, request: state.request, form: state.form, answers: state.answers, graph: state.graph, comments: state.comments }, graph, graphInstruction);
        const ids = new Set(next.nodes.map((n: any) => n.id));
        if (ids.size !== next.nodes.length || next.edges.some((e: any) => !ids.has(e.source) || !ids.has(e.target))) throw new Error('잘못된 흐름도 연결');
        if (state.graph?.nodes.some((n: any) => !ids.has(n.id))) throw new Error('기존 노드 identity가 사라졌습니다. 이전 흐름은 유지됩니다.');
        state.graph = next; state.revision++; state.history.push({ role: 'assistant', text: next.message });
      } else if (url === '/approve') {
        if (!state.graph || input.approved !== true || state.document) throw new Error('최신 흐름에 대한 명시적 승인이 필요합니다.');
        state.approval = { revision: state.revision, at: new Date().toISOString(), source: input.approvalMessage ? 'conversation' : 'button', message: input.approvalMessage ?? '이대로 승인하고 보고서 만들기' };
        if (!input.approvalMessage) state.history.push({ role: 'user', text: state.approval.message });
        save();
        const final = await ask('report', { taskId: state.taskId, approvedRevision: state.revision, request: state.request, form: state.form, answers: state.answers, graph: state.graph, comments: state.comments }, report, '사용자가 현재 흐름과 입력을 승인했습니다. 전체 내용을 바탕으로 실제 보고서 내용을 생성하세요. 형식: {title,blocks:[{type:"heading",level:2,text:"..."},{type:"paragraph",text:"..."}]}. 모든 본문은 plain text, Markdown 문법 금지. 합성 실험임을 밝히세요.');
        const file = path.join(root, `report-${state.taskId}.md`);
        const scope = { folders: access, permissionMode: 'opened-folders', access, directory: path.join(data, 'templates') };
        const receipt: any = executeDocumentTool('create_document', { path: file, ...final }, scope);
        const reread: any = executeDocumentTool('read_document', { path: file }, scope);
        validateStructure(parse(reread.source));
        state.document = { name: path.basename(file), source: reread.source, revision: reread.revision, valid: true, canonical: serialize(parse(reread.source)) === reread.source, receiptMatches: receipt.revision === reread.revision };
        state.revision++; state.history.push({ role: 'assistant', text: '승인한 내용을 보고서로 만들었습니다.' });
      } else throw new Error('알 수 없는 작업');
      save(); return state;
    } catch (e) { state.error = String((e as Error).message); save(); throw e; }
  }, async close() { ++epoch; await host.close(); } };
}
