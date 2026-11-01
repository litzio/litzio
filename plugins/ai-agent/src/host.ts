import { Ajv } from "ajv";
import path from "node:path";
import type { HostPlugin, PluginHostContext } from "@litzio/plugin-api/host";
import { AI_TASK, type AiTaskRequest, type AiTaskService } from "@litzio/plugin-api/ai";
import { selectedAdapter } from "./adapters.ts";

function request(value: AiTaskRequest, host: PluginHostContext): AiTaskRequest {
  if (!value || typeof value.id !== "string" || typeof value.caller !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.caller) ||
    typeof value.task !== "string" || !value.task.trim() || typeof value.instruction !== "string" || !value.instruction.trim() ||
    typeof value.baseline !== "string" || !Array.isArray(value.materials) || value.input === undefined || !value.schema || typeof value.schema !== "object") throw new Error("Invalid AI task message.");
  new Ajv({ strict: true }).compile(value.schema);
  const names = new Set<string>();
  const materials = value.materials.map(file => {
    if (!file || typeof file.path !== "string" || typeof file.name !== "string" || !file.name || /[\\:]/u.test(file.name) ||
      path.posix.isAbsolute(file.name) || file.name.split("/").some(part => !part || /[<>"|?*\x00-\x1f]/u.test(part) || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)) || names.has(file.name.toLowerCase())) throw new Error("Invalid snapshot material name.");
    names.add(file.name.toLowerCase()); return { path: host.resolvePath(file.path), name: file.name };
  });
  return JSON.parse(JSON.stringify({ id: value.id, caller: value.caller, task: value.task, instruction: value.instruction, materials,
    input: value.input, schema: value.schema, baseline: value.baseline }));
}
export function activate(host: PluginHostContext): HostPlugin {
  const service: AiTaskService = {
    status: () => selectedAdapter().status(),
    start: value => host.aiExecutor.start(request(value, host), 120_000),
    current: id => host.aiExecutor.current(id), cancel: id => host.aiExecutor.cancel(id),
  };
  return {
    aiTaskService: service, drainingOperations: ["current", "cancel", "start"],
    routes: { [AI_TASK.route]: { POST: "start", GET: "current", DELETE: "cancel" }, [AI_TASK.statusRoute]: { GET: "status" } },
    operations: { status: service.status, start: service.start, current: args => service.current(args.id), cancel: args => service.cancel(args.id) },
  };
}
