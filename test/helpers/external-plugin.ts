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
    await manage({ action: "trust", id, digest: plugins.find((p: any) => p.id === id).digest });
    await manage({ action: "enable", id });
    const invoked = await manage({ action: "invoke", operation: `${id}.greet`, input: { name: "External" } });
    assert.deepEqual(invoked.result, { greeting: "Hello, External!" });
    assert.equal(invoked.receipt.outcome, "success");
    // The SDK itself can import its split chunks, but artifact code cannot reuse
    // their file URLs to reach private Host modules, even after SDK activation.
    const chunk = readdirSync(hostBundleDirectory).find(name => /^chunk-.*\.mjs$/.test(name));
    assert.ok(chunk, "The distribution contains private split chunks");
    const entry = path.join(directory, "host.js");
    writeFileSync(entry, `import ${JSON.stringify(pathToFileURL(path.join(hostBundleDirectory, chunk)).href)};\n` + readFileSync(entry, "utf8"));
    const current = (await (await fetch(url + "/api/plugins")).json()).plugins.find((p: any) => p.id === id);
    await manage({ action: "trust", id, digest: current.digest });
    const refused = await fetch(url + "/api/plugins", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reload", id }) });
    assert.equal(refused.status, 400, await refused.text());
    assert.equal((await (await fetch(url + "/api/plugins")).json()).plugins.find((p: any) => p.id === id).running, false);
  } finally { await manage({ action: "unregister", id }); }
}
