import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import type { GenericParent } from "myst-common";
// Imported by package name, exactly as CLI, Editor Host and other consumers do.
import * as core from "@litzio/core";
import { getEditableDocument, inspectDocument, parse, serialize, type Document } from "@litzio/core";

test("public document targets resolve only blocks and existing table cells in the canonical read model", async () => {
  const authored = await core.authorDocument({inputs:[{key:"table",blocks:[{kind:"table",rows:[["header",""],["value","second"]]}]},{key:"text",blocks:[{kind:"paragraph",text:"body"}]}]});
  const snapshot = core.readCanonicalDocument(authored.source);
  assert.equal(snapshot.documentRevision, authored.documentRevision);
  const table = snapshot.document.blocks.find(block => block.block === "table")!;
  assert.equal(core.resolveDocumentTarget(snapshot.document, table.path)?.kind,"block");
  if (table.block !== "table") throw new Error("Expected table");
  for (const row of table.rows) for (const cell of row.cells) {
    const resolved = core.resolveDocumentTarget(snapshot.document,cell.path);
    assert.equal(resolved?.kind,"cell");
    if (resolved?.kind === "cell") assert.equal(resolved.cell.text,cell.text);
  }
  for (const path of [[],[-1],[1.5],[NaN],[Infinity],[999],[...table.path,99,0],[...table.path,0],[...table.rows[0].cells[0].path,0],[...authored.inputs[1].targets[0].path,0,0]]) assert.equal(core.resolveDocumentTarget(snapshot.document,path),undefined);
  assert.throws(()=>core.readCanonicalDocument(authored.source+"\n"),/canonical/);
});

// The public Document is opaque: its MyST representation is not a consumer contract.
// `pnpm typecheck` fails if any expectation below stops being an error.
function consumerContract(document: Document): void {
  serialize(document);
  getEditableDocument(document);
  inspectDocument(document);
  // @ts-expect-error consumers cannot read the document tree
  void document.children;
  // @ts-expect-error consumers cannot read node types
  void document.type;
  // @ts-expect-error a parsed Document is not a MyST GenericParent
  const tree: GenericParent = document;
  void tree;
  // @ts-expect-error consumers cannot build a document from raw MyST nodes
  assert.throws(() => serialize({ type: "root", children: [] }));
}

// @ts-expect-error the MyST node alias is not public
export type RemovedNode = core.DocumentNode;

test("public Core API exposes semantic operations, not MyST tree access", () => {
  consumerContract(parse("---\nlitzio: 1\n---\n\n# Title\n"));
  for (const name of ["getNode", "insertBlock", "cloneDocument", "replaceBlockSource"]) {
    assert.equal(name in core, false, `${name} must not be public`);
  }
  assert.equal(serialize(parse("---\nlitzio: 1\n---\n\n# Title\n")), "---\nlitzio: 1\n---\n\n# Title\n");
});

test("bodyEndIndex locates insertion before endnotes, after body blocks, or at the first body position", () => {
  const native = (body: string) => parse(`---\nlitzio: 1\n---\n\n${body}`);
  assert.equal(core.bodyEndIndex(native("# Report\n\nClaim[^a] and evidence[^b].\n\n[^a]: First.\n\n[^b]: Second.\n")), 3);
  assert.equal(core.bodyEndIndex(native("# Report\n\nBody.\n")), 3);
  assert.equal(core.bodyEndIndex(core.createDocument()), 1);
});

test("MyST packages are imported only inside Core's MyST boundary", () => {
  const root = new URL("../src/", import.meta.url);
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
  const outside = files.filter((file) => !file.replaceAll("\\", "/").startsWith("myst/") &&
    /from\s+["']myst-/.test(readFileSync(new URL(file, root), "utf8")));
  assert.deepEqual(outside, []);
});

// Core is headless: no Node/filesystem, Host, Editor or CLI code, only its own source and declared dependencies.
test("Core source imports only its own modules and declared dependencies", () => {
  const root = new URL("../src/", import.meta.url);
  const { dependencies } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as
    { dependencies: Record<string, string> };
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
  const outside = files.flatMap((file) =>
    [...readFileSync(new URL(file, root), "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
      .map(([, specifier]) => specifier)
      .filter((specifier) => specifier.startsWith(".")
        ? !new URL(specifier, new URL(file, root)).href.startsWith(root.href)
        : !Object.hasOwn(dependencies, specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/")))
      .map((specifier) => `${file}: ${specifier}`));
  assert.deepEqual(outside, []);
});
