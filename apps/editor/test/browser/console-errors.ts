import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";

type ExpectedConsoleErrorRule = {
  text?: string;
  status?: number;
  networkError?: string;
  pathname: string;
  minimum: number;
  queryPath?: string;
  description: string;
};

const EXPECTED_CONSOLE_ERRORS: Record<string, ExpectedConsoleErrorRule[]> = {
  "local-host": [{status:503,pathname:"/api/host-capabilities",minimum:1,description:"local observation recovers after outage"}],
  "vite-plugins": [{ status: 400, pathname: "/api/plugins", minimum: 2, description: "Invalid external artifact keeps the folder picker open for correction" }],
  "template-gallery": [{ status: 400, pathname: "/api/templates", minimum: 2, description: "reserved and duplicate template names retain the save form with localized feedback" }],
  "assistant": [{ status: 503, pathname: "/api/assistant/diagnostics", minimum: 1, description: "usage tooltip failure remains local and does not block chat" }, { status: 503, pathname: "/api/assistant/conversations", minimum: 1, description: "lost submission response leaves acceptance uncertain" }, { status: 503, pathname: "/api/assistant/settings", minimum: 1, description: "automatic save failure is localized and a later change can save" }, { status: 503, pathname: "/api/assistant/skills", minimum: 1, description: "skill catalog failure is shown in the candidate list" }, { status: 404, pathname: "/api/assistant/conversations", minimum: 1, description: "a deliberately unavailable last conversation falls back to a fresh composer" }],
  "external-change": [{ status: 409, pathname: "/api/document", minimum: 1, description: "a real external write refuses Save and offers comparison and confirmed Reload" }],
  "text-mode": [
    {status:400, pathname:"/api/document", minimum:1, description:"a text session cannot raw-save a file that has become native"},
    {status:409, pathname:"/api/document", minimum:1, description:"recovered text refuses an external revision without losing local input"},
  ],
  "reference-save-reload": [
    {status:400, pathname:"/api/document", minimum:1, description:"final Save refuses a fixed number on an empty equation"},
  ],
  "pre-save-diff": [
    {status:503, pathname:"/api/document-compare", minimum:1, description:"an explicitly refused Visual request explains fallback to Source"},
    {status:409, pathname:"/api/document", minimum:1, description:"comparison preserves the acknowledged revision and Save still conflicts"},
  ],
  "plugin-screen-code": [{status:400, pathname:"/api/document", minimum:1, description:"duplicate screen document name is rejected and shown without replacing tabs"},{pathname:"", text:"Fixture cleanup failure", minimum:1, description:"screen cleanup error is caught by its boundary"},{pathname:"", text:"Fixture screen failure", minimum:1, description:"screen render error is caught by its boundary"}],
  "save-error": [
    {status:400, pathname:"/api/document", minimum:5, description:"Core refuses unpreservable table-cell inline math at the current submitted location"},
  ],
  "file-actions": [
    { status:500, pathname:"/api/file", minimum:1, description:"failed deletion preserves its tab and recovery without replay" },
    { status:400, pathname:"/api/folder-trash", minimum:1, description:"folder changed after confirmation refuses without invoking trash" },
    { status:400, pathname:"/api/file", minimum:2, description:"duplicate file name and dirty referenced image renames are refused" },
  ],
  "ui-language": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "conflict guidance follows language changes while preserving edits"},
  ],
  "recovery": [
    {status: 500, pathname: "/api/document-source", minimum: 1, description: "comparison transport failure keeps recovery actions available"},
    {status: 409, pathname: "/api/document", minimum: 1, description: "restored work retains its acknowledged revision against another window's Save"},
    {status: 400, pathname: "/api/document", minimum: 1, description: "failed Reload retains its local recovery record"},
  ],
  "writeability-preflight": [
    {status: 400, pathname: "/api/document", minimum: 4, description: "injected Host failures on Open, Reload, startup and sample opening"},
    {status: 403, pathname: "/api/document", minimum: 1, description: "non-native Open permission failure"},
  ],
  "http-host": [
    { status: 409, pathname: "/api/document", minimum: 1, description: "HTTP Save preserves local input after another writer commits" },
  ],
  "image-assets": [
    { status: 400, pathname: "/api/file", minimum: 1, description: "mocked Figure rename rejection preserves all form fields" },
    { status: 404, pathname: "/document/assets/missing.png", queryPath: path.join(REPOSITORY_ROOT, "tmp", "image-assets", "paths.md"), minimum: 1, description: "a missing Figure image shows its load failure" },
    { status: 400, pathname: "/api/asset", minimum: 1, description: "mocked Host write rejection keeps the document unchanged" },
    { status: 403, pathname: "/api/asset", minimum: 1, description: "mocked rollback failure exposes the remaining asset path" },
  ],
  "save-session": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "external edit conflicts with the retained session"},
    {status: 400, pathname: "/api/document", minimum: 2, description: "invalid content and a mocked failed save retain pending work"},
  ],
  "editor-shell": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "mocked save rejection"},
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "open-files": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "failed Save cancels the document switch"},
    {
      status: 404,
      pathname: "/document/diagram.svg",
      queryPath: path.join(REPOSITORY_ROOT, "tmp", "open-files", "litzio-a.md"),
      minimum: 1,
      description: "missing diagram for mocked file A",
    },
    {
      status: 404,
      pathname: "/document/diagram.svg",
      queryPath: path.join(REPOSITORY_ROOT, "tmp", "open-files", "litzio-b.md"),
      minimum: 1,
      description: "missing diagram for mocked file B",
    },
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "save-during-edit": [
    {status: 409, pathname: "/api/document", minimum: 1, description: "mocked save conflict"},
  ],
  "link-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable link save"},
  ],
  "image-link-preview": [
    { status: 404, pathname: "/document/missing.png", queryPath: path.join(REPOSITORY_ROOT, "tmp", "image-link-preview", "links.md"), minimum: 1, description: "missing linked image shows its load failure" },
  ],
  "inline-math-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable inline math save"},
  ],
  "admonition-authoring": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "rejected unpreservable admonition edit"},
  ],
  "folder-navigation": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "folder New refuses to overwrite an existing document"},
    {status: 400, pathname: "/api/folder", minimum: 1, description: "a missing folder or file cannot be opened as a folder, and New folder rejects reserved or existing names"},
    {status: 400, pathname: "/api/folder-browse", minimum: 1, description: "a missing folder cannot be browsed"},
  ],
  "folder-memory": [
    {status: 400, pathname: "/api/folder", minimum: 1, description: "a remembered missing folder is quietly skipped during restoration"},
  ],
  "document-tabs": [
    {status: 400, pathname: "/api/document", minimum: 1, description: "missing or non-native remembered documents are quietly excluded, and an open file may be removed externally"},
    {status: 403, pathname: "/api/document", minimum: 1, description: "a remembered path denied by the Host is quietly excluded"},
  ],
};

