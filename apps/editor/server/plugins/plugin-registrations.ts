import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { installationIdPattern } from "./installed-artifacts.ts";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const directory = z.string().refine(value => path.isAbsolute(value) && !value.includes("\0"));
const fields = {
  registrationId: z.uuid(),
  digest,
  trusted: z.boolean().optional(),
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  operationNames: z.array(z.string()),
};
const installed = z.strictObject({
  ...fields,
  installationId: z.string().regex(installationIdPattern),
  sourceDirectory: directory,
  sourceDigest: digest,
});
const legacy = z.strictObject({ ...fields, directory });
const registry = z.record(z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/), z.union([installed, legacy]));
export type InstalledPlugin = z.infer<typeof installed>;
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
