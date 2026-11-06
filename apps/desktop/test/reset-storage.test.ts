import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostPaths } from "../../editor/server/host-paths.ts";
import { readPreferences } from "../src/preferences.ts";
import { clearOfflineResetStorage, resetStorageTargets, type ResetStorageTarget } from "../../editor/server/reset-storage.ts";
import { fileURLToPath } from "node:url";
import { listTemplates, saveTemplate } from "../../editor/server/document-templates.ts";
import { ProviderConnections } from "../../editor/server/provider-connections.ts";
import { createAssistantSettings } from "../../editor/server/assistant-settings.ts";
import { firstDocument } from "../src/first-document.ts";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-storage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = (...parts: string[]) => path.join(root, ...parts);
  const write = (target: string, value = "fixture data") => { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  const host = hostPaths({ packaged: true }, {
    LITZIO_DATA_DIR: file("shared"), LITZIO_ASSISTANT_CWD: file("assistant-override"),
    LITZIO_ASSISTANT_SETTINGS_FILE: file("settings-override", "assistant.json"),
    LITZIO_PLUGINS_SETTINGS_FILE: file("settings-override", "plugins.json"),
  });
  const locations = { userData: file("profile"), host, remoteHostsFile: file("shared", "desktop", "remote-hosts.json"),
    daemonDirectories: [file("daemon-override", "stable"), file("daemon-override", "beta")], updaterCache: file("update-cache") };
  return { root, file, write, locations, targets: resetStorageTargets(locations) };
}

test("offline storage cleanup removes all inventoried data with overrides and matches a fresh preferences read", t => {
  const f = fixture(t);
  for (const target of f.targets) f.write(target.kind === "file" ? target.path : path.join(target.path, "nested", "payload"));
  f.write(f.file("profile", "preferences.json"), JSON.stringify({ channel: "stable", seenUpdate: "0.0.2-beta.7" }));
  f.write(f.file("profile", "samples-old", "edited.md"));
  f.write(f.file("assistant-override", ".agents", "skills", "custom", "SKILL.md"));
  const external = f.file("documents", "user.md"), artifact = f.file("plugin-source", "host.js");
  f.write(external); f.write(artifact);
  // A registry reference is data, never permission to delete the referenced artifact.
  f.write(f.locations.host.settingsFile("plugins"), JSON.stringify({ custom: { directory: path.dirname(artifact) } }));
  assert.equal(readPreferences(f.file("profile", "preferences.json"), "0.0.2-beta.8").channel, "stable");
  const receipt = clearOfflineResetStorage(f.targets, { removeFolders: true, protectedPaths: [f.root, external, artifact] });
  assert.equal(receipt.status, "cleared");
  assert.equal(receipt.scope, "offline-storage-only");
  assert.ok(receipt.results.length < f.targets.length, "nested owned data is deleted once through its containing directory");
  for (const target of f.targets) assert.equal(fs.existsSync(target.path), false, target.contents);
  assert.deepEqual(readPreferences(f.file("profile", "preferences.json"), "0.0.2-beta.8"), readPreferences(f.file("fresh", "preferences.json"), "0.0.2-beta.8"));
  assert.equal(fs.readFileSync(external, "utf8"), "fixture data");
  assert.equal(fs.readFileSync(artifact, "utf8"), "fixture data");
});

test("optional folder removal changes containers only, never preserves settings, secrets or user data", t => {
  const f = fixture(t);
  for (const target of f.targets) f.write(target.kind === "file" ? target.path : path.join(target.path, "payload"));
  assert.equal(clearOfflineResetStorage(f.targets, { removeFolders: false, protectedPaths: [f.root] }).status, "cleared");
  for (const target of f.targets) {
    if (target.kind === "file") assert.equal(fs.existsSync(target.path), false);
    else if (fs.existsSync(target.path)) assert.deepEqual(fs.readdirSync(target.path), []);
  }
  // Repeating cleanup is safe even after the optional containers have been removed.
  assert.equal(clearOfflineResetStorage(f.targets, { removeFolders: true, protectedPaths: [f.root] }).status, "cleared");
  assert.equal(clearOfflineResetStorage(f.targets, { removeFolders: false, protectedPaths: [f.root] }).status, "cleared");
});

test("preflight refuses unsafe paths before deleting any earlier valid target", t => {
  const f = fixture(t), safe = f.file("safe"); f.write(safe);
  const first: ResetStorageTarget = { path: safe, kind: "file", contents: "canary" };
  const unsafe = ["relative", path.parse(f.root).root, f.root, path.join(safe, "child")];
  for (const target of unsafe) {
    const result = clearOfflineResetStorage([first, { path: target, kind: "directory", contents: "unsafe" }], { removeFolders: true, protectedPaths: [f.root] });
    assert.equal(result.status, "refused"); assert.deepEqual(result.results, []);
    assert.equal(fs.readFileSync(safe, "utf8"), "fixture data");
  }
  assert.equal(clearOfflineResetStorage([first], { removeFolders: true, protectedPaths: [] }).status, "refused");
});