export function classifyConsoleErrors(scenario: string, messages: string[]) {
  const rules = EXPECTED_CONSOLE_ERRORS[scenario] ?? [];
  const matched = rules.map(() => 0);
  const unexpected: string[] = [];

  for (const message of messages) {
    const status = Number(message.match(/status of (\d{3}) \(/)?.[1]);
    const location = message.match(/ @ (https?:\/\/\S+)$/)?.[1];
    let url: URL | undefined;
    try {
      if (location) url = new globalThis.URL(location);
    } catch {
      // A malformed or non-HTTP console location cannot match an expected response.
    }
    const ruleIndex = rules.findIndex((rule) => rule.text ? !message.startsWith("Uncaught page error:") && message.includes(rule.text) : (rule.networkError ? message.includes(rule.networkError) : status === rule.status) && url?.pathname === rule.pathname &&
      (!rule.queryPath || rule.queryPath === url.searchParams.get("path")));
    if (ruleIndex < 0) {
      unexpected.push(message);
    } else {
      matched[ruleIndex] += 1;
    }
  }

  const missing = rules.flatMap((rule, index) =>
    matched[index] < rule.minimum ? [`${rule.minimum - matched[index]} × ${rule.description} (${rule.status ?? rule.networkError} ${rule.pathname})`] : []);
  const expected = rules.flatMap((rule, index) =>
    matched[index] > 0 ? [`${rule.status ?? rule.networkError} ${rule.pathname} × ${matched[index]} (${rule.description})`] : []);
  return {expected, unexpected, missing};
}
