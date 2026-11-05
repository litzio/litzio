import assert from "node:assert/strict";
import path from "node:path";

/** Exercise the shipped scaffold and SDK through a running Host, without a checkout dependency. */
export async function verifyExternalPlugin(url: string, parent: string) {
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
  } finally { await manage({ action: "unregister", id }); }
}
