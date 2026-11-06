import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { hostPaths } from "../server/host-paths.ts";
import { brand } from "../../../brand.ts";
import { createAssistantHost } from "../server/assistant-host.ts";

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assistantDirectory } from "../server/provider-connections.ts";

test("source defaults belong to the checkout, independent of launch cwd", () => {
  const previous = { ...process.env }, cwd = process.cwd();
  process.chdir(os.tmpdir());
  try {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    assert.equal(assistantDirectory(), path.join(root, ".litzio-dev", "assistant"));
  } finally { process.env = previous; process.chdir(cwd); }
});

test("source and packaged paths retain overrides and the packaged user locations", () => {
  const root = path.join(os.tmpdir(), "checkout");
  const source = hostPaths({ packaged: false, checkoutRoot: root }, {});
  assert.deepEqual(source.assistantDefaults, { model: "gpt-6-luna", reasoningEffort: "low" });
  assert.equal(source.templates, path.join(root, ".litzio-dev", "templates"));
  assert.equal(source.settingsFile("assistant"), path.join(root, ".litzio-dev", "assistant.json"));
  assert.equal(source.assistant, path.join(root, ".litzio-dev", "assistant"));
  const packaged = hostPaths({ packaged: true }, {});
  assert.deepEqual(packaged.assistantDefaults, { model: "gpt-6.1-sol", reasoningEffort: "medium" });
  assert.equal(packaged.templates, path.join(os.homedir(), brand.folders.shared, "templates"));
  assert.equal(packaged.settingsFile("assistant"), path.join(os.homedir(), brand.folders.shared, "assistant.json"));
  const data = process.platform === "win32" ? path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".local", "share");
  assert.equal(packaged.assistant, path.join(data, brand.folders.desktopData, "assistant"));
  for (const run of [{ packaged: true }, { packaged: false, checkoutRoot: root }]) {
    const paths = hostPaths(run, { LITZIO_ASSISTANT_SETTINGS_FILE: "settings-override", LITZIO_ASSISTANT_CWD: "cwd-override" });
    assert.equal(paths.settingsFile("plugins"), path.join(run.packaged ? path.join(os.homedir(), brand.folders.shared) : path.join(root, ".litzio-dev"), "plugins.json"));
    assert.equal(paths.settingsFile("assistant"), "settings-override"); assert.equal(paths.assistant, "cwd-override");
  }
});

test("Host pins official settings and lazy agent cwd after environment restoration", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "official-ai-paths-"));
  const previous = { ...process.env };
  process.env.LITZIO_DATA_DIR = root;
  process.env.LITZIO_PLUGINS_SETTINGS_FILE = path.join(root, "plugins.json");
  process.env.LITZIO_ASSISTANT_SETTINGS_FILE = path.join(root, "settings.json");
  process.env.LITZIO_ASSISTANT_CWD = path.join(root, "assistant");
  const host = createAssistantHost(); process.env = previous;
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = await host.invoke("settings");
  assert.deepEqual({ model: settings.model, reasoningEffort: settings.reasoningEffort }, { model: "gpt-6-luna", reasoningEffort: "low" });
  assert.equal((await host.invoke("assistantEnvironment")).cwd, path.join(root, "assistant"));
  await host.invoke("configure", { ...settings, permissionMode: "read-only" });
  assert.equal(JSON.parse(readFileSync(path.join(root, "settings.json"), "utf8")).permissionMode, "read-only");
});
