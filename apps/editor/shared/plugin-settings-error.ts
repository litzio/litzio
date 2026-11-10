export type SettingsIssue = { keyword: string; path: string };
export class PluginSettingsError extends Error {
  constructor(message: string, readonly settingsIssues: SettingsIssue[]) { super(message); }
}
