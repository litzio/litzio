import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import childProcess, { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";
import test, { type TestContext } from "node:test";
import { trashFile, osTrashAvailable } from "../server/os-trash.ts";
import { WINDOWS_TRASH_SOURCE } from "../server/windows-trash.ts";
import { fileErrorMessage, RootAccess } from "../server/file-access.ts";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-trash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataHome = path.join(root, "data");
  const trash = path.join(dataHome, "Trash");
  return { root, trash, options: { platform: "linux" as const, dataHome } };
}

test("Windows trash capability retries a failed probe and shares successful computation for the process", { skip: process.platform !== "win32" }, async t => {
  let calls = 0, fail = true;
  const original = childProcess.execFile;
  const probe = t.mock.fn(async () => {
    calls++;
    if (fail) throw new Error("Temporary PowerShell startup failure");
    return { stdout: "True\r\n", stderr: "" };
  });
  childProcess.execFile = Object.assign(() => { throw new Error("Expected promisified probe"); }, {
    [promisify.custom]: probe,
  }) as unknown as typeof childProcess.execFile;
  syncBuiltinESMExports();
  try {
    const { osTrashAvailable: available } = await import(new URL("../server/os-trash.ts?capability-cache", import.meta.url).href);
    assert.equal(await available(), false, "a failed probe fails closed for this request");
    assert.equal(calls, 1);
    fail = false;
    assert.deepEqual(await Promise.all([available(), available()]), [true, true]);
    assert.equal(await available(), true);
    assert.equal(calls, 2, "retry once, then reuse the successful probe even for concurrent requests");
  } finally { childProcess.execFile = original; syncBuiltinESMExports(); }
});

test("Windows trash has no VisualBasic permanent-delete branch for folders", () => {
  const source = fs.readFileSync(new URL("../server/os-trash.ts", import.meta.url), "utf8") + WINDOWS_TRASH_SOURCE;
  assert.doesNotMatch(source, /FileSystem\]::DeleteDirectory|Directory\.Delete|File\.Delete|SHFileOperation/, "No permanent or legacy deletion path is allowed");
  assert.match(source, /FOFX_RECYCLEONDELETE/);
});

test("compiled Windows bridge refuses a noninteractive session before any Shell mutation", { skip: process.platform !== "win32" }, t => {
  const { root } = fixture(t), folder = path.join(root, "keep"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "child.txt"), "preserved");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command",
    "$ErrorActionPreference='Stop'; Add-Type -TypeDefinition $env:LITZIO_TEST_SOURCE; try { [Litzio.Recycle]::Move($env:LITZIO_TEST_PATH, $false); throw 'Unexpected success' } catch { if ($_.Exception.ToString().Contains('LITZIO_TRASH_UNAVAILABLE')) { exit 0 } else { throw } }"],
    { windowsHide: true, env: { ...process.env, LITZIO_TEST_SOURCE: WINDOWS_TRASH_SOURCE, LITZIO_TEST_PATH: folder } });
  assert.equal(fs.readFileSync(path.join(folder, "child.txt"), "utf8"), "preserved");
});

test("Linux home trash preserves bytes and encoded original path with local deletion time", async t => {
  const { root, trash, options } = fixture(t);
  const file = path.join(root, "한 글 #%?.md".replace("?", ""));
  fs.writeFileSync(file, "original bytes");
  const before = Date.now();
  await trashFile(file, options);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(trash, "files", path.basename(file)), "utf8"), "original bytes");
  const info = fs.readFileSync(path.join(trash, "info", path.basename(file) + ".trashinfo"), "utf8");
  const match = /^\[Trash Info\]\nPath=(.*)\nDeletionDate=(.*)\n$/.exec(info)!;
  assert.ok(match);
  assert.equal(decodeURIComponent(match[1]), path.resolve(file).split(path.sep).join("/"));
  assert.match(match[1], /%20/); assert.match(match[1], /%23/); assert.match(match[1], /%25/);
  assert.match(match[2], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
  assert.ok(new Date(match[2]).getTime() >= before - 1000);
  assert.ok(new Date(match[2]).getTime() <= Date.now());
});

test("Linux moves a nonempty folder as one rename; unsupported platforms preserve it", async t => {
  const { root, trash, options } = fixture(t);
  const folder = path.join(root, "folder"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "child.txt"), "keep");
  await assert.rejects(trashFile(folder, { platform: "darwin" }), /unavailable/);
  assert.equal(fs.readFileSync(path.join(folder, "child.txt"), "utf8"), "keep");
  await trashFile(folder, options);
  assert.equal(fs.existsSync(folder), false);
  assert.equal(fs.readFileSync(path.join(trash, "files", "folder", "child.txt"), "utf8"), "keep");
});

