import { DEFAULT_AI_SETTINGS, type AiAgentSettings } from "../shared/ai.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";

export function createAiSettings(settingsFile: string, aiDefaults = DEFAULT_AI_SETTINGS) {
  const defaults = (): AiAgentSettings => ({ ...(aiDefaults), provider: "codex", writeAccess: "opened-folders", responseLanguage: defaultLanguage() });
  const settings = (): AiAgentSettings => {
    if (!existsSync(settingsFile)) return defaults();
    const value = JSON.parse(readFileSync(settingsFile, "utf8"));
    return checkedAiSettings(value);
  };
  const configure = (value: unknown) => {
    const next = checkedAiSettings(value);
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const temporary = `${settingsFile}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(next) + "\n", { flag: "wx" }); renameSync(temporary, settingsFile); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
    return next;
  };
  return { settings, configure };
}

export function checkedAiSettings(value: unknown): AiAgentSettings {
  const v = value as AiAgentSettings;
  if (!v || Object.keys(v).some(key => !["provider", "model", "reasoningEffort", "writeAccess", "responseLanguage"].includes(key)) || typeof v.model !== "string" || !v.model.trim() || /[\r\n\x00]/u.test(v.model) ||
    typeof v.reasoningEffort !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v.reasoningEffort) ||
    !["codex", "copilot"].includes(v.provider) ||
    v.writeAccess !== undefined && !["opened-folders", "read-only", "full-access"].includes(v.writeAccess) ||
    v.responseLanguage !== undefined && !["ko", "en", "ja"].includes(v.responseLanguage)) throw new Error("Invalid AI execution settings.");
  return { model: v.model.trim(), reasoningEffort: v.reasoningEffort, provider: v.provider ?? "codex", writeAccess: v.writeAccess ?? "opened-folders",
    ...(v.responseLanguage !== undefined ? { responseLanguage: v.responseLanguage } : {}) };
}

function defaultLanguage(): "ko" | "en" | "ja" { const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]; return language === "ko" || language === "ja" ? language : "en"; }
