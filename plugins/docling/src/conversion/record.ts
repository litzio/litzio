import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** Bump manually when Representation policy changes. */
export const CONVERSION_POLICY_VERSION = 1;
type Versions = { converter: { pluginVersion: string; buildRevision?: string }; coreVersion: string };
declare const __LITZIO_CONVERSION_VERSIONS__: Versions;

export function sourceConverterVersions(): Versions {
  const manifest = (url: URL) => JSON.parse(readFileSync(url, "utf8")) as { version: string };
  let buildRevision: string | undefined;
  try { buildRevision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
  }).trim(); } catch { /* Exported source trees may have no Git revision. */ }
  return {
    converter: { pluginVersion: manifest(new URL("../../package.json", import.meta.url)).version, ...(buildRevision ? { buildRevision } : {}) },
    coreVersion: manifest(new URL("../package.json", import.meta.resolve("@litzio/core"))).version,
  };
}
export function conversionVersions() {
  const versions = typeof __LITZIO_CONVERSION_VERSIONS__ === "undefined" ? sourceConverterVersions() : __LITZIO_CONVERSION_VERSIONS__;
  return { ...versions, policyVersion: CONVERSION_POLICY_VERSION };
}
