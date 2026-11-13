import path from "node:path";
import { DocumentDiagnosticError } from "@litzio/core";
import { FileChangedError } from "@litzio/file-commit";
import { ZodError } from "zod";
import { FileAccessError } from "./file-access.ts";
import type { HostToolCall, HostToolResult } from "./assistant-mcp.ts";

// Publication adapter only: no retries, new error classes, or persistent state.
const kinds = ["invalid_input", "conflict", "forbidden", "unavailable", "uncertain"];
export function assistantToolFailure(error: any, call: HostToolCall) {
  const code = error?.code;
  const errorKind = kinds.includes(error?.errorKind) ? error.errorKind
    : error instanceof ZodError || error instanceof DocumentDiagnosticError ? "invalid_input"
    : error instanceof FileChangedError || code === "EEXIST" ? "conflict"
    : error instanceof FileAccessError || ["EACCES", "EPERM"].includes(code) ? "forbidden"
    : code === "ENOENT" ? "unavailable"
    : readOnly(call) ? "unavailable" : "uncertain";
  return assistantToolValue({ error: error instanceof Error ? error.message : "Host tool failed.", errorKind,
    ...(error?.receipt ? {receipt:error.receipt} : {}), ...(error?.candidates ? {candidates:error.candidates} : {}) }, call);
}
function readOnly(call: HostToolCall) {
  return /^(read_|inspect_|list_|find_|estimate_)/.test(call.tool) || call.tool === "invoke_plugin_operation" ||
    call.tool === "manage_plugins" && ["list", "validate"].includes(call.arguments?.action);
}
export function assistantToolValue(value: any, call: HostToolCall): any {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const receipt = value.receipt ?? value.result?.receipt;
  if (!value.error && !value.errorKind && !["failure", "uncertain"].includes(receipt?.outcome)) return value;
  const legacy = value.errorKind ?? value.result?.errorKind;
  const errorKind = receipt?.outcome === "uncertain" ? "uncertain" : kinds.includes(legacy) ? legacy
    : ["auth", "forbidden"].includes(legacy) ? "forbidden" : "unavailable";
  const args = call.arguments ?? {};
  const requestId = receipt?.requestId ?? value.requestId ?? args.requestId;
  let recovery: any;
  if (errorKind === "invalid_input") recovery = {action:"correct_input", instruction:"Correct the reported input using the tool schema and current data, then submit a new request."};
  if (errorKind === "invalid_input" && (call.tool === "save_template" || call.tool === "create_document" && args.template !== undefined) && typeof (args.from ?? args.path) === "string" && !path.isAbsolute(args.from ?? args.path)) recovery = {action:"correct_input",instruction:"Resolve the relative path against the current opened folder, then submit a new request with an absolute path inside that opened folder. Ask the user to specify the target folder if it is missing; no permission change is required."};
  if (errorKind === "conflict") recovery = {action:"reread", tool:"read_document",
    arguments:{path:args.path}, instruction:"Read current state, reanalyse intended changes and submit a new request with the new revision. Do not resend stale input."};
  if (errorKind === "conflict" && call.tool === "manage_plugins") recovery = {action:"reread",tool:"manage_plugins",arguments:{action:"list"},instruction:"Read current registrationId/digest, reanalyse and issue a new request."};
  if (errorKind === "conflict" && ["save_template","create_document"].includes(call.tool)) recovery = {action:"reread",tool:call.tool === "save_template" ? "list_templates" : "read_document",arguments:call.tool === "save_template" ? {} : {path:args.path},instruction:"Inspect the existing target and choose a new unused name/path for the requested creation. Never overwrite."};
  if (errorKind === "forbidden") recovery = {action:"request_permission", instruction:call.tool === "invoke_plugin_operation"
    ? "Inspect manage_plugins list: use a declared assistant:true read or health operation. Private/write operations require their dedicated authorized workflow; broader turn permission cannot enable them. For service auth/permission errors ask the user to configure credentials or service access."
    : "Ask the user for Opened folders or Full access and an allowed target folder if required. never change permissions yourself."};
  if (errorKind === "unavailable") recovery = {action:"recheck", tool:call.tool.includes("template") ? "list_templates" : call.tool.includes("plugin") ? "manage_plugins" : "list_documents",
    ...(call.tool.includes("plugin") ? {arguments:{action:"list"}} : call.tool === "read_document" && typeof args.path === "string" ? {arguments:{path:path.dirname(args.path)}} : {}), instruction:"Safely recheck current availability/targets and choose an available path. Ask only when user action is required."};
  if (errorKind === "uncertain") recovery = {action:"observe", ...(requestId ? {requestId} : {}),
    ...(call.tool === "manage_plugins" ? {tool:"manage_plugins",arguments:{action:"list"}} : call.tool === "create_document" ? {tool:"read_document",arguments:{path:args.path}} : {}),
    instruction:"Do not replay the write. Query the existing requestId first when available; otherwise inspect the current target/result and reconcile it before proposing any new write. Missing status is not proof that nothing was written."};
  return {...value, errorKind, receipt:{...receipt,outcome:errorKind === "uncertain" ? "uncertain" : "failure"}, recovery};
}
export function assistantToolResult(result: HostToolResult, call: HostToolCall): HostToolResult {
  let success = result.success;
  const contentItems = result.contentItems.map(item => {
    if (item.type !== "inputText" || !item.text) return item;
    let value: any; try { value = JSON.parse(item.text); } catch { value = success === false ? {error:item.text,errorKind:readOnly(call)?"unavailable":"uncertain"} : undefined; }
    if (!value) return item;
    value = assistantToolValue(value, call);
    if (["failure", "uncertain"].includes(value.receipt?.outcome)) success = false;
    return {...item,text:JSON.stringify(value)};
  });
  return {...result,success,contentItems};
}
