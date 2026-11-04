import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { hostPaths } from "../server/host-paths.ts";
import { brand } from "../../../brand.ts";
import { createAiHost } from "../server/ai-host.ts";

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { agentDirectory } from "../server/ai-agent-connection.ts";

test("source defaults belong to the checkout, independent of launch cwd", () => {
  const previous = { ...process.env }, cwd = process.cwd();
  process.chdir(os.tmpdir());
  try {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    assert.equal(agentDirectory(), path.join(root, ".litzio-dev", "assistant"));
  } finally { process.env = previous; process.chdir(cwd); }
});

test("source and packaged paths retain overrides and the packaged user locations", () => {
  const root = path.join(os.tmpdir(), "checkout");
  const source = hostPaths({ packaged: false, checkoutRoot: root }, {});
  assert.deepEqual(source.aiDefaults, { model: "gpt-6-luna", reasoningEffort: "low" });
  assert.equal(source.templates, path.join(root, ".litzio-dev", "templates"));
  assert.equal(source.settingsFile("ai-agent"), path.join(root, ".litzio-dev", "ai-agent.json"));
  assert.equal(source.agent, path.join(root, ".litzio-dev", "assistant"));
  const packaged = hostPaths({ packaged: true }, {});
  assert.deepEqual(packaged.aiDefaults, { model: "gpt-6.1-sol", reasoningEffort: "medium" });
  assert.equal(packaged.templates, path.join(os.homedir(), brand.folders.shared, "templates"));
  assert.equal(packaged.settingsFile("ai-agent"), path.join(os.homedir(), brand.folders.shared, "ai-agent.json"));
  const data = process.platform === "win32" ? path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".local", "share");
  assert.equal(packaged.agent, path.join(data, brand.folders.desktopData, "assistant"));
  for (const run of [{ packaged: true }, { packaged: false, checkoutRoot: root }]) {
    const paths = hostPaths(run, { LITZIO_AI_AGENT_SETTINGS_FILE: "settings-override", LITZIO_AI_AGENT_CWD: "cwd-override" });
    assert.equal(paths.settingsFile("ai-agent"), "settings-override"); assert.equal(paths.agent, "cwd-override");
  }
});

test("Host pins official settings and lazy agent cwd after environment restoration", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "official-ai-paths-"));
  const previous = { ...process.env };
  process.env.LITZIO_AI_AGENT_SETTINGS_FILE = path.join(root, "settings.json");
  process.env.LITZIO_AI_AGENT_CWD = path.join(root, "assistant");
  const host = createAiHost(); process.env = previous;
  t.after(async () => { await host.close(); rmSync(root, { recursive: true, force: true }); });
  const settings = await host.invoke("settings");
  assert.deepEqual({ model: settings.model, reasoningEffort: settings.reasoningEffort }, { model: "gpt-6-luna", reasoningEffort: "low" });
  assert.equal((await host.invoke("agentEnvironment")).cwd, path.join(root, "assistant"));
  await host.invoke("configure", { ...settings, writeAccess: "read-only" });
  assert.equal(JSON.parse(readFileSync(path.join(root, "settings.json"), "utf8")).writeAccess, "read-only");
});
