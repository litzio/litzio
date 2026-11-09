import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { convertPdfToArchive } from "./conversion.js";
import { readDoclingArchive } from "./archive.js";
import { convertDocument } from "./document.js";

/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const requests = new Set();
  async function checkConnection() {
    let base;
    try {
      base = new URL(String(context.settings.serverUrl ?? "http://127.0.0.1:5001"));
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    } catch {
      return { ok: false, message: "설정의 HTTP(S) URL을 확인하세요." };
    }
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), 5000);
    const server = base.href.replace(/\/$/, "");
    const result = (ok, message) => ({ ok, message });
    try {
      for (const endpoint of ["/health", "/ready"]) {
        const response = await fetch(server + endpoint, {
          signal: controller.signal, redirect: "error",
        });
        if (!response.ok) {
          await response.body?.cancel();
          return result(false, "서버 주소와 연결을 확인하세요. API 키가 걸린 서버는 지원하지 않습니다.");
        }
        if ((await response.json())?.status !== "ok") return result(false, "docling-serve health/ready 응답을 확인하세요.");
      }
      return result(true, "health/ready 정상 · 요청 모델 준비와 변환 권한은 미확인");
    } catch {
      return result(false, controller.signal.aborted ? "연결 시간이 초과됐습니다." : "서버 주소와 연결을 확인하세요.");
    } finally {
      clearTimeout(timer);
      requests.delete(controller);
    }
  }
  const jobs = new Map();
  let pdfTail = Promise.resolve(); // owned by this activation, never the Host
  async function stop(control) {
    if (control?.job.state !== "running") return;
    control.controller.abort();
    await control.done; // writers must be closed before Host cleans the staging file
    control.job = { state: "stopped", phase: control.pdf ? "관찰 중단 · 서버 작업은 계속될 수 있음" : "중단됨" };
  }
  function accept(input, pdf) {
    const control = { controller: new AbortController(), pdf, job: { state: "running", phase: pdf ? "서버 대기 중" : ".docling 읽는 중" }, done: undefined };
    jobs.set(input.requestId, control);
    let work;
    if (pdf) {
      const previous = pdfTail;
      let release;
      const turn = new Promise(resolve => { release = resolve; });
      // A cancelled waiter releases its turn, but cannot bypass earlier work.
      pdfTail = previous.then(() => turn);
      work = runPdf(control, input, previous).finally(() => release());
    } else work = run(control, input);
    control.done = work.catch(error => {
      if (!control.controller.signal.aborted) {
        control.report = { failure: { reason: error.conversionReason ?? "Archive or conversion failed", ...(error.sourceRef ? { self_ref: error.sourceRef } : {}) } };
        control.job = { state: "failed", phase: "실패", errorKind: error.name === "TimeoutError" ? "timeout" : error.kind ?? "failed" };
      }
    });
    return structuredClone(control.job);
  }
  async function runPdf(control, input, previous) {
    if (!input.resultFile) throw new Error();
    const signal = control.controller.signal;
    await new Promise((resolve, reject) => {
      const aborted = () => { signal.removeEventListener("abort", aborted); reject(signal.reason); };
      signal.addEventListener("abort", aborted, { once: true });
      previous.then(() => {
        signal.removeEventListener("abort", aborted);
        if (signal.aborted) reject(signal.reason); else resolve();
      });
      if (signal.aborted) aborted();
    });
    signal.throwIfAborted();
    const bytes = await convertPdfToArchive({ file: input.file, serverUrl: String(context.settings.serverUrl ?? "http://127.0.0.1:5001"), signal,
      onPhase(phase) { if (!signal.aborted) control.job.phase = phase; } });
    signal.throwIfAborted();
    if (bytes.length > input.resultFile.maxBytes) throw new Error();
    await writeFile(input.resultFile.path, bytes, { signal });
    signal.throwIfAborted();
    control.job = { state: "completed", phase: "완료", file: { path: input.resultFile.path } };
  }
  async function run(control, input) {
    const signal = control.controller.signal;
    const bytes = await readFile(input.file, { signal });
    signal.throwIfAborted();
    const archive = readDoclingArchive(bytes);
    control.job.phase = "문서 생성 중";
    const authored = await convertDocument(archive.document, archive.manifest.document.sha256);
    signal.throwIfAborted();
    control.report = authored.report;
    control.authored = authored;
    control.output = input.output;
    control.job = { state: "completed", phase: authored.report.summary, document: authored.document };
  }
  return {
    operations: {
      connection: async () => checkConnection(),
      async "conversion-report"(input) {
        const control = jobs.get(input.requestId);
        if (!control?.report) throw new Error();
        if (control.report.failure) return structuredClone(control.report);
        if (input.result) {
          if (resolve(input.result.path) !== resolve(control.output)) throw new Error("Host result path does not match this job");
          const bytes = await readFile(control.output);
          if (createHash("sha256").update(bytes).digest("hex") !== input.result.revision) throw new Error("Host result revision is stale");
          control.finalReport = control.authored.bindReport(input.result);
        }
        if (!control.finalReport) throw new Error("Supply the completed Host job result to bind final targets");
        return structuredClone(control.finalReport);
      },
      start(input) { return accept(input, false); },
      "convert-pdf"(input) { return accept(input, true); },
      "job-status"(input) { return structuredClone(jobs.get(input.requestId).job); },
      "job-stop": async (input) => { const control = jobs.get(input.requestId); await stop(control); return structuredClone(control.job); },
    },
    status: () => ({ available: true, message: "설정에서 연결을 확인하세요.", folders: [], decorations: [], accounts: [] }),
    async dispose() { for (const controller of requests) controller.abort(); await Promise.all([...jobs.values()].map(stop)); },
  };
}