test("Windows CI recycles one nonempty folder through the daemon adapter", { skip: process.platform !== "win32" || !process.env.CI }, async t => {
  // Real local trash probes must stay in the worktree; CI follows the same boundary.
  const parent = path.resolve(import.meta.dirname, "../../../tmp"); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, "folder-trash-ci-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, "recycle-me"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "child.txt"), "keep");
  if (!await osTrashAvailable()) {
    await assert.rejects(trashFile(folder), /interactive Windows/);
    assert.equal(fs.readFileSync(path.join(folder, "child.txt"), "utf8"), "keep");
    return;
  }
  await trashFile(folder);
  assert.equal(fs.existsSync(folder), false);
  const recycled = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference='Stop'; $shell=New-Object -ComObject Shell.Application; $owned=@($shell.NameSpace(10).Items() | Where-Object { $_.Name -eq 'recycle-me' -and $_.ExtendedProperty('System.Recycle.DeletedFrom') -eq $env:LITZIO_TEST_PARENT }); if ($owned.Count -ne 1) { throw 'Owned folder was not found in the Recycle Bin' }; [Console]::Write($owned[0].Path)"],
    { windowsHide: true, encoding: "utf8", env: { ...process.env, LITZIO_TEST_PARENT: root } }).trim();
  assert.equal(fs.readFileSync(path.join(recycled, "child.txt"), "utf8"), "keep");
});

test("Linux collisions preserve both metadata and orphaned trash files, including concurrent deletes", async t => {
  const { root, trash, options } = fixture(t);
  fs.mkdirSync(path.join(trash, "files"), { recursive: true });
  fs.mkdirSync(path.join(trash, "info"), { recursive: true });
  fs.writeFileSync(path.join(trash, "info", "same.md.trashinfo"), "reserved info");
  fs.writeFileSync(path.join(trash, "files", "same.md.1"), "orphan");
  const sources = ["a", "b"].map(name => {
    fs.mkdirSync(path.join(root, name));
    const file = path.join(root, name, "same.md"); fs.writeFileSync(file, name); return file;
  });
  await Promise.all(sources.map(file => trashFile(file, options)));
  assert.equal(fs.readFileSync(path.join(trash, "info", "same.md.trashinfo"), "utf8"), "reserved info");
  assert.equal(fs.readFileSync(path.join(trash, "files", "same.md.1"), "utf8"), "orphan");
  assert.deepEqual([2, 3].map(n => fs.readFileSync(path.join(trash, "files", `same.md.${n}`), "utf8")).sort(), ["a", "b"]);
  assert.ok(sources.every(file => !fs.existsSync(file)));
});

test("Linux EXDEV refuses deletion, cleans metadata and exposes a path-free reason", async t => {
  const { root, trash, options } = fixture(t);
  const file = path.join(root, "document.md"); fs.writeFileSync(file, "keep");
  const access = new RootAccess([root]);
  await assert.rejects(trashFile(file, { ...options, rename: async () => {
    throw Object.assign(new Error("rename outside-secret-path"), { code: "EXDEV" });
  } }), error => {
    const message = fileErrorMessage(error, access);
    assert.match(message, /different devices.*EXDEV/);
    assert.doesNotMatch(message, /outside-secret-path/);
    return true;
  });
  assert.equal(fs.readFileSync(file, "utf8"), "keep");
  assert.deepEqual(fs.readdirSync(path.join(trash, "info")), []);
  assert.deepEqual(fs.readdirSync(path.join(trash, "files")), []);
});

test("Linux unavailable trash directory preserves source; relative XDG data home falls back to home", async t => {
  const { root, options } = fixture(t);
  const file = path.join(root, "document.md"); fs.writeFileSync(file, "keep");
  fs.writeFileSync(options.dataHome, "blocks directory creation");
  await assert.rejects(trashFile(file, options), /home trash folders.*E(NOTDIR|EXIST)/);
  assert.equal(fs.readFileSync(file, "utf8"), "keep");
  await trashFile(file, { platform: "linux", dataHome: "relative", home: root });
  assert.equal(fs.readFileSync(path.join(root, ".local", "share", "Trash", "files", "document.md"), "utf8"), "keep");
});

test("restricted filesystem errors retain codes without leaking resolved paths", t => {
  const { root } = fixture(t);
  const access = new RootAccess([root]);
  const error = Object.assign(new Error("ENOENT: open '/outside/secret'"), { code: "ENOENT" });
  assert.match(fileErrorMessage(error, access), /ENOENT/);
  assert.doesNotMatch(fileErrorMessage(error, access), /outside|secret/);
  assert.equal(fileErrorMessage(error, null), error.message);
});

test("Linux native platform uses temporary XDG_DATA_HOME without a gio command", { skip: process.platform !== "linux" }, async t => {
  const { root, trash, options } = fixture(t);
  const previous = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = options.dataHome;
  t.after(() => { if (previous === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = previous; });
  const file = path.join(root, "native\n한글?#.md"); fs.writeFileSync(file, "native");
  await trashFile(file);
  assert.equal(fs.existsSync(file), false);
  const name = path.basename(file);
  assert.equal(fs.readFileSync(path.join(trash, "files", name), "utf8"), "native");
  const info = fs.readFileSync(path.join(trash, "info", name + ".trashinfo"), "utf8");
  assert.match(info, /%0A/); assert.match(info, /%3F%23/);
  assert.equal(decodeURIComponent(info.split("\n")[1].slice(5)), file);
  assert.equal(fs.statSync(path.join(trash, "files")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(trash, "info", name + ".trashinfo")).mode & 0o777, 0o600);
});
