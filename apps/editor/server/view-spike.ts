import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse, getEditableDocument, parseView, validateView, serializeView, rowsSchema, viewCatalog, type View } from "@litzio/core";
import { commitFile, textRevision } from "@litzio/file-commit";
import { RootAccess } from "./file-access.ts";

export const spikeRoot = path.resolve(process.env.LITZIO_VIEW_ROOT ?? "../../tmp/dynamic-ui/fixture");
export function viewOperations(root: string) {
  const access = new RootAccess([root]);
  const receipt = (operation: string) => ({ requestId: randomUUID(), operation, version: 0, host: "local-spike", scope: fs.realpathSync(root), outcome: "success", at: new Date().toISOString() });
  const read = (file: string) => {
    file = access.resolve(file);
    if (!file.endsWith(".view.json") || fs.statSync(file).size > 16384) throw new Error("Expected bounded .view.json file");
    const source = fs.readFileSync(file, "utf8");
    return { view: parseView(source), revision: textRevision(source), receipt: receipt("view.open") };
  };
  const run = (input: unknown) => {
    const view = validateView(input);
    if (view.sources.stats.operation === "app.about-fixture") return { rows: [{ setting: "Version", value: "0.0.2-beta (fixture)" }, { setting: "Release channel", value: "Beta (fixture)" }, { setting: "Update status", value: "Idle (fixture; network disabled)" }], errors: [], receipt: receipt("view.run") };
    const args = view.sources.stats.args;
    const groups = new Map<string, { folder: string; documents: number; headings: number; modified: string | null }>();
    let files = 0, entries = 0;
    const walk = (dir: string, depth: number) => {
      if (depth > 12) throw new Error("Folder depth limit");
      for (const entry of fs.readdirSync(access.resolve(dir), { withFileTypes: true })) {
        if (++entries > 2000) throw new Error("Entry limit");
        if (entry.isSymbolicLink()) continue;
        const file = access.resolve(path.join(dir, entry.name));
        if (entry.isDirectory()) { if (!entry.name.startsWith(".")) walk(file, depth + 1); continue; }
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        if (++files > 1000) throw new Error("File limit");
        const metadata = fs.statSync(file);
        if (metadata.size > 1048576) throw new Error("Document exceeds 1 MiB");
        const folder = path.relative(root, dir).replaceAll("\\", "/") || ".";
        const row = groups.get(folder) ?? { folder, documents: 0, headings: 0, modified: null };
        const doc = getEditableDocument(parse(fs.readFileSync(file, "utf8")));
        row.documents++; row.headings += doc.blocks.filter(b => b.block === "heading").length;
        const modified = metadata.mtime.toISOString();
        if (!row.modified || modified > row.modified) row.modified = modified;
        groups.set(folder, row);
        if (groups.size > 100) throw new Error("Row limit");
      }
    };
    walk(root, 0);
    let rows = [...groups.values()]; rowsSchema.parse(rows);
    if (args.folder) rows = rows.filter(r => r.folder === args.folder);
    rows.sort((a, b) => { const x = a[args.sort] ?? "", y = b[args.sort] ?? ""; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en")) * (args.descending ? -1 : 1); });
    return { rows, errors: [], receipt: receipt("view.run") };
  };
  const save = (file: string, input: unknown, expectedRevision: string | null) => {
    const source = serializeView(input);
    if (!file.endsWith(".view.json")) throw new Error("Expected .view.json extension");
    file = access.resolve(file, true);
    if (expectedRevision === null) {
      // Existing commitFile replaces files only. Reserve new names exclusively, then use it.
      const fd = fs.openSync(file, "wx"); fs.closeSync(fd);
      try { commitFile(file, source, textRevision("")); }
      catch (error) { if (fs.readFileSync(file, "utf8") === "") fs.unlinkSync(file); throw error; }
    } else commitFile(file, source, expectedRevision);
    return { path: file, revision: textRevision(source), receipt: receipt("view.save") };
  };
  return { read, run, save, validate: (input: unknown) => ({ view: validateView(input), receipt: receipt("view.validate") }) };
}

// Opt-in development middleware only. Production Host routes remain unchanged.
export async function viewSpikeRequest(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  try {
    const ops = viewOperations(spikeRoot);
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 32768) throw new Error("Request too large"); }
    const input = body ? JSON.parse(body) : {};
    let output: unknown;
    switch (input.action) {
      case "validate": output = ops.validate(input.view); break;
      case "run": output = ops.run(input.view); break;
      case "save": output = ops.save(input.path, input.view, input.expectedRevision); break;
      case "open": output = ops.read(input.path); break;
      case "catalog": output = { ...viewCatalog, root: spikeRoot }; break;
      case "proposal": {
        if (!/^(gpt-6-luna|gpt-6\.1-sol)$/.test(input.model) || !/^[0-3]$/.test(String(input.request))) throw new Error("Unknown recorded proposal");
        const { call, requests, instruction } = await import("./view-model.ts");
        const request = requests[Number(input.request)];
        const first = await call(input.model, `live-${randomUUID()}`, instruction + "Request: " + request);
        const final = first.error ? await call(input.model, `live-repair-${randomUUID()}`, instruction + "Request: " + request + "\nPrevious output: " + JSON.stringify(first.proposal) + "\nValidation error: " + first.error + "\nCorrect it.") : first;
        output = { request, model: input.model, ...final }; break;
      }
      default: throw new Error("Unknown spike operation");
    }
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(output));
  } catch (error) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: String(error), receipt: { requestId: randomUUID(), host: "local-spike", outcome: "refused", at: new Date().toISOString() } })); }
}
