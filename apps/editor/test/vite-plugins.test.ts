import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, createLogger } from "vite";
import { ResetGuard } from "../server/reset-guard.ts";
import { once } from "node:events";

test("Vite development HTTP Host activates an external artifact with the Host SDK without import warnings", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-vite-plugins-"));
  const keys = ["LITZIO_DATA_DIR", "LITZIO_PLUGINS_SETTINGS_FILE", "LITZIO_ASSISTANT_SETTINGS_FILE", "LITZIO_ASSISTANT_CWD", "LITZIO_RESET_DIR"];
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
    // Programmatic Vite startup bypasses the dev script's official artifact build.
    execFileSync(process.execPath, [fileURLToPath(new URL("../../../plugins/onedrive/build.mjs", import.meta.url))], { stdio: "inherit", windowsHide: true });
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
    const initial = await (await fetch(endpoint)).json();
    const official = initial.plugins.find((p: any) => p.id === "litzio.onedrive");
    assert.equal(official.official, true); assert.equal(official.trusted, true);
    assert.equal(official.enabled, false); assert.equal(official.error, undefined);
    const officialEnabled = await manage({ action: "enable", id: official.id });
    assert.equal(officialEnabled.plugins.find((p: any) => p.id === official.id).running, true);
    await manage({ action: "disable", id: official.id });
    const registered = await manage({ action: "register", directory });
    await manage({ action: "trust", id: "fixture.vite", registrationId: registered.plugins.find((p: any) => p.id === "fixture.vite").registrationId });
    const enabled = await manage({ action: "enable", id: "fixture.vite" });
    assert.equal(enabled.plugins.find((p: any) => p.id === "fixture.vite").running, true);
    assert.equal(enabled.plugins.find((p: any) => p.id === "fixture.vite").status.message, "0.3.0");
    await manage({ action: "disable", id: "fixture.vite" });
    assert.deepEqual(warnings.filter(message => message.includes("dynamic import cannot be analyzed")), []);
  } finally {
    await server?.close();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    rmSync(root, { recursive: true, force: true });
  }
});

test("Vite retains its reset writer lease until an accepted mutation settles after disconnect and listener close", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-vite-reset-"));
  const previous = process.env.LITZIO_RESET_DIR;
  process.env.LITZIO_RESET_DIR = path.join(root, "guard");
  let begin!: () => void, permit!: () => void, complete!: () => void, servicesClosed!: () => void;
  const began = new Promise<void>(resolve => { begin = resolve; });
  const allowed = new Promise<void>(resolve => { permit = resolve; });
  const completed = new Promise<void>(resolve => { complete = resolve; });
  const hostClosed = new Promise<void>(resolve => { servicesClosed = resolve; });
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  let settled = false;
  const guard = new ResetGuard();
  try {
    const editor = path.resolve(import.meta.dirname, "..");
    server = await createServer({ root: editor, configFile: path.join(editor, "vite.config.ts"), logLevel: "error", server: { port: 0, open: false } });
    // Keep the real config, middleware, listener and ResetGuard. Only the handler
    // and service modules are fixtures, so completion has an explicit boundary.
    const load = server.ssrLoadModule.bind(server);
    server.ssrLoadModule = async (url, ...args) => {
      if (url === "/server/host-services.ts") return { createHostServices: () => ({ close: async () => { servicesClosed(); } }) };
      if (url === "/server/document-api.ts") return { handleDocumentRequest: async () => {
        begin(); await allowed;
        try { writeFileSync(path.join(root, "accepted-write"), "isolated fixture"); settled = true; }
        finally { complete(); }
      } };
      return load(url, ...args);
    };
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    const controller = new AbortController();
    const response = fetch(`http://127.0.0.1:${address.port}/api/file`, { method: "DELETE", signal: controller.signal })
      .catch(error => { if (error.name !== "AbortError") throw error; });
    await began; controller.abort(); await response;
    const listenerClosed = once(server.httpServer!, "close");
    let closeResolved = false;
    const closing = server.close().then(() => { closeResolved = true; });
    await listenerClosed; await hostClosed;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.throws(() => guard.exclusive(), /Close host/, "listener/service close cannot authorize reset while its accepted write remains pending");
    assert.equal(closeResolved, false, "Vite close must wait for its accepted write, too");
    permit(); await completed;
    await closing;
    const release = guard.exclusive(); release();
  } finally {
    permit();
    await server?.close();
    await new Promise(resolve => setImmediate(resolve));
    if (previous === undefined) delete process.env.LITZIO_RESET_DIR; else process.env.LITZIO_RESET_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
