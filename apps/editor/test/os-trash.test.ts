import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { trashFile } from "../server/os-trash.ts";
import { fileErrorMessage, RootAccess } from "../server/file-access.ts";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-trash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataHome = path.join(root, "data");
  const trash = path.join(dataHome, "Trash");
  return { root, trash, options: { platform: "linux" as const, dataHome } };
}

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
  await trashFile(folder);
  assert.equal(fs.existsSync(folder), false);
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
