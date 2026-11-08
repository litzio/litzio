import { readFile } from "node:fs/promises";
import { readDoclingArchive } from "./archive.js";
import { authorDocument } from "@litzio/plugin-sdk";

// Interpretation belongs to this plugin; canonical document semantics belong to the SDK.
async function convertDocument(doc) {
  if (doc?.schema_name !== "DoclingDocument" || !Array.isArray(doc.body?.children)) throw new Error();
  const blocks = [], visited = new Set();
  function visit(ref) {
    const match = /^#\/(texts|groups|tables|pictures)\/(\d+)$/.exec(ref?.$ref ?? "");
    if (!match || visited.has(ref.$ref)) throw new Error();
    visited.add(ref.$ref);
    const item = doc[match[1]]?.[Number(match[2])];
    if (!item) throw new Error();
    if (typeof item.text === "string" && item.text) {
      blocks.push(item.label === "section_header" && Number.isInteger(item.level) && item.level >= 1 && item.level <= 6
        ? { kind: "heading", level: item.level, text: item.text }
        : { kind: "paragraph", text: item.text });
    }
    // Tables are deliberately reduced to cell text, preserving the supplied cell order.
    if (match[1] === "tables") {
      const text = (item.data?.table_cells ?? []).map(cell => cell.text ?? "").join(" | ");
      if (text) blocks.push({ kind: "paragraph", text });
    }
    for (const child of item.children ?? []) visit(child);
  }
  for (const ref of doc.body.children) visit(ref);
  return authorDocument({ inputs: [{ key: "pdf", blocks }] });
}

/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const requests = new Set();
  async function checkConnection() {
    let base;
    try {
      base = new URL(String(context.settings.serverUrl ?? "http://127.0.0.1:5001"));
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    } catch {
      return [{ server: "미설정", status: "오류", detail: "설정의 HTTP(S) URL을 확인하세요." }];
    }
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 5000);
    const server = base.href.replace(/\/$/, "");
    const row = (status, detail) => [{ server, status, detail }];
    try {
      const response = await fetch(server + "/health", {
        headers: context.secrets?.["api-key"] ? { "X-Api-Key": context.secrets["api-key"] } : {},
        signal: controller.signal, redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        const detail = response.status === 401 ? "인증 키를 확인하세요." : response.status === 403 ? "접근 권한을 확인하세요." : response.status === 404 ? "서버 주소를 확인하세요." : "서버 응답 오류입니다.";
        return row("오류", detail + ` (HTTP ${response.status})`);
      }
      const body = await response.json();
      return body?.status === "ok" ? row("연결됨", "health 정상 · 변환 및 인증 권한은 미확인") : row("오류", "docling-serve health 응답을 확인하세요.");
    } catch {
      return row("오류", controller.signal.aborted ? "연결 시간이 초과됐습니다." : "서버 주소와 연결을 확인하세요.");
    } finally {
      clearTimeout(timer);
      requests.delete(controller);
    }
  }
  const jobs = new Map();
  function stop(control) {
    if (control?.job.state !== "running") return;
    control.controller.abort();
    control.job = { state: "stopped", phase: "중단됨" };
  }
  async function run(control, input) {
    const signal = control.controller.signal;
    const bytes = await readFile(input.file, { signal });
    signal.throwIfAborted();
    const archive = readDoclingArchive(bytes);
    control.job.phase = "문서 생성 중";
    const authored = await convertDocument(archive.document);
    signal.throwIfAborted();
    control.job = { state: "completed", phase: "완료", document: { source: authored.source } };
  }
  return {
    operations: {
      connection: async () => checkConnection(),
      start(input) {
        const control = { controller: new AbortController(), job: { state: "running", phase: ".docling 읽는 중" } };
        jobs.set(input.requestId, control);
        void run(control, input).catch(error => {
          if (!control.controller.signal.aborted) control.job = { state: "failed", phase: "실패", errorKind: error.name === "TimeoutError" ? "timeout" : error.kind ?? "failed" };
        });
        return structuredClone(control.job);
      },
      "job-status"(input) { return structuredClone(jobs.get(input.requestId).job); },
      "job-stop"(input) { const control = jobs.get(input.requestId); stop(control); return structuredClone(control.job); },
    },
    status: () => ({ available: true, message: "연결 상태 화면에서 수동으로 조회하세요.", folders: [], decorations: [], accounts: [] }),
    dispose() { for (const controller of requests) controller.abort(); for (const control of jobs.values()) stop(control); },
  };
}
