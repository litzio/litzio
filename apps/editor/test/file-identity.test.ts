import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { RootAccess } from "../server/file-access.ts";
import { readFilePreview } from "../server/document-api.ts";
import { readBibliographySources } from "../server/bibliography.ts";

for (const field of ["dev", "ino"] as const) {
  test(`Root replacement distinguishes large ${field} values`, t => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-root-precision-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const original = fs.statSync.bind(fs);
    let identity = 2n ** 54n;
    assert.equal(Number(identity), Number(identity + 1n));
    t.mock.method(fs, "statSync", (file: fs.PathLike, options?: fs.StatOptions) => {
      const stat = original(file, options as any);
      return Object.assign(stat, { [field]: options?.bigint ? identity : Number(identity) });
    });
    const access = new RootAccess([root]);
    assert.equal(access.resolve(root), root);
    identity++;
    assert.throws(() => access.resolve(root), /allowed folder changed/);
  });

  test(`preview and bibliography reject replacement with large ${field}`, t => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-read-precision-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const image = path.join(root, "image.svg"), doc = path.join(root, "doc.md"), bib = path.join(root, "refs.bib");
    fs.writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    fs.writeFileSync(doc, "text"); fs.writeFileSync(bib, "@misc{a,title={A}}");
    const original = fs.fstatSync.bind(fs);
    t.mock.method(fs, "fstatSync", (fd: number, options?: fs.StatOptions) => {
      const stat = original(fd, options as any);
      // The path identifies 2^54+1, while the open descriptor identifies 2^54.
      return Object.assign(stat, { [field]: options?.bigint ? 2n ** 54n : Number(2n ** 54n) });
    });
    for (const method of ["statSync", "lstatSync"] as const) {
      const originalPathStat = fs[method].bind(fs);
      t.mock.method(fs, method, (file: fs.PathLike, options?: fs.StatOptions) => {
        const stat = originalPathStat(file, options as any);
        if (String(file) === image || String(file) === bib) Object.assign(stat, { [field]: options?.bigint ? 2n ** 54n + 1n : Number(2n ** 54n + 1n) });
        return stat;
      });
    }
    assert.throws(() => readFilePreview(root, image), { name: "Error", message: "Path is outside the allowed folders." });
    assert.deepEqual(readBibliographySources(doc, ["refs.bib"])[0], { source: "refs.bib", status: "error", code: "bibliography-changed" });
  });
}
