import fs from "node:fs";
import path from "node:path";
import { call, requests, instruction } from "../apps/editor/server/view-model.ts";
import { validateView } from "../packages/core/src/views/index.ts";
const directory = path.resolve("tmp/dynamic-ui/evidence");
const results: any[] = [];
for (const model of ["gpt-6-luna", "gpt-6.1-sol"]) {
  for (const [i, request] of requests.entries()) {
    const first = await call(model, String(i), instruction + "Request: " + request);
    const retry = first.error ? await call(model, `${i}-retry`, instruction + "Request: " + request + "\nYour previous output: " + JSON.stringify(first.proposal) + "\nCore validation error: " + first.error + "\nCorrect it.") : null;
    const accepted = retry ?? first;
    fs.writeFileSync(path.join(directory, `${model}-${i}.json`), JSON.stringify({ request, model, effort: "low", ...accepted }, null, 2));
    results.push({ model, request, first, retry }); console.log(model, i, first.error ?? "accepted", first.ms, first.usage);
  }
  const base = results.find(r => r.model === model && r.first.proposal?.view)?.first.proposal.view;
  if (base) {
    const invalid = structuredClone(base); invalid.layout.children[0].columns = ["authorEmail"];
    let error = ""; try { validateView(invalid); } catch (e) { error = String(e); }
    const repaired = await call(model, "repair", instruction + "Request: " + requests[0] + "\nPrevious invalid view: " + JSON.stringify(invalid) + "\nCore validation error: " + error + "\nCorrect to the requested supported fields.");
    results.push({ model, faultInjection: true, invalid, error, repaired }); console.log(model, "repair", repaired.error ?? "accepted");
  }
  fs.writeFileSync(path.join(directory, "comparison.json"), JSON.stringify(results, null, 2));
}
