import { DEFAULT_ASSISTANT_SETTINGS, DEFAULT_OLLAMA_URL, checkedOllamaUrl, type AssistantSettings } from "../shared/assistant.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";

export function createAssistantSettings(settingsFile: string, assistantDefaults = DEFAULT_ASSISTANT_SETTINGS) {
  const defaults = (): AssistantSettings => ({ ...(assistantDefaults), provider: "codex", permissionMode: "full-access", copilotModelSource: "account", ollamaUrl: DEFAULT_OLLAMA_URL, responseLanguage: defaultLanguage() });
  const settings = (): AssistantSettings => {
    if (!existsSync(settingsFile)) return defaults();
    const value = JSON.parse(readFileSync(settingsFile, "utf8"));
    return checkedAssistantSettings(value);
  };
  const configure = (value: unknown) => {
    const next = checkedAssistantSettings(value);
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    const temporary = `${settingsFile}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(next) + "\n", { flag: "wx" }); renameSync(temporary, settingsFile); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
    return next;
  };
  return { settings, configure };
}

export function checkedAssistantSettings(value: unknown): AssistantSettings {
  const v = value as AssistantSettings;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Assistant settings: expected an object.");
  const fields = ["provider", "model", "reasoningEffort", "permissionMode", "responseLanguage", "copilotModelSource", "ollamaUrl"];
  const unknown = Object.keys(v).filter(key => !fields.includes(key));
  if (unknown.length) throw new Error(`Assistant settings: unknown field(s): ${unknown.join(", ")}. Allowed: ${fields.join(", ")}.`);
  if (typeof v.model !== "string" || !v.model.trim() || /[\r\n\x00]/u.test(v.model)) throw new Error("AI model: expected a non-empty string without newline or NUL.");
  if (typeof v.reasoningEffort !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v.reasoningEffort)) throw new Error("AI reasoningEffort: expected 1-64 lowercase letters, digits or hyphens, starting with a letter.");
  if (!["codex", "copilot"].includes(v.provider)) throw new Error("AI provider: allowed values: codex, copilot.");
  if (v.permissionMode !== undefined && !["opened-folders", "read-only", "full-access"].includes(v.permissionMode)) throw new Error("AI permissionMode: allowed values: opened-folders, read-only, full-access.");
  if (v.responseLanguage !== undefined && !["ko", "en", "ja"].includes(v.responseLanguage)) throw new Error("AI responseLanguage: allowed values: ko, en, ja.");
  if (v.copilotModelSource !== undefined && !["account", "ollama"].includes(v.copilotModelSource)) throw new Error("AI copilotModelSource: allowed values: account, ollama.");
  return { model: v.model.trim(), reasoningEffort: v.reasoningEffort, provider: v.provider ?? "codex", permissionMode: v.permissionMode ?? "full-access",
    copilotModelSource: v.copilotModelSource ?? "account", ollamaUrl: v.ollamaUrl === undefined ? DEFAULT_OLLAMA_URL : checkedOllamaUrl(v.ollamaUrl),
    ...(v.responseLanguage !== undefined ? { responseLanguage: v.responseLanguage } : {}) };
}

function defaultLanguage(): "ko" | "en" | "ja" { const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]; return language === "ko" || language === "ja" ? language : "en"; }
