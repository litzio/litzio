import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateView } from "../packages/core/src/views/index.ts";
const results = JSON.parse(fs.readFileSync("tmp/dynamic-ui/evidence/comparison.json", "utf8"));
for (const model of ["gpt-6-luna", "gpt-6.1-sol"]) {
  const cases = results.filter((r: any) => r.model === model && !r.faultInjection);
  for (const [i, c] of cases.entries()) {
    assert.equal(c.first.error, null); assert.equal(c.first.commands, 0);
    if (i === 3) { assert.equal(c.first.proposal.view, null); assert.ok(c.first.proposal.unsupported); continue; }
    const v = validateView(c.first.proposal.view), panel = v.layout.children[0]!;
    assert.equal(panel.component, "Table");
    if (panel.component === "Table") assert.deepEqual(panel.columns, i === 2 ? ["folder", "headings"] : ["folder", "documents"]);
    assert.equal(v.layout.children.length, i === 1 ? 2 : 1);
    if (i === 1) { const chart = v.layout.children[1]!; assert.equal(chart.component, "BarChart"); if (chart.component === "BarChart") { assert.equal(chart.x, "folder"); assert.equal(chart.y, "documents"); } }
    if (i === 2) { const source = v.sources.stats; assert.equal(source.operation, "folder.statistics"); if (source.operation === "folder.statistics") assert.deepEqual(source.args, { folder: "beta", sort: "headings", descending: true }); }
  }
  const repair = results.find((r: any) => r.model === model && r.faultInjection);
  assert.ok(repair.error); assert.equal(repair.repaired.error, null); validateView(repair.repaired.proposal.view);
}
const browser = JSON.parse(fs.readFileSync("tmp/browser-results/scenarios-dynamic-ui-spike/scenario-result.json", "utf8"));
const output = execFileSync(process.execPath, ["--import", "tsx", "packages/cli/src/cli.ts", "view", "run", browser.file, "--root", path.resolve("tmp/dynamic-ui/fixture"), "--json"], { encoding: "utf8", windowsHide: true });
const cli = JSON.parse(output);
const response = await fetch("http://127.0.0.1:5173/api/view-spike", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", view: browser.generated.proposal.view }) });
assert.ok(response.ok); const ui = await response.json(); assert.deepEqual(cli.rows, ui.rows);
assert.deepEqual(cli.rows.map((r: any) => [r.folder, r.documents, r.headings]), [["alpha", 1, 5], ["beta", 2, 10]]);
fs.writeFileSync("tmp/dynamic-ui/evidence/verification.json", JSON.stringify({ bindingChecks: "8/8 correct (includes 2 refusals)", repairChecks: "2/2", cliUiRowsEqual: true, cli, browser }, null, 2));
console.log("Model bindings/refusals, repair, CLI/UI full rows and fixture aggregates passed.");
