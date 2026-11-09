import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Exercise the shipped scaffold and SDK through a running Host, without a checkout dependency. */
export async function verifyExternalPlugin(url: string, parent: string, hostBundleDirectory: string) {
  const id = "fixture.external-sdk", directory = path.join(parent, "external plugin SDK");
  const manage = async (input: Record<string, unknown>) => {
    const response = await fetch(url + "/api/plugins", { method: "POST",
      headers: { Origin: url, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  await manage({ action: "scaffold", directory, id });
  assert.equal((await manage({ action: "validate", directory })).valid, true);
  await manage({ action: "register", directory });
  try {
    const plugins = (await (await fetch(url + "/api/plugins")).json()).plugins;
    await manage({ action: "trust", id, registrationId: plugins.find((p: any) => p.id === id).registrationId, digest: plugins.find((p: any) => p.id === id).digest });
    await manage({ action: "enable", id });
    const invoked = await manage({ action: "invoke", operation: `${id}.greet`, input: { name: "External" } });
    assert.deepEqual(invoked.result, { greeting: "Hello, External!" });
    assert.equal(invoked.receipt.outcome, "success");
    // A caller-selected SDK parent must grant no access to private Host files.
    // CLI-only chunks may exist; the SDK itself is built without shared chunks.
    const privateFile = path.join(hostBundleDirectory,
      readdirSync(hostBundleDirectory).find(name => /^chunk-.*\.mjs$/.test(name)) ?? "cli.mjs");
    const entry = path.join(directory, "host.js");
    const source = readFileSync(entry, "utf8");
    for (const prefix of [
      `import ${JSON.stringify(pathToFileURL(privateFile).href)};`,
      ...["sdkRequire.resolve", "sdkRequire"].map(call =>
        `import {createRequire} from 'node:module'; const sdkRequire = createRequire(import.meta.resolve('@litzio/plugin-sdk')); ${call}(${JSON.stringify(privateFile)});`),
    ]) {
      writeFileSync(entry, prefix + "\n" + source);
      const current = (await (await fetch(url + "/api/plugins")).json()).plugins.find((p: any) => p.id === id);
      await manage({ action: "trust", id, registrationId: current.registrationId, digest: current.digest });
      const refused = await fetch(url + "/api/plugins", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reload", id }) });
      assert.equal(refused.status, 400, await refused.text());
      assert.equal((await (await fetch(url + "/api/plugins")).json()).plugins.find((p: any) => p.id === id).running, false);
    }
  } finally { await manage({ action: "unregister", id }); }
}
