import assert from "node:assert/strict";
import fs, { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { commitFile, commitFileFromPath, createFile, createFileFromPath, decodeUtf8, preflightFileCommit, textRevision } from "../src/index.ts";
import { createHash } from "node:crypto";

// A partial temporary write and a change found just before the rename are exercised through
// the Editor Host's save tests; these cover the remaining file properties and failures.

const ORIGINAL = "Original.\n";

test("exclusive creation publishes complete text and never replaces an existing name", () => {
  withFile((dir, original) => {
    const file = path.join(dir, "new.view.json");
    createFile(file, "한글 😀\n");
    assert.equal(readFileSync(file, "utf8"), "한글 😀\n");
    assert.throws(() => createFile(file, "replacement"), { code: "EEXIST" });
    assert.equal(readFileSync(file, "utf8"), "한글 😀\n");
    assert.equal(readFileSync(original, "utf8"), ORIGINAL);
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "new.view.json"]);
  });
});

test("opaque file creation bounds bytes, owns its snapshot and cleans failed publication", async context => {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-file-bytes-"));
  const source = path.join(dir, "staged"), target = path.join(dir, "new.bin");
  const bytes = Buffer.from([0, 255, 128, 1]);
  writeFileSync(source, bytes);
  try {
    await assert.rejects(createFileFromPath(target, source, 3), /size limit/);
    assert.deepEqual(readdirSync(dir), ["staged"]);
    // A file growing after preflight is still bounded by the streamed byte counter.
    const open = fs.promises.open.bind(fs.promises);
    context.mock.method(fs.promises, "open", async (...args: Parameters<typeof fs.promises.open>) => {
      const handle = await open(...args);
      if (args[0] === source) {
        const stat = handle.stat.bind(handle);
        handle.stat = (async () => ({ ...await stat(), size: 0, isFile: () => true })) as typeof handle.stat;
      }
      return handle;
    });
    try { await assert.rejects(createFileFromPath(target, source, 3), /size limit/); }
    finally { context.mock.restoreAll(); }
    assert.deepEqual(readdirSync(dir), ["staged"]);
    const revision = await createFileFromPath(target, source, bytes.length);
    assert.equal(revision, createHash("sha256").update(bytes).digest("hex"));
    writeFileSync(source, "later plugin write");
    assert.deepEqual(readFileSync(target), bytes);
    await assert.rejects(createFileFromPath(target, source, 100), { code: "EEXIST" });
    assert.deepEqual(readFileSync(target), bytes);
    await assert.rejects(commitFileFromPath(target, source, "0".repeat(64), 100), /changed/);
    assert.deepEqual(readFileSync(target), bytes);
    await assert.rejects(commitFileFromPath(target, source, revision, 100, () => { writeFileSync(target, "competitor"); }), /changed/);
    assert.equal(readFileSync(target, "utf8"), "competitor");
    const replaced = await commitFileFromPath(target, source, textRevision("competitor"), 100);
    assert.equal(replaced, textRevision("later plugin write"));
    assert.equal(readFileSync(target, "utf8"), "later plugin write");
    rmSync(target);
    await assert.rejects(createFileFromPath(target, source, 100, () => { throw new Error("owner lost"); }), /owner lost/);
    assert.deepEqual(readdirSync(dir), ["staged"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("partial write, flush and publication failures leave no reserved file", context => {
  withFile((dir, original) => {
    const target = path.join(dir, "new.view.json");
    for (const method of ["writeFileSync", "fsyncSync", "linkSync"] as const) {
      const write = fs.writeFileSync;
      context.mock.method(fs, method, (...args: unknown[]) => {
        if (method === "writeFileSync") write(args[0] as number, "partial");
        throw new Error("injected I/O failure");
      });
      try { assert.throws(() => createFile(target, "complete"), /injected I\/O/); }
      finally { context.mock.restoreAll(); }
      assert.deepEqual(readdirSync(dir), ["document.md"]);
      assert.equal(readFileSync(original, "utf8"), ORIGINAL);
    }
  });
});

test("a competing creator at publication wins without being overwritten", context => {
  withFile((dir, original) => {
    const target = path.join(dir, "new.view.json"), link = fs.linkSync;
    context.mock.method(fs, "linkSync", (source: string, destination: string) => {
      writeFileSync(destination, "competitor", { flag: "wx" });
      link(source, destination);
    });
    try { assert.throws(() => createFile(target, "ours"), { code: "EEXIST" }); }
    finally { context.mock.restoreAll(); }
    assert.equal(readFileSync(target, "utf8"), "competitor");
    assert.equal(readFileSync(original, "utf8"), ORIGINAL);
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "new.view.json"]);
  });
});

test("UTF-8 decoding rejects malformed bytes and preserves valid text including BOM", () => {
  for (const bytes of [[0xff], [0x80], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]]) {
    assert.throws(() => decodeUtf8(Uint8Array.from(bytes)), /Invalid UTF-8/);
  }
  const source = "\uFEFF한글 😀 �\r\n";
  assert.equal(decodeUtf8(Buffer.from(source)), source);
});

test("preflight and commit refuse invalid Unicode and detect raw-byte changes hidden by lossy decoding", () => {
  withFile((dir, file) => {
    for (const invalid of ["\uD800", "\uDC00"]) {
      assert.throws(() => preflightFileCommit(file, invalid, textRevision(ORIGINAL)), /Invalid Unicode/);
      assert.throws(() => commitFile(file, invalid, textRevision(ORIGINAL)), /Invalid Unicode/);
      assert.equal(readFileSync(file, "utf8"), ORIGINAL);
      assert.deepEqual(readdirSync(dir), ["document.md"]);
    }
    const malformed = Buffer.from([0xff]);
    writeFileSync(file, malformed);
    assert.throws(() => preflightFileCommit(file, "Changed", textRevision("�")), /changed after it was read/);
    assert.throws(() => commitFile(file, "Changed", textRevision("�")), /changed after it was read/);
    assert.deepEqual(readFileSync(file), malformed);
    assert.deepEqual(readdirSync(dir), ["document.md"]);
    const valid = "\uFEFF한글 😀 �\n";
    writeFileSync(file, valid);
    assert.deepEqual(preflightFileCommit(file, valid + "Again\n", textRevision(valid)), {
      target: fs.realpathSync.native(file), mode: statSync(file).mode,
    });
    assert.equal(decodeUtf8(readFileSync(file)), valid);
    commitFile(file, valid + "Again\n", textRevision(valid));
    assert.equal(decodeUtf8(readFileSync(file)), valid + "Again\n");
  });
});

function withFile(run: (dir: string, file: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-file-commit-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, ORIGINAL);
  try {
    run(dir, file);
  } finally {
    chmodSync(file, 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a failed rename keeps the original and removes the temporary file", (context) => {
  withFile((dir, file) => {
    context.mock.method(fs, "renameSync", () => { throw new Error("rename refused"); });
    assert.throws(() => commitFile(file, "Changed.\n", textRevision(ORIGINAL)), /rename refused/);
    context.mock.restoreAll();
    assert.equal(readFileSync(file, "utf8"), ORIGINAL);
    assert.deepEqual(readdirSync(dir), ["document.md"]);
  });
});

test("a symlinked document stays a link and its target is replaced", (context) => {
  withFile((dir, file) => {
    const link = path.join(dir, "link.md");
    try {
      symlinkSync(file, link);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip("file symlinks need extra permission here");
      throw error;
    }
    assert.equal(preflightFileCommit(link, "Changed.\n", textRevision(ORIGINAL)).target, fs.realpathSync.native(file));
    assert.equal(readFileSync(file, "utf8"), ORIGINAL);
    commitFile(link, "Changed.\n", textRevision(ORIGINAL));
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(readFileSync(file, "utf8"), "Changed.\n");
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "link.md"]);
  });
});

test("the replacement keeps the file mode regardless of the umask", { skip: process.platform === "win32" && "POSIX modes" }, () => {
  withFile((_dir, file) => {
    chmodSync(file, 0o664);
    const umask = process.umask(0o077);
    try {
      commitFile(file, "Changed.\n", textRevision(ORIGINAL));
    } finally {
      process.umask(umask);
    }
    assert.equal(statSync(file).mode & 0o7777, 0o664);
    assert.equal(readFileSync(file, "utf8"), "Changed.\n");
  });
});

test("a read-only file is refused rather than replaced", { skip: process.getuid?.() === 0 && "root may write any file" }, () => {
  withFile((dir, file) => {
    chmodSync(file, 0o444);
    assert.throws(() => preflightFileCommit(file, "Changed.\n", textRevision(ORIGINAL)), { code: /^(EACCES|EPERM)$/ });
    assert.throws(() => commitFile(file, "Changed.\n", textRevision(ORIGINAL)), { code: /^(EACCES|EPERM)$/ });
    assert.equal(readFileSync(file, "utf8"), ORIGINAL);
    assert.deepEqual(readdirSync(dir), ["document.md"]);
  });
});
