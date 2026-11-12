import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "@litzio/plugin-sdk";
import { PluginHost } from "../server/plugins/plugin-host.ts";
// @ts-expect-error plain ESM plugin artifact
import { capability, imr, phiInv, phi, sigmaLevelFromDpmo, productionSummary, SPEC } from "../../../community-plugins/process-analyzer/stats.js";

const dir = fileURLToPath(new URL("../../../community-plugins/process-analyzer/", import.meta.url));
const ID = "community.process-analyzer";
const sample = path.join(dir, "sample");

test("공정 분석기 manifest is declarative, binds Chart fields and matches the spec sheet", () => {
  const manifest = validateManifest(JSON.parse(readFileSync(path.join(dir, "litzio-plugin.json"), "utf8")));
  assert.equal(manifest.contributes.views.length, 2);
  const graph = JSON.parse(JSON.stringify(manifest.contributes.views[0]!.definition)).layout.children[0];
  const csv = readFileSync(path.join(sample, "eol_spec.csv"), "utf8").replace(/^\uFEFF/, "").trim().split("\n").slice(1).map(l => l.split(","));
  assert.equal(csv.length, SPEC.length);
  for (const [key, , , lsl, usl] of csv) {
    const p = SPEC.find((s: any) => s.key === key)!;
    assert.equal(p.lsl ?? "", lsl === "" ? "" : Number(lsl)); assert.equal(p.usl ?? "", usl === "" ? "" : Number(usl));
    assert.deepEqual(graph.limits[key!], { ...(lsl ? { lsl: Number(lsl) } : {}), ...(usl ? { usl: Number(usl) } : {}) });
  }
  // The plugin ships no script, markup or style: only the entry module and data.
  assert.equal(/<script|<style|javascript:|https?:/i.test(JSON.stringify(manifest)), false);
});

test("statistics: Cp/Cpk/Pp/Ppk, sigma level and I-MR rules follow textbook formulas", () => {
  assert.ok(Math.abs(phi(1.96) - 0.9750021049) < 1e-6 && Math.abs(phiInv(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(sigmaLevelFromDpmo(3.4) - 6) < 0.02, "3.4 DPMO is six sigma with the 1.5 shift");
  const values = [10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 10.0, 9.9, 10.1, 10.0];
  const c = capability(values, 9, 11)!;
  const m = values.reduce((a: number, b: number) => a + b) / values.length;
  const sd = Math.sqrt(values.reduce((a: number, v: number) => a + (v - m) ** 2, 0) / 9);
  const mrBar = values.slice(1).reduce((a: number, v: number, i: number) => a + Math.abs(v - values[i]!), 0) / 9;
  assert.ok(Math.abs(c.pp - 2 / (6 * sd)) < 1e-12 && Math.abs(c.cp - 2 / (6 * mrBar / 1.128)) < 1e-12);
  assert.ok(Math.abs(c.cpk - Math.min(11 - m, m - 9) / (3 * mrBar / 1.128)) < 1e-12);
  assert.equal(capability(values, null, 11)!.cp, null, "one-sided spec has no Cp");
  const chart = imr([5, 5.1, 4.9, 5, 5.05, 4.95, 5, 5.1, 4.9, 9]);
  assert.match(chart.rule[9], /R1/);
  const trend = imr([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]);
  assert.match(trend.rule[5], /R3/);
  const run = imr([2, 2.1, 2, 2.1, 2, 2.1, 2, 2.1, 2, 2.1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.match(run.rule[8], /R2/);
});

test("공정 분석기 runs through the real plugin Host: CSV graph rows, analysis rows and guarded file access", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-process-analyzer-")), data = path.join(root, "data");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(data);
  copyFileSync(path.join(sample, "eol_synthetic_3days.csv"), path.join(data, "eol_synthetic_3days.csv"));
  writeFileSync(path.join(root, "secret.csv"), "x"); symlinkSync(path.join(root, "secret.csv"), path.join(data, "link.csv"));
  const host = new PluginHost(path.join(root, "state.json"), { officialPlugins: [] });
  try {
    await host.invoke("register", { directory: dir });
    await host.invoke("trust", { id: ID, registrationId: (await host.list())[0]!.registrationId });
    await host.invoke("settings", { id: ID, settings: { dataFolder: data } });
    await host.invoke("enable", { id: ID });
    const op = async (name: string, input: unknown) => { const r: any = await host.invokeOperation(`${ID}.${name}`, input); assert.equal(r.receipt.outcome, "success", JSON.stringify(r)); return r.result; };
    const files = await op("csv-files", { query: "eol" });
    assert.deepEqual(files, [{ value: "eol_synthetic_3days.csv", label: "eol_synthetic_3days.csv" }]);
    const all = await op("measurements", { file: "eol_synthetic_3days.csv" });
    assert.equal(all.total, 282); assert.equal(all.truncated, false);
    assert.ok(all.rows.some((r: any) => r.fail === true) && all.rows.every((r: any) => r.vinLabel.endsWith("Vac")));
    const day2 = await op("measurements", { file: "eol_synthetic_3days.csv", dateFrom: "2026-11-12", dateTo: "2026-11-12" });
    assert.ok(day2.rows.length > 0 && day2.rows.every((r: any) => r.day === "2026-11-12"));
    const analysis = await op("analysis", { file: "eol_synthetic_3days.csv", condition: "260Vac/180Vdc", parameter: "입력전류 THD" });
    const kind = (k: string) => analysis.rows.filter((r: any) => r.rowType === k);
    assert.equal(kind("capability").length, SPEC.length);
    assert.equal(kind("kpi").length, 4, "three days plus the total row");
    const total = kind("kpi").at(-1);
    assert.equal(total.units, 45); assert.equal(total.firstPass, 43); assert.equal(total.finalPass, 45);
    assert.ok(total.fpy < total.yield, "retests make final yield exceed first-pass yield");
    assert.equal(kind("point").length, 45); assert.ok(kind("point").some((r: any) => r.ooc === true));
    assert.equal(kind("bin").reduce((s: number, r: any) => s + r.count, 0), 45);
    assert.ok(kind("insight").length >= 3 && kind("insight").some((r: any) => /드리프트|추세/.test(r.message)));
    const thd = kind("capability").find((r: any) => r.key === "thd_pct");
    assert.equal(thd.cp, null, "THD has only an upper limit"); assert.ok(thd.cpk < 1.33);
    const oneDay = await op("analysis", { file: "eol_synthetic_3days.csv", condition: "230Vac/400Vdc", parameter: "효율", dateFrom: "2026-11-11", dateTo: "2026-11-11" });
    assert.equal(oneDay.rows.filter((r: any) => r.rowType === "kpi").length, 1);
    assert.ok(oneDay.rows.some((r: any) => r.rowType === "insight" && /표본이 14개/.test(r.message)));
    // Names outside the declared file pattern never reach the plugin.
    for (const bad of [{ file: "../secret.csv" }, { file: "/etc/passwd" }]) await assert.rejects(host.invokeOperation(`${ID}.measurements`, bad), /Invalid operation input/);
    for (const bad of [{ file: "link.csv" }, { file: "missing.csv" }, { file: "eol_synthetic_3days.csv", dateFrom: "yesterday" }]) {
      const r: any = await host.invokeOperation(`${ID}.measurements`, bad);
      assert.equal(r.receipt.outcome, "failure", JSON.stringify(bad));
    }
    assert.equal(productionSummary([]).length, 0);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
