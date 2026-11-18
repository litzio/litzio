import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GITHUB_TRACKS, parseGitHubSource } from "@litzio/plugin-sdk";
import { installationIdPattern } from "./installed-artifacts.ts";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const gitSha = z.string().regex(/^[0-9a-f]{40}$/);
const directory = z.string().refine(value => path.isAbsolute(value) && !value.includes("\0"));
const fields = {
  registrationId: z.uuid(),
  digest,
  trusted: z.boolean().optional(),
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  operationNames: z.array(z.string()),
};
/**
 * Where update checks and updates read. `commit` and `tree` describe the applied GitHub
 * content and are absent while the installed copy came from a local folder instead.
 */
const github = z.strictObject({
  url: z.string().refine(value => !!parseGitHubSource(value)),
  path: z.string().optional(),
  track: z.enum(GITHUB_TRACKS).optional(),
  commit: gitSha.optional(),
  tree: gitSha.optional(),
});
const installed = z.strictObject({
  ...fields,
  installationId: z.string().regex(installationIdPattern),
  sourceDirectory: directory.optional(),
  github: github.optional(),
  sourceDigest: digest,
}).refine(record => !!record.sourceDirectory || !!record.github?.commit, "A registration needs a local folder or an applied GitHub commit");
const legacy = z.strictObject({ ...fields, directory });
const registry = z.record(z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/), z.union([installed, legacy]));
export type InstalledPlugin = z.infer<typeof installed>;
export type GitHubRegistration = z.infer<typeof github>;
export type PluginRegistration = InstalledPlugin | z.infer<typeof legacy>;

/** A missing file provides no evidence about which copies are safe to delete. */
export function readPluginRegistrations(file: string): Record<string, PluginRegistration> | undefined {
  try {
    return registry.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("Unable to read plugin registrations. Restore the registration file before starting the Host.");
  }
}
