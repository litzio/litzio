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
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("AI settings: expected an object.");
  const unknown = Object.keys(v).filter(key => !["provider", "model", "reasoningEffort", "writeAccess", "responseLanguage"].includes(key));
  if (unknown.length) throw new Error(`AI settings: unknown field(s): ${unknown.join(", ")}. Allowed: provider, model, reasoningEffort, writeAccess, responseLanguage.`);
  if (typeof v.model !== "string" || !v.model.trim() || /[\r\n\x00]/u.test(v.model)) throw new Error("AI model: expected a non-empty string without newline or NUL.");
  if (typeof v.reasoningEffort !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v.reasoningEffort)) throw new Error("AI reasoningEffort: expected 1-64 lowercase letters, digits or hyphens, starting with a letter.");
  if (!["codex", "copilot"].includes(v.provider)) throw new Error("AI provider: allowed values: codex, copilot.");
  if (v.writeAccess !== undefined && !["opened-folders", "read-only", "full-access"].includes(v.writeAccess)) throw new Error("AI writeAccess: allowed values: opened-folders, read-only, full-access.");
  if (v.responseLanguage !== undefined && !["ko", "en", "ja"].includes(v.responseLanguage)) throw new Error("AI responseLanguage: allowed values: ko, en, ja.");
  return { model: v.model.trim(), reasoningEffort: v.reasoningEffort, provider: v.provider ?? "codex", writeAccess: v.writeAccess ?? "opened-folders",
    ...(v.responseLanguage !== undefined ? { responseLanguage: v.responseLanguage } : {}) };
}

function defaultLanguage(): "ko" | "en" | "ja" { const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]; return language === "ko" || language === "ja" ? language : "en"; }
