// App preferences in the user data folder: updates and the close-to-tray explanation.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import type { ReleaseChannel } from "../../editor/shared/desktop-bridge.ts";

export type Preferences = {
  channel: ReleaseChannel;
  /** Last viewed offered version; a newer version shows the Settings dot again. */
  seenUpdate: string | null;
  /** The first close-to-tray explanation has been displayed in this app profile. */
  backgroundNoticeShown: boolean;
};

/** Use the installed version's channel unless a valid user choice has been saved. */
export function readPreferences(file: string, installedVersion: string): Preferences {
  const defaults: Preferences = {
    channel: semver.prerelease(installedVersion)?.[0] === "beta" ? "beta" : "stable",
    seenUpdate: null,
    backgroundNoticeShown: false,
  };
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return defaults;
  }
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    channel: record.channel === "stable" || record.channel === "beta" ? record.channel : defaults.channel,
    seenUpdate: typeof record.seenUpdate === "string" && semver.valid(record.seenUpdate) ? record.seenUpdate : null,
    backgroundNoticeShown: record.backgroundNoticeShown === true,
  };
}

/** Written beside the file and renamed over it, so an interrupted write leaves the previous preferences. */
export function writePreferences(file: string, preferences: Preferences): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}
