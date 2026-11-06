import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { localResetLocations, inspectAppReset } from "../../editor/server/app-reset.ts";
import { processStart } from "../../editor/server/daemon-state.ts";

test("post-exit helper waits for its exact parent, resets only fixture data and relaunches with an observable receipt", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-helper-"));
  const file = (...parts: string[]) => path.join(root, ...parts);
  const previous = { ...process.env };
  const env = { ...process.env, LITZIO_DATA_DIR: file("host"), LITZIO_DAEMON_DIR: file("daemons"), LITZIO_RESET_DIR: file("guard"),
    LITZIO_ASSISTANT_CWD: file("assistant"), LITZIO_ASSISTANT_SETTINGS_FILE: file("host", "assistant.json"), LITZIO_PLUGINS_SETTINGS_FILE: file("host", "plugins.json") };
  process.env = env;
  const locations = localResetLocations(file("profile"), file("cache"), { packaged: true });
  const revision = inspectAppReset(locations).revision;
  process.env = previous;
  fs.mkdirSync(locations.userData); fs.writeFileSync(file("profile", "canary"), "private fixture data");
  fs.writeFileSync(file("external.md"), "external data");
  const parent = spawn(process.execPath, ["-e", "process.on('message',()=>process.exit(0));setInterval(()=>{},1000)"], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const helper = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/reset-helper.ts", import.meta.url))], { windowsHide: true, env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let diagnostics = ""; helper.stderr!.on("data", chunk => { diagnostics += chunk; });
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit"); child.kill(); await exited;
  };
  t.after(async () => { await stop(helper); await stop(parent); fs.rmSync(root, { recursive: true, force: true }); });
  const relaunch = file("relaunch.cjs"), marker = file("relaunched.json");
  fs.writeFileSync(relaunch, "require('node:fs').writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))");
  const waiting = once(helper, "message"), exited = once(helper, "exit");
  helper.send({ parentPid: parent.pid, parentStarted: processStart(parent.pid!), profile: locations.userData, updaterCache: locations.updaterCache,
    revision, removeFolders: true, receipt: file("result.json"), executable: process.execPath, args: [relaunch, marker] });
  assert.deepEqual((await waiting)[0], { waiting: true });
  assert.equal(fs.readFileSync(file("profile", "canary"), "utf8"), "private fixture data", "no deletion while the parent is alive");
  const parentExited = once(parent, "exit"); parent.send({ exit: true }); await parentExited;
  assert.equal((await exited)[0], 0, diagnostics);
  assert.equal(JSON.parse(fs.readFileSync(file("result.json"), "utf8")).outcome, "success");
  assert.equal(fs.existsSync(locations.userData), false);
  assert.equal(fs.readFileSync(file("external.md"), "utf8"), "external data");
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), [`--app-reset-result=${file("result.json")}`]);
});

test("persisted cancellation prevents deletion after parent exit even when its IPC message was lost", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-cancel-")), file = (...parts: string[]) => path.join(root, ...parts);
  const env = { ...process.env, LITZIO_DATA_DIR: file("host"), LITZIO_DAEMON_DIR: file("daemons"), LITZIO_RESET_DIR: file("guard"),
    LITZIO_ASSISTANT_CWD: file("assistant"), LITZIO_ASSISTANT_SETTINGS_FILE: file("host", "assistant.json"), LITZIO_PLUGINS_SETTINGS_FILE: file("host", "plugins.json") };
  const previous = process.env; process.env = env;
  const locations = localResetLocations(file("profile"), file("cache"), { packaged: true }), revision = inspectAppReset(locations).revision;
  process.env = previous;
  fs.mkdirSync(locations.userData); fs.writeFileSync(file("profile", "canary"), "keep revoked work");
  fs.writeFileSync(file("result.json.cancel"), "");
  const helper = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/reset-helper.ts", import.meta.url))], { windowsHide: true, env, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  t.after(async () => {
    if (helper.exitCode === null && helper.signalCode === null) { const exited = once(helper, "exit"); helper.kill(); await exited; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const exited = once(helper, "exit");
  helper.send({ parentPid: 2147483647, parentStarted: "exited-generation", profile: locations.userData, updaterCache: locations.updaterCache,
    revision, removeFolders: true, receipt: file("result.json"), executable: process.execPath, args: ["-e", ""] });
  assert.equal((await exited)[0], 0);
  assert.equal(fs.readFileSync(file("profile", "canary"), "utf8"), "keep revoked work");
  assert.equal(fs.existsSync(file("result.json")), false);
});