test("junction roots are refused; nested links are removed without following external files", t => {
  const f = fixture(t), outside = f.file("external"), owned = f.file("owned");
  f.write(path.join(outside, "user.md")); fs.mkdirSync(owned);
  const link = path.join(owned, "linked");
  fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  const target: ResetStorageTarget = { path: link, kind: "directory", contents: "link" };
  const options = { removeFolders: true, protectedPaths: [f.root, outside] };
  assert.equal(clearOfflineResetStorage([target], options).status, "refused");
  assert.equal(clearOfflineResetStorage([{ ...target, path: path.join(link, "missing") }], options).status, "refused");
  assert.equal(clearOfflineResetStorage([{ ...target, path: owned }], options).status, "cleared");
  assert.equal(fs.readFileSync(path.join(outside, "user.md"), "utf8"), "fixture data");
});

test("deletion errors and remaining data produce partial receipts while other targets are checked", t => {
  const f = fixture(t), failed = f.file("failed"), leftover = f.file("leftover"), good = f.file("good");
  for (const file of [failed, leftover, good]) f.write(file);
  const receipt = clearOfflineResetStorage([failed, leftover, good].map(file => ({ path: file, kind: "file", contents: "fixture" })),
    { removeFolders: true, protectedPaths: [f.root] }, file => {
      if (file === failed) throw Object.assign(new Error("must not publish arbitrary error text"), { code: "EACCES" });
      if (file !== leftover) fs.rmSync(file);
    });
  assert.equal(receipt.status, "partial");
  assert.deepEqual(receipt.results.map(result => result.status), ["failed", "failed", "cleared"]);
  assert.equal(receipt.results[0].error, "EACCES");
  assert.equal(JSON.stringify(receipt).includes("arbitrary error text"), false);
  assert.equal(fs.existsSync(good), false);
});

test("reset then normal startup matches clean template, skill, setting and sample loaders without a provider call", async t => {
  const f = fixture(t), application = f.file("application");
  fs.cpSync(fileURLToPath(new URL("../../editor/samples/", import.meta.url)), path.join(application, "sample"), { recursive: true });
  const baseline = firstDocument([], f.file("clean-profile"), application, undefined, "fixture");
  const used = firstDocument([], f.locations.userData, application, undefined, "fixture");
  assert.ok(baseline.samples && used.samples);
  const original = fs.readFileSync(baseline.samples.ko, "utf8");
  fs.appendFileSync(used.samples.ko, "\nUser sample edit\n");
  saveTemplate({ name: "custom", from: used.samples.ko }, undefined, f.locations.host.templates);
  const defaults = createAssistantSettings(f.locations.host.settingsFile("assistant"));
  const baselineSettings = defaults.settings(); defaults.configure({ ...baselineSettings, model: "custom-model" });
  const cleanAgent = new ProviderConnections(f.file("clean-assistant")), usedAgent = new ProviderConnections(f.locations.host.assistant);
  t.after(async () => { await Promise.all([cleanAgent.close(), usedAgent.close()]); });
  const cleanEnvironment = cleanAgent.environment(); usedAgent.environment();
  f.write(path.join(f.locations.host.assistant, ".agents", "skills", "custom", "SKILL.md"));
  f.write(path.join(f.locations.host.assistant, "conversations.json"), '[{"id":"fixture-thread"}]');
  f.write(path.join(f.locations.host.assistant, "AGENTS.md"), "user-modified instructions");
  assert.equal(clearOfflineResetStorage(resetStorageTargets(f.locations), { removeFolders: true, protectedPaths: [f.root] }).status, "cleared");
  const restarted = firstDocument([], f.locations.userData, application, undefined, "fixture");
  assert.ok(restarted.samples);
  assert.equal(fs.readFileSync(restarted.samples.ko, "utf8"), original);
  assert.deepEqual(defaults.settings(), baselineSettings);
  assert.deepEqual(listTemplates("en", f.locations.host.templates).templates, listTemplates("en", f.file("clean-templates")).templates);
  const resetEnvironment = usedAgent.environment();
  assert.deepEqual(resetEnvironment.skills, cleanEnvironment.skills);
  assert.equal(fs.readFileSync(resetEnvironment.instructions, "utf8"), fs.readFileSync(cleanEnvironment.instructions, "utf8"));
  assert.equal(fs.existsSync(path.join(f.locations.host.assistant, "conversations.json")), false);
});
