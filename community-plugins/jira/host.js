import { PluginOperationError } from "@litzio/plugin-sdk";

// A single operation deadline stays within the Host's 10-second RPC budget.
const DEADLINE_MS = 8000;
function httpUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.includes("?") || url.href.includes("#")) throw new Error();
    return url.href.replace(/\/+$/, "");
  } catch { throw new PluginOperationError("failed"); }
}
const text = value => typeof value === "string" && value.trim() ? value : "—";
const missing = (key, issueUrl) => ({ key, issueUrl, summary: "—", status: "이슈를 찾을 수 없습니다. 번호와 접근 권한을 확인하세요. (404)", assignee: "—", priority: "—", updated: "—" });

/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const requests = new Set();
  return {
    operations: {
      async issues(input) {
        if (typeof input?.keys !== "string" || input.keys.length > 512 || !/^\s*[A-Z][A-Z0-9_]*-[1-9][0-9]*(?:\s*,\s*[A-Z][A-Z0-9_]*-[1-9][0-9]*){0,19}\s*$/.test(input.keys)) throw new PluginOperationError("failed");
        const base = httpUrl(String(context.settings.baseUrl ?? ""));
        const api = context.settings.apiUrl ? httpUrl(String(context.settings.apiUrl)) : base + "/rest/api/2";
        const pat = context.secrets?.pat;
        if (!pat) throw new PluginOperationError("auth");
        const controller = new AbortController();
        requests.add(controller);
        const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
        try {
          const rows = [];
          for (const key of [...new Set(input.keys.split(",").map(value => value.trim()))]) {
            const issueUrl = base + "/browse/" + encodeURIComponent(key);
            const response = await fetch(api + "/issue/" + encodeURIComponent(key), {
              headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
              signal: controller.signal, redirect: "error",
            });
            if (!response.ok) {
              await response.body?.cancel();
              if (response.status === 404) { rows.push(missing(key, issueUrl)); continue; }
              throw new PluginOperationError(response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : response.status >= 500 ? "unavailable" : "failed");
            }
            const body = await response.json();
            if (!body || typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields)) throw new PluginOperationError("failed");
            const f = body.fields;
            rows.push({ key, issueUrl, summary: text(f.summary), status: text(f.status?.name), assignee: text(f.assignee?.displayName), priority: text(f.priority?.name), updated: text(f.updated) });
          }
          return rows;
        } catch (error) {
          if (controller.signal.aborted) throw new PluginOperationError("timeout");
          if (error instanceof PluginOperationError) throw error;
          throw new PluginOperationError("failed");
        } finally { clearTimeout(timer); requests.delete(controller); }
      },
    },
    status: () => ({ available: true, message: "이슈 번호를 입력하고 수동 조회하세요.", folders: [], decorations: [], accounts: [] }),
    dispose() { for (const controller of requests) controller.abort(); },
  };
}
