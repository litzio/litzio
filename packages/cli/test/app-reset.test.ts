import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appResetCli } from "../src/app-reset.ts";
import { executeAppReset, inspectAppReset, localResetLocations } from "../../../apps/editor/server/app-reset.ts";
import { ResetGuard } from "../../../apps/editor/server/reset-guard.ts";
import { createAssistantSettings } from "../../../apps/editor/server/assistant-settings.ts";

test("CLI and shared reset operation require reviewed confirmation and restore first-run settings in an isolated environment", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-app-reset-cli-"));
  const previous = { ...process.env };
  Object.assign(process.env, { LITZIO_DATA_DIR: path.join(root, "host"), LITZIO_RESET_DIR: path.join(root, "guard"),
    LITZIO_DAEMON_DIR: path.join(root, "daemons"), LITZIO_ASSISTANT_CWD: path.join(root, "assistant"),
    LITZIO_ASSISTANT_SETTINGS_FILE: path.join(root, "host", "assistant.json"), LITZIO_PLUGINS_SETTINGS_FILE: path.join(root, "host", "plugins.json") });
  t.after(() => { process.env = previous; fs.rmSync(root, { recursive: true, force: true }); });
  const flags = ["--profile", path.join(root, "profile"), "--updater-cache", path.join(root, "cache")];
  const locations = localResetLocations(flags[1], flags[3]);
  const absoluteData = process.env.LITZIO_DATA_DIR!;
  process.env.LITZIO_DATA_DIR = path.relative(process.cwd(), absoluteData);
  assert.equal(localResetLocations(flags[1], flags[3]).host.templates, locations.host.templates, "relative Host overrides resolve in the owning process cwd");
  process.env.LITZIO_DATA_DIR = absoluteData;
  fs.mkdirSync(locations.host.templates, { recursive: true });
  fs.writeFileSync(path.join(locations.host.templates, "user.md"), "user template");
  const settings = createAssistantSettings(locations.host.settingsFile("assistant"));
  const baseline = settings.settings(); settings.configure({ ...baseline, model: "custom-model" });
  const plan = inspectAppReset(locations);
  assert.equal(await appResetCli(["inspect", ...flags]), 0);
  assert.equal(await appResetCli(["apply", ...flags, "--revision", plan.revision]), 1);
  assert.equal(await appResetCli(["apply", ...flags, "--confirm", "--revision", "wrong"]), 1);
  assert.equal(settings.settings().model, "custom-model");
  const release = new ResetGuard().actor("desktop");
  assert.equal(await appResetCli(["apply", ...flags, "--confirm", "--revision", plan.revision]), 1);
  release();
  const external = path.join(root, "external.md"); fs.writeFileSync(external, "keep");
  assert.equal(await appResetCli(["apply", ...flags, "--confirm", "--revision", plan.revision, "--remove-folders"]), 0);
  assert.deepEqual(settings.settings(), baseline);
  assert.equal(fs.existsSync(locations.host.templates), false);
  assert.equal(fs.readFileSync(external, "utf8"), "keep");
  assert.equal(await appResetCli(["inspect", ...flags, "--profile", root]), 1, "duplicate targets are not silently accepted");
});

test("legacy live and malformed daemon records refuse reset before deleting app data", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-records-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = (...parts: string[]) => path.join(root, ...parts);
  const locations = { userData: file("profile"), updaterCache: file("cache"), remoteHostsFile: file("registry", "remote-hosts.json"), daemonDirectories: [file("daemons", "stable")],
    host: { assistantDefaults: { model: "model", reasoningEffort: "low" }, templates: file("host", "templates"), plugins: file("host", "plugins"), assistant: file("assistant"), settingsFile: (id: string) => file("host", `${id}.json`) } };
  fs.mkdirSync(locations.userData); fs.writeFileSync(file("profile", "canary"), "keep until confirmed");
  fs.mkdirSync(locations.daemonDirectories[0], { recursive: true });
  const lock = file("daemons", "stable", "daemon.lock");
  fs.writeFileSync(lock, JSON.stringify({ pid: 42, processStartedAt: "live" }));
  const input = { confirmed: true, revision: inspectAppReset(locations).revision, removeFolders: true };
  const identify = (pid: number) => pid === 42 ? "live" : "self";
  const guard = new ResetGuard(file("guard"), identify);
  assert.equal(executeAppReset(locations, input, guard, identify).outcome, "refused");
  fs.writeFileSync(lock, "malformed secret-like text must not leak");
  const malformed = executeAppReset(locations, input, guard, identify);
  assert.equal(malformed.outcome, "refused");
  assert.equal(JSON.stringify(malformed).includes("secret-like"), false);
  assert.equal(fs.readFileSync(file("profile", "canary"), "utf8"), "keep until confirmed");
});

test("gate cleanup errors cannot erase the actual deletion receipt", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-receipt-")), file = (...parts: string[]) => path.join(root, ...parts);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const locations = { userData: file("profile"), updaterCache: file("cache"), remoteHostsFile: file("registry", "remote-hosts.json"), daemonDirectories: [file("daemons", "stable")],
    host: { assistantDefaults: { model: "model", reasoningEffort: "low" }, templates: file("host", "templates"), plugins: file("host", "plugins"), assistant: file("assistant"), settingsFile: (id: string) => file("host", `${id}.json`) } };
  class CleanupFailure extends ResetGuard {
    exclusive() { const release = super.exclusive(); return () => { release(); throw new Error("fixture cleanup failure"); }; }
  }
  fs.mkdirSync(locations.userData); fs.writeFileSync(file("profile", "canary"), "fixture user data");
  const result = executeAppReset(locations, { confirmed: true, revision: inspectAppReset(locations).revision, removeFolders: true }, new CleanupFailure(file("guard"), () => "self"));
  assert.equal(result.outcome, "uncertain");
  assert.equal(result.receipt?.status, "cleared");
  assert.equal(fs.existsSync(locations.userData), false);
});
