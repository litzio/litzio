import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { verifyExternalPlugin } from "../../../test/helpers/external-plugin.ts";
import assert from "node:assert/strict";
import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, describe } from "node:test";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await listenForFetch(server);
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit"); child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 7_000);
  try { await exited; } finally { clearTimeout(timeout); }
}

// Installation and Host integration keep separate 60s budgets but share one install and Host.
// Queue measurements and the preserved contract: docs/reviews/windows-packed-cli-budget-2026-11.md.
describe("the packed CLI outside the checkout using Node alone", { concurrency: false }, () => {
  const started = performance.now(); let previous = started;
  const timing = (stage: string) => { const now = performance.now(); console.log(JSON.stringify({ stage, milliseconds: Math.round(now - previous), totalMilliseconds: Math.round(now - started) })); previous = now; };
  const archive = readdirSync(dist).find(name => name.endsWith(".tgz"));
  assert.ok(archive, "Run pnpm --filter @litzio/cli package first");
  const scratch = mkdtempSync(path.join(tmpdir(), "litzio-packed-"));
  const install = path.join(scratch, "install"), cwd = path.join(scratch, "unrelated cwd");
  const a = path.join(scratch, "문서 A"), b = path.join(scratch, "documents B");
  for (const folder of [install, cwd, a, b]) mkdirSync(folder);
  const env: NodeJS.ProcessEnv = { ...process.env, LITZIO_DATA_DIR: path.join(scratch, "data"), LITZIO_PLUGINS_SETTINGS_FILE: path.join(scratch, "plugins.json"), LITZIO_DAEMON_DIR: path.join(scratch, "daemon"), LITZIO_ASSISTANT_CWD: path.join(scratch, "assistant"), LITZIO_ASSISTANT_SETTINGS_FILE: path.join(scratch, "assistant.json"), LITZIO_RESET_DIR: path.join(scratch, "reset-guard") };
  writeFileSync(path.join(scratch, "plugins.json"), JSON.stringify({ "fixture.isolated": { directory: path.join(scratch, "absent-plugin"), enabled: false, settings: {}, operationNames: [] } }));
  delete env.NODE_PATH; delete env.NODE_OPTIONS;
  env.npm_config_logs_dir = path.join(scratch, "npm-logs");
  const entry = path.join(install, "node_modules/@litzio/cli/cli.mjs");
  let installedReady = false;
  let child: ChildProcess | undefined;
  after(async () => {
    if (child) await stop(child);
    timing("host-stop");
    if (process.env.LITZIO_PACKAGED_RETAIN !== "1") rmSync(scratch, { recursive: true, force: true });
    timing("cleanup");
  }, { timeout: 15_000 });

  test("installs offline and runs the installed shim and Node document commands", { timeout: 60_000 }, () => {
    // Declare the dependency up front to avoid resolving the same tarball twice during idealTree.
    // Anchor npm here even when an ancestor of the OS temp directory is another npm project.
    writeFileSync(path.join(install, "package.json"), JSON.stringify({ name: "litzio-package-test", private: true, dependencies: { "@litzio/cli": "file:./artifact.tgz" } }));
    copyFileSync(path.join(dist, archive), path.join(install, "artifact.tgz"));
    console.log(JSON.stringify({ platform: process.platform, node: process.version, npm: execSync("npm --version", {cwd: install, env, encoding:"utf8"}).trim() }));
    timing("prepare-install");
    execSync("npm install --ignore-scripts --no-audit --no-fund --offline --timing", { cwd: install, env, stdio: "pipe" });
    timing("offline-npm-install");
    const npmTiming = readdirSync(env.npm_config_logs_dir!).find(file => file.endsWith("-timing.json"));
    assert.ok(npmTiming,"npm --timing must produce install diagnostics");
    const timers = JSON.parse(readFileSync(path.join(env.npm_config_logs_dir!,npmTiming),"utf8")).timers;
    console.log(JSON.stringify({stage:"npm-install-timers",milliseconds:Object.fromEntries(["idealTree:userRequests","idealTree:#root","reify:unpack","command:install"].map(key=>[key,timers[key]]))}));
    const bin = process.platform === "win32" ? ".\\node_modules\\.bin\\litzio.cmd" : "./node_modules/.bin/litzio";
    assert.match(execSync(`${bin} help daemon`, { cwd: install, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /--root/);
    timing("installed-command-shim");
    const installed = JSON.parse(readFileSync(path.join(install, "node_modules/@litzio/cli/package.json"), "utf8"));
    assert.equal(installed.dependencies, undefined, "No runtime install should fetch dependencies");
    const version = spawnSync(process.execPath, [entry, "--version"], { cwd, env, encoding: "utf8" });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stderr, "");
    assert.match(version.stdout, new RegExp(`^litzio ${installed.version.replaceAll(".", "\\.")} \\((?:[a-f0-9]{12,40}|unknown)\\)\\n$`));
    for (const folder of [a, b]) writeFileSync(path.join(folder, "document.md"), "---\nlitzio: 1\n---\n\n# Title\n\nAlpha.\n");
    const checked = spawnSync(process.execPath, [entry, "check", path.join(a, "document.md")], { cwd, env, encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    const formatted = spawnSync(process.execPath, [entry, "format", path.join(a, "document.md")], { cwd, env, encoding: "utf8" });
    assert.equal(formatted.status, 0, formatted.stderr);
    timing("node-version-check-format");
    installedReady = true;
  });

  test("serves both roots with the shipped plugin SDK, screen tools and Save", { timeout: 60_000 }, async () => {
    assert.ok(installedReady, "The offline installation and command contract must pass before starting the Host");
    const port = await freePort(), url = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [entry, "daemon", "run", "--channel", "development", "--port", String(port), "--root", a, "--root", b], { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "", errors = "";
    child.stderr!.on("data", data => { errors += data; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${output}\n${errors}`)), 15_000);
      child!.once("error", error => { clearTimeout(timeout); reject(error); });
      child!.once("exit", code => { clearTimeout(timeout); reject(new Error(`CLI exited ${code}: ${errors}`)); });
      child!.stdout!.on("data", data => { output += data; if (output.includes("Litzio HTTP:")) { clearTimeout(timeout); resolve(); } });
    });
    assert.equal((await fetch(url)).status, 200);
    timing("host-start");
    assert.equal(existsSync(path.join(path.dirname(entry),"npm.tar.gz")),true);
    assert.equal(existsSync(path.join(path.dirname(entry),"npm")),false);
    assert.equal(existsSync(path.join(scratch,"data/plugins/.npm-cache")),false,"Ordinary Host use must not extract npm");
    await verifyExternalPlugin(url, a, path.dirname(entry), timing);
    timing("external-plugin-complete");
    const tools = path.join(scratch,"data/plugins/.npm-cache");
    assert.equal(readdirSync(tools).filter(name=>name.startsWith("npm-")).length,1,"Dependencies must prepare the bundled npm cache");
    const plugins = (await (await fetch(url + "/api/plugins")).json()).plugins;
    assert.ok(plugins.some((p: any) => p.id === "fixture.isolated"));
    const notices = await fetch(url + "/licenses/THIRD_PARTY_LICENSES.txt");
    assert.equal(notices.status, 200);
    assert.match(notices.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(await notices.text(), /Tiptap GmbH/);
    assert.deepEqual((await (await fetch(url + "/api/document")).json()).allowedRoots, [a, b]);
    // The distributed daemon must regenerate the exact bundled Markdown, outside the checkout.
    const environmentResponse = await fetch(url + "/api/assistant/environment");
    assert.equal(environmentResponse.status, 200);
    const environment = await environmentResponse.json();
    assert.equal(readFileSync(environment.instructions, "utf8"), readFileSync(new URL("../../../apps/editor/server/assistant/AGENTS.md", import.meta.url), "utf8"));
    assert.equal(readFileSync(path.join(environment.cwd, ".agents/skills/litzio-guide/SKILL.md"), "utf8"), readFileSync(new URL("../../../apps/editor/server/assistant/litzio-guide/SKILL.md", import.meta.url), "utf8"));
    for (const folder of [a, b]) {
      const file = path.join(folder, "document.md");
      const loaded = await (await fetch(url + `/api/document?${new URLSearchParams({ path: file })}`)).json();
      const response = await fetch(url + "/api/document", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" },
        body: JSON.stringify({ path: file, revision: loaded.revision, base: { source: loaded.source },
          paragraphs: [{ path: [2], content: [{ kind: "text", text: "Packed save." }] }] }) });
      assert.equal(response.status, 200, await response.text());
      assert.equal(readFileSync(file, "utf8"), "---\nlitzio: 1\n---\n\n# Title\n\nPacked save.\n");
    }
    timing("bundled-plugins-assets-environment-two-root-save");
    const conflict = spawnSync(process.execPath, [entry, "daemon", "run", "--channel", "development", "--port", String(port), "--root", a], { cwd, env, encoding: "utf8", timeout: 10_000 });
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /Daemon lock exists/);
    timing("daemon-lock-conflict");
    await stop(child);
    await assert.rejects(fetch(url), /fetch failed/);
  });
});
