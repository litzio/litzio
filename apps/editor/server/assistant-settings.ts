import { AI_PROVIDERS, DEFAULT_ASSISTANT_SETTINGS, DEFAULT_OLLAMA_URL, checkedOllamaUrl, isAiProvider, type AssistantSettings } from "../shared/assistant.ts";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";

export function createAssistantSettings(settingsFile: string, assistantDefaults = DEFAULT_ASSISTANT_SETTINGS) {
  const defaults = (): AssistantSettings => ({ ...(assistantDefaults), provider: "codex", permissionMode: "full-access", ollamaUrl: DEFAULT_OLLAMA_URL, responseLanguage: defaultLanguage() });
  const settings = (): AssistantSettings => {
    if (!existsSync(settingsFile)) return defaults();
    const value = JSON.parse(readFileSync(settingsFile, "utf8"));
    return checkedAssistantSettings(value, true);
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

const FIELDS = ["provider", "model", "reasoningEffort", "permissionMode", "responseLanguage", "ollamaUrl"];
/**
 * New input rejects unknown fields. `stored`: a saved file drops fields this version no longer has (their values are
 * not converted) so an older file never blocks the Assistant; every remaining value is checked as usual.
 */
export function checkedAssistantSettings(value: unknown, stored = false): AssistantSettings {
  let v = value as AssistantSettings;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Assistant settings: expected an object.");
  if (stored) v = Object.fromEntries(Object.entries(v).filter(([key]) => FIELDS.includes(key))) as AssistantSettings;
  const unknown = Object.keys(v).filter(key => !FIELDS.includes(key));
  if (unknown.length) throw new Error(`Assistant settings: unknown field(s): ${unknown.join(", ")}. Allowed: ${FIELDS.join(", ")}.`);
  if (typeof v.model !== "string" || !v.model.trim() || /[\r\n\x00]/u.test(v.model)) throw new Error("AI model: expected a non-empty string without newline or NUL.");
  if (typeof v.reasoningEffort !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v.reasoningEffort)) throw new Error("AI reasoningEffort: expected 1-64 lowercase letters, digits or hyphens, starting with a letter.");
  if (!isAiProvider(v.provider)) throw new Error(`AI provider: allowed values: ${AI_PROVIDERS.join(", ")}.`);
  if (v.permissionMode !== undefined && !["opened-folders", "read-only", "full-access"].includes(v.permissionMode)) throw new Error("AI permissionMode: allowed values: opened-folders, read-only, full-access.");
  if (v.responseLanguage !== undefined && !["ko", "en", "ja"].includes(v.responseLanguage)) throw new Error("AI responseLanguage: allowed values: ko, en, ja.");
  return { model: v.model.trim(), reasoningEffort: v.reasoningEffort, provider: v.provider, permissionMode: v.permissionMode ?? "full-access",
    ollamaUrl: v.ollamaUrl === undefined ? DEFAULT_OLLAMA_URL : checkedOllamaUrl(v.ollamaUrl),
    ...(v.responseLanguage !== undefined ? { responseLanguage: v.responseLanguage } : {}) };
}

function defaultLanguage(): "ko" | "en" | "ja" { const language = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]; return language === "ko" || language === "ja" ? language : "en"; }
