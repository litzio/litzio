import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { Ajv } from "ajv";
import path from "node:path";
import type { HostPlugin, PluginHostContext } from "@litzio/plugin-api/host";
import { AI_TASK, DEFAULT_AI_SETTINGS, type AiAgentSettings, type AiTaskRequest, type AiTaskService } from "@litzio/plugin-api/ai";
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
  const settings = (): AiAgentSettings => existsSync(host.settingsFile)
    ? checkedSettings(JSON.parse(readFileSync(host.settingsFile, "utf8"))) : { ...(host.aiDefaults ?? DEFAULT_AI_SETTINGS), provider: "codex", enabled: true, writeAccess: "opened-folders", responseLanguage: defaultLanguage() };
  const configure = (value: unknown) => {
    const next = checkedSettings(value);
    mkdirSync(path.dirname(host.settingsFile), { recursive: true });
    const temporary = `${host.settingsFile}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(next) + "\n", { flag: "wx" }); renameSync(temporary, host.settingsFile); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
    return next;
  };
  const service: AiTaskService = {
    status: () => settings().enabled ? selectedAdapter().status() : Promise.resolve({ adapter: "Codex", available: false, loginRequired: false, message: "Codex is disabled." }),
    start: value => {
      const current = settings(); if (!current.enabled && !host.aiExecutor.current(value.id)) throw new Error("Codex is disabled.");
      const execution = current.provider === "copilot" ? current.codexTaskSettings! : current;
      return host.aiExecutor.start(request(value, host), 120_000, { model: execution.model, reasoningEffort: execution.reasoningEffort, responseLanguage: current.responseLanguage ?? defaultLanguage() });
    },
    current: id => host.aiExecutor.current(id), cancel: id => host.aiExecutor.cancel(id),
  };
  return {
    aiTaskService: service, drainingOperations: ["current", "cancel", "start"],
    routes: { [AI_TASK.settingsRoute]: { GET: "settings", PUT: "configure" }, [AI_TASK.route]: { POST: "start", GET: "current", DELETE: "cancel" }, [AI_TASK.statusRoute]: { GET: "status" } },
    operations: { settings, configure, status: service.status, start: service.start, current: args => service.current(args.id), cancel: args => service.cancel(args.id) },
  };
}

function checkedSettings(value: unknown): AiAgentSettings {
  const v = value as AiAgentSettings;
  if (!v || typeof v.model !== "string" || !v.model.trim() || /[\r\n\x00]/u.test(v.model) ||
    typeof v.reasoningEffort !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v.reasoningEffort) ||
    v.provider !== undefined && !["codex", "copilot"].includes(v.provider) || v.enabled !== undefined && typeof v.enabled !== "boolean" ||
    v.writeAccess !== undefined && !["opened-folders", "read-only", "full-access"].includes(v.writeAccess) ||
    v.responseLanguage !== undefined && !["ko", "en", "ja"].includes(v.responseLanguage)) throw new Error("Invalid AI execution settings.");
  if (v.provider === "copilot" && (!v.codexTaskSettings || typeof v.codexTaskSettings.model !== "string" || !v.codexTaskSettings.model.trim() || /[\r\n\x00]/u.test(v.codexTaskSettings.model) ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(v.codexTaskSettings.reasoningEffort))) throw new Error("Invalid Codex task defaults.");
  return { model: v.model.trim(), reasoningEffort: v.reasoningEffort, provider: v.provider ?? "codex", enabled: v.enabled ?? true, writeAccess: v.writeAccess ?? "opened-folders",
    ...(v.provider === "copilot" ? { codexTaskSettings: { model: v.codexTaskSettings!.model, reasoningEffort: v.codexTaskSettings!.reasoningEffort } } : {}),
    ...(v.responseLanguage !== undefined ? { responseLanguage: v.responseLanguage } : {}) };
}

function defaultLanguage(): "ko" | "en" | "ja" { const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]; return language === "ko" || language === "ja" ? language : "en"; }
