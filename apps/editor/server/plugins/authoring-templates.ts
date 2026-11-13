import { HEALTH_CHECK_OUTPUT_SCHEMA } from "@litzio/plugin-sdk";

// These are artifact examples, not new screen kinds. The bundled app owns layout.
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false });
const operation = (id: string, effect: "read" | "write", inputSchema: unknown, outputSchema: unknown) => ({ id, version: 1, effect, scope: "host", assistant: false, inputSchema, outputSchema });

export function authoringTemplate(id: string, template: "query" | "file" | "screen" | "chart") {
  if (template === "screen" || template === "chart") return {
    manifest: { name: "측정값", contributes: {
      operations: [],
      screens: [{ id: "measurements", title: "측정값", icon: "ChartColumn", entry: "screen.jsx", primary: true }],
    } },
    source: `export function activate(context) {
  return {
    operations: {
      measurements: () => [10, 18, 12, 24],
    },
    status: () => ({
      available: true,
      message: "Ready",
      folders: [], decorations: [], accounts: [],
    }),
    dispose() {},
  };
}\n`,
    screen: `export default function Screen({React, ui, invoke}) {
  const [values,setValues] = React.useState([]), [error,setError] = React.useState("");
  const rows = values.map((value,time)=>({time,value}));
  return <ui.ScreenLayout description="시간에 따른 측정값">
    <ui.Toolbar>
      <ui.Button onClick={()=>invoke("measurements").then(setValues).catch(e=>setError(e.message))}>불러오기</ui.Button>
      <ui.SummaryCard label="합계" value={values.reduce((a,b)=>a+b,0)}/>
    </ui.Toolbar>
    {error && <ui.Notice tone="error">{error}</ui.Notice>}
    <ui.Chart title="측정값" data={rows} xKey="time" yKey="value" baseline={15}/>
    <ui.DataTable title="측정값" rows={rows} columns={["time","value"]} fields={{value:{type:"number"}}}/>
  </ui.ScreenLayout>;
}\n`,
  };
  if (template === "query") {
    const row = object({ title: { type: "string" }, status: { type: "string" } }, ["title", "status"]);
    return {
      manifest: {
        name: "업무 조회 예제", description: "예제 업무를 조건으로 찾아봅니다.",
        settingsSchema: object({ workspace: { type: "string", title: "연결 이름", description: "선택: 데모 연결 이름을 저장합니다.", minLength: 1 } }),
        secrets: [{ id: "token", title: "연결 토큰", description: "선택: 예제는 토큰 없이 동작합니다. 실제 서비스 연결 시 바꾸세요.", scope: "connection", required: false }],
        contributes: {
          healthCheck: "connection",
          operations: [
            { ...operation("search", "read", object({ text: { type: "string", title: "검색어" }, status: { type: "string", title: "상태", enum: ["전체", "진행 중", "완료"] } }), object({ rows: { type: "array", items: row }, truncated: { type: "boolean" }, total: { type: "integer", minimum: 0 } }, ["rows", "truncated", "total"])), assistant: true, rowSchema: { title: { type: "string", label: "업무 이름" }, status: { type: "string", label: "상태" } } },
            operation("connection", "read", object({}), HEALTH_CHECK_OUTPUT_SCHEMA),
          ],
          views: [{ id: "search", title: "업무 찾기", definition: {
            kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: id, title: "업무 찾기", refresh: "manual",
            sources: { stats: { kind: "operation", operation: `${id}.search`, version: 1, args: { status: "전체" } } },
            layout: { component: "Panel", direction: "vertical", children: [{ component: "Table", title: "조건에 맞는 업무", source: "stats", data: "/rows", columns: ["title", "status"] }] },
            form: { component: "InputForm", source: "stats", fields: [{ component: "TextInput", field: "text" }, { component: "Select", field: "status", advanced: true }], submit: { component: "SubmitButton", label: "조회" } },
          } }],
          screens: [{ id: "search", title: "업무 조회", icon: "Table", defaultViewIds: ["search"], primary: true }],
        },
      },
      source: `import { PluginOperationError } from "@litzio/plugin-sdk";
// Host provides the SDK. Replace sample rows with your service call here.
// Map external failures to auth/forbidden/not_found/unavailable/timeout/failed only.
export function activate(context) {
  return {
    operations: {
      connection: () => ({ ok: true, message: context.settings.workspace ? "데모 연결을 확인했습니다." : "예제 데이터로 실행합니다. 실제 연결은 설정에서 연결 이름과 토큰을 저장하세요." }),
      search: ({ text = "", status = "전체" }) => {
        const rows = [{ title: "월간 보고서", status: "진행 중" }, { title: "회의 기록", status: "완료" }]
          .filter(row => row.title.includes(text) && (status === "전체" || row.status === status));
        // For real connections, missing values should throw new PluginOperationError("auth").
        return { rows, truncated: false, total: rows.length };
      },
    },
    status: () => ({ available: true, message: "예제 데이터 준비됨", folders: [], decorations: [], accounts: [] }),
    dispose() {},
  };
}
`,
    };
  }
  const input = object({ requestId: { type: "string" }, root: { type: "string" }, file: { type: "string" }, output: { type: "string" }, resultFile: object({ path: { type: "string" }, maxBytes: { type: "number" } }, ["path", "maxBytes"]) }, ["requestId", "root", "file", "output", "resultFile"]);
  const update = object({ state: { enum: ["running", "completed", "failed", "stopped"] }, phase: { type: "string" }, progress: object({ done: { type: "number" }, total: { type: "number" } }, ["done", "total"]), errorKind: { enum: ["auth", "forbidden", "not_found", "unavailable", "timeout", "failed"] }, file: object({ path: { type: "string" } }, ["path"]) }, ["state", "phase"]);
  return {
    manifest: { name: "파일 처리 예제", description: "선택한 텍스트를 대문자로 바꿔 새 파일에 저장합니다.", contributes: {
      operations: [operation("start", "write", input, update), operation("status", "read", input, update), operation("stop", "write", input, update)],
      jobs: [{ id: "convert", title: "대문자로 변환", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "file", resultExtension: ".upper" }],
      screens: [{ id: "convert", title: "텍스트 변환", icon: "FileText", jobs: ["convert"], primary: true }],
    } },
    source: `import { readFile, writeFile } from "node:fs/promises";
import { PluginOperationError } from "@litzio/plugin-sdk";
export function activate(context) {
  // State belongs to this activation and each requestId; reload never resumes work.
  const jobs = new Map();
  const snapshot = job => job.update;
  const find = requestId => { const job = jobs.get(requestId); if (!job) throw new PluginOperationError("not_found"); return job; };
  const stop = job => { if (job.update.state === "running") job.controller.abort(); };
  return {
    operations: {
      start: input => {
        if (jobs.has(input.requestId)) throw new PluginOperationError("failed");
        const job = { controller: new AbortController(), update: { state: "running", phase: "변환 중", progress: { done: 0, total: 1 } } };
        jobs.set(input.requestId, job);
        // Accept promptly. Replace only the transformation, preserving cancellation and staging.
        job.work = (async () => {
          const signal = job.controller.signal;
          const text = await readFile(input.file, { encoding: "utf8", signal });
          const bytes = Buffer.from(text.toUpperCase(), "utf8");
          if (bytes.length > input.resultFile.maxBytes) throw new PluginOperationError("failed");
          signal.throwIfAborted();
          // Host already created staging; truncate/write it, never use exclusive-create (wx).
          await writeFile(input.resultFile.path, bytes, { signal });
          signal.throwIfAborted();
          // Only Host publishes the final output; never write input.output directly.
          job.update = { state: "completed", phase: "변환 완료", progress: { done: 1, total: 1 }, file: { path: input.resultFile.path } };
        })().catch(() => {
          job.update = job.controller.signal.aborted ? { state: "stopped", phase: "중단됨" } : { state: "failed", phase: "실패", errorKind: "failed" };
        });
        return snapshot(job);
      },
      status: ({ requestId }) => snapshot(find(requestId)),
      stop: async ({ requestId }) => { const job = find(requestId); stop(job); await job.work; return snapshot(job); },
    },
    status: () => ({ available: true, message: "텍스트 처리 준비됨", folders: [], decorations: [], accounts: [] }),
    async dispose() { for (const job of jobs.values()) stop(job); await Promise.all([...jobs.values()].map(job => job.work)); jobs.clear(); },
  };
}
`,
  };
}
