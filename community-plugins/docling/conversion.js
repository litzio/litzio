import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import profile from "./litzio-pdf-en-v1.json" with { type: "json" };
import { createDoclingArchiveFromResult } from "./archive.js";
export { profile as PDF_PROFILE };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

/** Prepare a result Buffer only. No K1 file result or final write is bound before PR #1327. */
export async function convertPdfToArchive({ file, serverUrl, apiKey, signal: callerSignal, timeoutSeconds = 1800, onPhase = () => {} }) {
  const started = Date.now(), startedAt = new Date(started).toISOString();
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error("Invalid conversion deadline");
  const deadline = AbortSignal.timeout(Math.ceil(timeoutSeconds * 1000));
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  let taskId, submittedAt;
  try {
    const base = new URL(serverUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    const server = base.href.replace(/\/$/, "");
    async function request(path, options) {
      const response = await fetch(server + path, { ...options, headers: apiKey ? { "X-Api-Key": apiKey } : {}, signal, redirect: "error" });
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error(), { kind: response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status >= 500 ? "unavailable" : "failed" });
      }
      return response;
    }
    const source = await readFile(file, { signal }), originalHash = hash(source);
    onPhase("서버 확인 중");
    const versions = await (await request("/version")).json();
    if (versions["docling-serve"] !== profile.server_version) throw new Error();
    if ((await (await request("/ready")).json()).status !== "ok") throw new Error();
    const openapiBytes = Buffer.from(await (await request("/openapi.json")).arrayBuffer());
    if (JSON.parse(openapiBytes.toString("utf8")).info?.version !== profile.server_version) throw new Error();
    const form = new FormData();
    form.append("files", new Blob([source], { type: "application/pdf" }), basename(file));
    for (const [key, value] of Object.entries(profile.request)) {
      if (Array.isArray(value)) for (const item of value) form.append(key, String(item));
      else form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    onPhase("PDF 전송 중");
    submittedAt = new Date().toISOString();
    // Exactly one submission. Upload uncertainty never authorizes replay.
    let status = await (await request("/v1/convert/file/async", { method: "POST", body: form })).json();
    if (typeof status.task_id !== "string" || !status.task_id || status.task_id.length > 512) throw new Error();
    taskId = status.task_id;
    for (;;) {
      signal.throwIfAborted();
      if (status.task_id !== taskId || status.task_type !== "convert") throw new Error();
      if (status.task_status === "success") break;
      if (!["pending", "started"].includes(status.task_status)) throw new Error();
      onPhase(status.task_status === "pending" ? "서버 대기 중" : "PDF 변환 중", taskId);
      await delay(1000, undefined, { signal });
      status = await (await request("/v1/status/poll/" + encodeURIComponent(taskId))).json();
    }
    const resultBody = Buffer.from(await (await request("/v1/result/" + encodeURIComponent(taskId))).arrayBuffer());
    onPhase("원본 보관 준비 중", taskId);
    const completedAt = new Date().toISOString();
    const bytes = createDoclingArchiveFromResult({ sourceName: basename(file), sourceBytes: source, serverVersions: versions, openapiBytes, profile,
      task: { id: taskId, startedAt, submittedAt, completedAt, elapsedMs: Date.now() - started }, resultBody });
    if (hash(await readFile(file, { signal })) !== originalHash) throw new Error();
    signal.throwIfAborted();
    return bytes;
  } catch (cause) {
    const kind = deadline.aborted ? "timeout" : callerSignal?.aborted ? "stopped" : cause.kind ?? "failed";
    throw Object.assign(new Error(`Docling conversion ${kind}${taskId ? ` (task ${taskId})` : " (task ID unavailable; do not resubmit automatically)"}`), { kind, ...(taskId ? { taskId } : {}) });
  }
}
