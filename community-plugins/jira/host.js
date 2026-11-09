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
const SEARCH_FIELDS = "summary,status,assignee,reporter,created,updated,priority,issuetype,resolution,duedate,components,labels";
function localTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const pad = v => String(v).padStart(2, "0");
  return `${pad(d.getFullYear() % 100)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const shortDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(2) : "—";
const row = (key, issueUrl, f = {}) => ({ key, issueUrl, summary: text(f.summary), status: text(f.status?.name), assignee: text(f.assignee?.displayName), reporter: text(f.reporter?.displayName), created: localTimestamp(f.created), priority: text(f.priority?.name), updated: localTimestamp(f.updated), issueType: text(f.issuetype?.name), resolution: text(f.resolution?.name), dueDate: shortDate(f.duedate), components: text(f.components?.map(v => v.name).join(", ")), labels: text(f.labels?.join(", ")) });
const literal = value => JSON.stringify(value);
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new PluginOperationError("failed");
  return value;
}
function searchJql(input) {
  for (const key of ["account", "reporter", "project", "dateFrom", "dateTo"]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || input[key].length > 254 || /[\u0000-\u001f\u007f]/.test(input[key]))) throw new PluginOperationError("failed");
  }
  const clauses = ["assignee = " + (input.account?.trim() ? literal(input.account.trim()) : "currentUser()")];
  const status = input.status ?? "미해결";
  if (!["전체", "해결됨", "미해결"].includes(status)) throw new PluginOperationError("failed");
  if (status !== "전체") clauses.push(status === "해결됨" ? "resolution IS NOT EMPTY" : "resolution = Unresolved");
  if (input.project) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(input.project)) throw new PluginOperationError("failed");
    clauses.push("project = " + literal(input.project));
  }
  if (input.reporter?.trim()) clauses.push("reporter = " + literal(input.reporter.trim()));
  if (input.dateField !== undefined && !["수정일", "생성일"].includes(input.dateField)) throw new PluginOperationError("failed");
  {
    const field = input.dateField === "생성일" ? "created" : "updated";
    const from = input.dateFrom, to = input.dateTo;
    if (from) clauses.push(field + " >= " + literal(date(from)));
    if (to) {
      const next = new Date(date(to)); next.setUTCDate(next.getUTCDate() + 1);
      if (next.getUTCFullYear() > 9999) throw new PluginOperationError("failed");
      clauses.push(field + " < " + literal(next.toISOString().slice(0, 10)));
    }
    if (from && to && from > to) throw new PluginOperationError("failed");
  }
  return clauses.join(" AND ") + " ORDER BY updated DESC";
}

/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const requests = new Set();
  async function search(input = {}) {
    if (typeof input.jql !== "string" || !input.jql.trim() || input.jql.length > 4000) throw new PluginOperationError("failed");

    const base = httpUrl(String(context.settings.baseUrl ?? ""));
    const api = context.settings.apiUrl ? httpUrl(String(context.settings.apiUrl)) : base + "/rest/api/2";
    const pat = context.secrets?.pat;
    if (!pat) throw new PluginOperationError("auth");
    const controller = new AbortController();
    requests.add(controller);
    const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    try {
      const rows = [];
      const jql = input.jql;
      let startAt = 0;
      while (rows.length < 500) {
        const query = new URLSearchParams({ jql, startAt: String(startAt), maxResults: String(500 - rows.length), fields: SEARCH_FIELDS });
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
          rows.push(row(issue.key, base + "/browse/" + encodeURIComponent(issue.key), f));
        }
        startAt += body.issues.length;
        if (startAt >= body.total) break;
      }
      return rows;
    } catch (error) {
      if (controller.signal.aborted) throw new PluginOperationError("timeout");
      if (error instanceof PluginOperationError) throw error;
      throw new PluginOperationError("failed");
    } finally { clearTimeout(timer); requests.delete(controller); }
  }
  async function read(suffix) {
    const base = httpUrl(String(context.settings.baseUrl ?? ""));
    const api = context.settings.apiUrl ? httpUrl(String(context.settings.apiUrl)) : base + "/rest/api/2";
    const pat = context.secrets?.pat;
    if (!pat) throw new PluginOperationError("auth");
    const controller = new AbortController(); requests.add(controller);
    const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    try {
      const response = await fetch(api + suffix, { headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" }, signal: controller.signal, redirect: "error" });
      if (!response.ok) {
        await response.body?.cancel();
        throw new PluginOperationError(response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status >= 500 ? "unavailable" : "failed");
      }
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new PluginOperationError("timeout");
      if (error instanceof PluginOperationError) throw error;
      throw new PluginOperationError("failed");
    } finally { clearTimeout(timer); requests.delete(controller); }
  }
  const candidates = items => [...new Map(items.map(item => [item.value, item])).values()].slice(0, 32);
  return {
    operations: {
      async "current-account"() {
        const user = await read("/myself");
        if (typeof user?.displayName !== "string" || !user.displayName.trim()) throw new PluginOperationError("failed");
        return { text: user.displayName.slice(0, 512) };
      },
      async users({ query }) {
        const body = await read("/user/picker?" + new URLSearchParams({ query, maxResults: "32" }));
        if (!Array.isArray(body?.users) || body.users.some(user => typeof user?.name !== "string" || !user.name || typeof user.displayName !== "string")) throw new PluginOperationError("failed");
        return candidates(body.users.filter(user => user.name.length <= 254 && !/[\u0000-\u001f\u007f]/.test(user.name)).map(user => ({ value: user.name, label: `${user.displayName} (${user.name})`.slice(0, 512) })));
      },
      async projects({ query }) {
        const body = await read("/project");
        if (!Array.isArray(body) || body.some(project => typeof project?.key !== "string" || typeof project.name !== "string")) throw new PluginOperationError("failed");
        const match = query.toLocaleLowerCase();
        return candidates(body.filter(project => /^[A-Z][A-Z0-9_]*$/.test(project.key) && project.key.length <= 128 && `${project.key} ${project.name}`.toLocaleLowerCase().includes(match)).map(project => ({ value: project.key, label: `${project.name} (${project.key})`.slice(0, 512) })));
      },
      async jql(input) { return search(input); },
      async issues(input = {}) {
        if (input.keys !== undefined) {
          if (typeof input.keys !== "string" || input.keys.length > 512 || !/^\s*[A-Z][A-Z0-9_]*-[1-9][0-9]*(?:\s*,\s*[A-Z][A-Z0-9_]*-[1-9][0-9]*){0,19}\s*$/.test(input.keys)) throw new PluginOperationError("failed");
          return search({ jql: "key in (" + [...new Set(input.keys.split(",").map(v => v.trim()))].map(literal).join(", ") + ") ORDER BY updated DESC" });
        }
        return search({ jql: searchJql(input) });
      },
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
      async detail(input) {
        if (typeof input?.key !== "string" || input.key.length > 128 || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(input.key)) throw new PluginOperationError("failed");
        const base = httpUrl(String(context.settings.baseUrl ?? ""));
        const api = context.settings.apiUrl ? httpUrl(String(context.settings.apiUrl)) : base + "/rest/api/2";
        const pat = context.secrets?.pat;
        if (!pat) throw new PluginOperationError("auth");
        const controller = new AbortController(); requests.add(controller);
        const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
        const get = async suffix => {
          const response = await fetch(api + "/issue/" + encodeURIComponent(input.key) + suffix, { headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" }, signal: controller.signal, redirect: "error" });
          if (!response.ok) {
            await response.body?.cancel();
            throw new PluginOperationError(response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status >= 500 ? "unavailable" : "failed");
          }
          return response.json();
        };
        try {
          const issue = await get("");
          if (issue?.key !== input.key || !issue.fields || typeof issue.fields !== "object" || Array.isArray(issue.fields)) throw new PluginOperationError("failed");
          const description = issue.fields.description ?? "";
          if (typeof description !== "string") throw new PluginOperationError("failed");
          // Newest ten by creation, in one bounded request even for large threads.
          const page = await get("/comment?" + new URLSearchParams({ orderBy: "-created", startAt: "0", maxResults: "10" }));
          if (!Array.isArray(page?.comments) || !Number.isSafeInteger(page.total) || page.total < 0 || page.startAt !== 0 || page.comments.length > 10 || page.comments.length > page.total || (!page.comments.length && page.total > 0)) throw new PluginOperationError("failed");
          const comments = page.comments.map(c => {
            if (typeof c?.id !== "string" || typeof c.body !== "string" || typeof c.created !== "string" || typeof c.updated !== "string") throw new PluginOperationError("failed");
            return { id: c.id, author: text(c.author?.displayName), created: localTimestamp(c.created), updated: localTimestamp(c.updated), body: c.body.slice(0, 4000), bodyTruncated: c.body.length > 4000 };
          });
          return { key: input.key, issueUrl: base + "/browse/" + encodeURIComponent(input.key), fetchedAt: localTimestamp(new Date().toISOString()), summary: text(issue.fields.summary), description: description.slice(0, 16000), descriptionTruncated: description.length > 16000, commentsTotal: page.total, commentsStartAt: 0, commentsReturned: comments.length, comments };
        } catch (error) {
          if (controller.signal.aborted) throw new PluginOperationError("timeout");
          if (error instanceof PluginOperationError) throw error;
          throw new PluginOperationError("failed");
        } finally { clearTimeout(timer); requests.delete(controller); }
      },

    },
    status: () => ({ available: true, message: "JQL 또는 간편 검색으로 수동 조회하세요.", folders: [], decorations: [], accounts: [] }),
    dispose() { for (const controller of requests) controller.abort(); },
  };
}
