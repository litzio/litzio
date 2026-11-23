import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProviderUpdates } from "../../server/provider-updates.ts";
import type { ProviderConnections } from "../../server/provider-connections.ts";

const dispatcher = fileURLToPath(new URL("../fixtures/provider-cli.mjs", import.meta.url));
export type FakeCliState = { version: string; help?: boolean; update?: "ok" | "fail" | "hang"; next?: string; updates?: number };

/** An installed-CLI launcher (a .cmd on Windows) whose behavior the returned state file controls. */
export function fakeProviderCli(root: string, state: FakeCliState) {
  const file = path.join(root, "cli-state.json"), bin = path.join(root, process.platform === "win32" ? "provider.cmd" : "provider");
  writeFileSync(file, JSON.stringify(state));
  writeFileSync(bin, process.platform === "win32" ? `@"${process.execPath}" "${dispatcher}" "${file}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${dispatcher}" "${file}" "$@"\n`);
  if (process.platform !== "win32") chmodSync(bin, 0o755);
  return { bin, read: () => JSON.parse(readFileSync(file, "utf8")) as FakeCliState, write: (next: Partial<FakeCliState>) => writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...next })) };
}

/** Replace the public release source; tests never reach GitHub. */
export function useReleaseSource(connection: ProviderConnections, options: ConstructorParameters<typeof ProviderUpdates>[1]) {
  Object.assign(connection, { updates: new ProviderUpdates(provider => provider === "copilot" ? connection.copilot.executable : connection.client.executable, options) });
}

export async function settled(connection: ProviderConnections, provider: "codex" | "copilot") {
  while (connection.updates.state(provider).status === "running") await new Promise(resolve => setTimeout(resolve, 50));
  return connection.updates.state(provider);
}
