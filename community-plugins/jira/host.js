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
const missing = (key, issueUrl) => ({ key, issueUrl, summary: "—", status: "없음 (404)", assignee: "—", priority: "—", updated: "—" });

/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const requests = new Set();
  return {
    operations: {
      async connection() {
        const result = (ok, message) => ({ ok, message });
        let api;
        try {
          const base = httpUrl(String(context.settings.baseUrl ?? ""));
          api = context.settings.apiUrl ? httpUrl(String(context.settings.apiUrl)) : base + "/rest/api/2";
        } catch { return result(false, "BASE_URL과 API URL의 HTTP(S) 주소를 확인하세요."); }
        const pat = context.secrets?.pat;
        if (!pat) return result(false, "인증에 실패했습니다. PAT를 확인하세요. (401)");
        const controller = new AbortController();
        requests.add(controller);
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(api + "/myself", { headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" }, signal: controller.signal, redirect: "error" });
          if (!response.ok) {
            await response.body?.cancel();
            return result(false, response.status === 401 ? "인증에 실패했습니다. PAT를 확인하세요. (401)" : response.status === 403 ? "접근 권한이 없습니다. 관리자에게 문의하세요. (403)" : "Jira 서버 응답을 확인하세요.");
          }
          const user = await response.json();
          return typeof user?.name === "string" && user.name ? result(true, "Jira 연결과 PAT 인증을 확인했습니다.") : result(false, "Jira 사용자 응답 형식을 확인하세요.");
        } catch { return result(false, controller.signal.aborted ? "연결 확인 시간이 초과됐습니다. 서버 연결을 확인하세요." : "Jira에 연결할 수 없습니다. 주소와 네트워크를 확인하세요."); }
        finally { clearTimeout(timer); requests.delete(controller); }
      },
      async issues(input) {
        if (input?.keys !== undefined && (typeof input.keys !== "string" || input.keys.length > 512 || !/^\s*[A-Z][A-Z0-9_]*-[1-9][0-9]*(?:\s*,\s*[A-Z][A-Z0-9_]*-[1-9][0-9]*){0,19}\s*$/.test(input.keys))) throw new PluginOperationError("failed");
        const base = httpUrl(String(context.settings.baseUrl ?? ""));
        const api = context.settings.apiUrl ? httpUrl(String(context.settings.apiUrl)) : base + "/rest/api/2";
        const pat = context.secrets?.pat;
        if (!pat) throw new PluginOperationError("auth");
        const controller = new AbortController();
        requests.add(controller);
        const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
        try {
          const rows = [];
          if (input.keys === undefined) {
            // Escape the complete JQL string literal, backslashes before quotes.
            const account = input.account?.trim();
            const assignee = account ? '"' + account.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' : "currentUser()";
            const status = input.status ?? "미해결";
            const jql = "assignee = " + assignee + (status === "전체" ? "" : status === "해결됨" ? " AND resolution IS NOT EMPTY" : " AND resolution = Unresolved") + " ORDER BY updated DESC";
            let startAt = 0;
            while (rows.length < 500) {
              const query = new URLSearchParams({ jql, startAt: String(startAt), maxResults: String(Math.min(100, 500 - rows.length)) });
              const response = await fetch(api + "/search?" + query, { headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" }, signal: controller.signal, redirect: "error" });
              if (!response.ok) {
                await response.body?.cancel();
                throw new PluginOperationError(response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status >= 500 ? "unavailable" : "failed");
              }
              const body = await response.json();
              if (!Array.isArray(body?.issues) || !Number.isSafeInteger(body.total) || body.total < 0 || body.startAt !== startAt || (!body.issues.length && startAt < body.total)) throw new PluginOperationError("failed");
              for (const issue of body.issues.slice(0, 500 - rows.length)) {
                if (typeof issue?.key !== "string" || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(issue.key) || !issue.fields || typeof issue.fields !== "object" || Array.isArray(issue.fields)) throw new PluginOperationError("failed");
                const f = issue.fields;
                rows.push({ key: issue.key, issueUrl: base + "/browse/" + encodeURIComponent(issue.key), summary: text(f.summary), status: text(f.status?.name), assignee: text(f.assignee?.displayName), priority: text(f.priority?.name), updated: text(f.updated) });
              }
              startAt += body.issues.length;
              if (startAt >= body.total) break;
            }
            return rows;
          }
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
    status: () => ({ available: true, message: "계정·해결 여부로 수동 조회하세요. 번호 입력 시 번호로 조회합니다.", folders: [], decorations: [], accounts: [] }),
    dispose() { for (const controller of requests) controller.abort(); },
  };
}
