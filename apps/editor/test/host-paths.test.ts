import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { hostPaths } from "../server/host-paths.ts";
import { brand } from "../../../brand.ts";
import { createPluginHost } from "../server/plugin-host.ts";
import { PluginStore } from "../server/plugin-store.ts";

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { pluginsDirectory } from "../server/plugin-host.ts";
import { agentDirectory } from "../server/ai-agent-connection.ts";

test("source defaults belong to the checkout, independent of launch cwd", () => {
  const previous = { ...process.env }, cwd = process.cwd();
  process.chdir(os.tmpdir());
  delete process.env.LITZIO_PLUGINS_DIR; delete process.env.LITZIO_AI_AGENT_CWD;
  try {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    assert.equal(pluginsDirectory(), path.join(root, ".litzio-dev", "plugins"));
    assert.equal(agentDirectory(), path.join(root, ".litzio-dev", "assistant"));
  } finally { process.env = previous; process.chdir(cwd); }
});

test("source and packaged paths retain overrides and the packaged user locations", () => {
  const root = path.join(os.tmpdir(), "checkout");
  const source = hostPaths({ packaged: false, checkoutRoot: root }, {});
  assert.deepEqual(source.aiDefaults, { model: "gpt-6-luna", reasoningEffort: "low" });
  assert.equal(source.templates, path.join(root, ".litzio-dev", "templates"));
  assert.equal(source.plugins, path.join(root, ".litzio-dev", brand.folders.plugins));
  assert.equal(source.settingsFile("ai-agent"), path.join(root, ".litzio-dev", "ai-agent.json"));
  assert.equal(source.agent, path.join(root, ".litzio-dev", "assistant"));
  const packaged = hostPaths({ packaged: true }, {});
  assert.deepEqual(packaged.aiDefaults, { model: "gpt-6.1-sol", reasoningEffort: "medium" });
  assert.equal(packaged.templates, path.join(os.homedir(), brand.folders.shared, "templates"));
  assert.equal(packaged.plugins, path.join(os.homedir(), brand.folders.shared, brand.folders.plugins));
  assert.equal(packaged.settingsFile("docling"), path.join(os.homedir(), brand.folders.shared, "docling.json"));
  const data = process.platform === "win32" ? path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".local", "share");
  assert.equal(packaged.agent, path.join(data, brand.folders.desktopData, "assistant"));
  for (const run of [{ packaged: true }, { packaged: false, checkoutRoot: root }]) {
    const paths = hostPaths(run, { LITZIO_PLUGINS_DIR: "plugins-override", LITZIO_DOCLING_SETTINGS_FILE: "settings-override", LITZIO_AI_AGENT_CWD: "cwd-override" });
    assert.equal(paths.plugins, "plugins-override"); assert.equal(paths.settingsFile("docling"), "settings-override"); assert.equal(paths.agent, "cwd-override");
  }
});

test("Host pins injected registration, settings and lazy agent cwd after environment restoration", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-host-paths-"));
  const previous = { ...process.env };
  const directory = path.join(root, "plugins"), settings = path.join(root, "docling.json"), cwd = path.join(root, "assistant");
  process.env.LITZIO_PLUGINS_DIR = directory; process.env.LITZIO_DOCLING_SETTINGS_FILE = settings; process.env.LITZIO_AI_AGENT_CWD = cwd;
  const host = createPluginHost();
  process.env = previous;
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  host.plugins(true);
  host.invoke("docling", "configure", { server: "http://127.0.0.1:12345" });
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).server, "http://127.0.0.1:12345");
  assert.equal(host.invoke("ai-agent", "agentEnvironment").cwd, cwd);
  assert.ok(existsSync(path.join(cwd, "AGENTS.md")));
  const observer = new PluginStore(directory);
  try { assert.ok(observer.list().some(item => item.id === "docling")); assert.ok(observer.list().some(item => item.id === "ai-agent")); }
  finally { observer.close(); }
});

test("source Host registers and writes defaults only under its injected checkout", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-source-paths-"));
  const previous = { ...process.env };
  for (const key of ["LITZIO_PLUGINS_DIR", "LITZIO_DOCLING_SETTINGS_FILE", "LITZIO_AI_AGENT_SETTINGS_FILE", "LITZIO_AI_AGENT_CWD"]) delete process.env[key];
  const host = createPluginHost(undefined, undefined, { run: { packaged: false, checkoutRoot: root } });
  process.env = previous;
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  host.plugins(true);
  host.invoke("docling", "configure", { server: "http://127.0.0.1:12346" });
  const state = path.join(root, ".litzio-dev");
  const { responseLanguage, ...executionSettings } = host.invoke("ai-agent", "settings");
  assert.ok(["ko", "en", "ja"].includes(responseLanguage));
  assert.deepEqual(executionSettings, { provider: "codex", providers: { codex: true, copilot: false }, writeAccess: "opened-folders", model: "gpt-6-luna", reasoningEffort: "low" });
  assert.equal(existsSync(path.join(state, "ai-agent.json")), false);
  const saved = { provider: "codex", providers: { codex: true, copilot: false }, writeAccess: "read-only", model: "saved-model", reasoningEffort: "high" };
  const serialized = JSON.stringify(saved);
  writeFileSync(path.join(state, "ai-agent.json"), serialized);
  assert.deepEqual(host.invoke("ai-agent", "settings"), saved);
  assert.equal(readFileSync(path.join(state, "ai-agent.json"), "utf8"), serialized);
  assert.equal(JSON.parse(readFileSync(path.join(state, "docling.json"), "utf8")).server, "http://127.0.0.1:12346");
  assert.equal(host.invoke("ai-agent", "agentEnvironment").cwd, path.join(state, "assistant"));
  const observer = new PluginStore(path.join(state, "plugins"));
  try { assert.ok(observer.list().some(item => item.id === "docling")); }
  finally { observer.close(); }
});
