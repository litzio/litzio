import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, createLogger } from "vite";

test("Vite development HTTP Host activates an external artifact with the Host SDK without import warnings", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-vite-plugins-"));
  const keys = ["LITZIO_DATA_DIR", "LITZIO_PLUGINS_SETTINGS_FILE", "LITZIO_ASSISTANT_SETTINGS_FILE", "LITZIO_ASSISTANT_CWD"];
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) process.env[key] = key.endsWith("FILE") ? path.join(root, `${key}.json`) : root;
  const warnings: string[] = [];
  const logger = createLogger("error");
  logger.warn = message => { warnings.push(message); };
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    const directory = path.join(root, "artifact"); mkdirSync(directory);
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
    writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.vite", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Vite fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [] } }));
    writeFileSync(path.join(directory, "host.js"), `import { SDK_VERSION } from '@litzio/plugin-sdk';
export function activate(){return {operations:{},status:()=>({available:true,message:SDK_VERSION,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    const editor = path.resolve(import.meta.dirname, "..");
    server = await createServer({ root: editor, configFile: path.join(editor, "vite.config.ts"), customLogger: logger, server: { port: 0, open: false } });
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/api/plugins`;
    const manage = async (body: object) => {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    };
    const registered = await manage({ action: "register", directory });
    await manage({ action: "trust", id: "fixture.vite", digest: registered.plugins[0].digest });
    const enabled = await manage({ action: "enable", id: "fixture.vite" });
    assert.equal(enabled.plugins[0].running, true);
    assert.equal(enabled.plugins[0].status.message, "0.1.0");
    await manage({ action: "disable", id: "fixture.vite" });
    assert.deepEqual(warnings.filter(message => message.includes("dynamic import cannot be analyzed")), []);
  } finally {
    await server?.close();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    rmSync(root, { recursive: true, force: true });
  }
});
