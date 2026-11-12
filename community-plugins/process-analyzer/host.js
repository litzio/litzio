import { readFileSync, realpathSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PluginOperationError } from "@litzio/plugin-sdk";
import { SPEC, CONDITIONS, capability, capabilityStatus, imr, drift, histogram, firstPass, productionSummary, insights } from "./stats.js";

const ROW_LIMIT = 2000, MAX_BYTES = 8 * 1024 * 1024;
const FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.csv$/;
const REQUIRED = ["serial_no", "test_date", "test_time", "process_hour", "station", "attempt", "step_no", "condition", "vin_v", "vout_v", "result", ...SPEC.map(p => p.key)];

/** Minimal RFC 4180 CSV reader (quotes, CRLF, BOM). */
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(v => v !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some(v => v !== "")) rows.push(row); }
  return rows;
}

function dataFolder(settings) {
  const folder = typeof settings.dataFolder === "string" ? settings.dataFolder.trim() : "";
  if (!folder || !path.isAbsolute(folder)) throw new PluginOperationError("not_found");
  try { if (!statSync(folder).isDirectory()) throw new Error(); return realpathSync(folder); } catch { throw new PluginOperationError("not_found"); }
}
function resolveFile(settings, file) {
  if (typeof file !== "string" || !FILE_PATTERN.test(file)) throw new PluginOperationError("failed");
  const folder = dataFolder(settings);
  let real;
  try { real = realpathSync(path.join(folder, file)); } catch { throw new PluginOperationError("not_found"); }
  // A symlink may not lead out of the configured data folder.
  if (path.dirname(real) !== folder) throw new PluginOperationError("forbidden");
  if (statSync(real).size > MAX_BYTES) throw new PluginOperationError("failed");
  return real;
}
function readTable(settings, file) {
  const table = parseCsv(readFileSync(resolveFile(settings, file), "utf8"));
  const head = table.shift()?.map(h => h.trim()) ?? [];
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  if (REQUIRED.some(name => !Object.hasOwn(col, name))) throw new PluginOperationError("failed");
  const serials = new Map();
  const rows = table.map(cells => {
    const get = name => cells[col[name]] ?? "";
    const n = name => { const v = Number(get(name)); if (!Number.isFinite(v)) throw new PluginOperationError("failed"); return v; };
    const serial = get("serial_no");
    if (!serials.has(serial)) serials.set(serial, serials.size + 1);
    const r = { serial, day: get("test_date"), testTime: get("test_time").slice(0, 16), processHour: n("process_hour"), station: get("station"), attempt: n("attempt"), step: n("step_no"),
      condition: get("condition"), vin: n("vin_v"), vout: n("vout_v"), result: get("result") === "PASS" ? "PASS" : "FAIL", failItems: get("fail_items"), unitIndex: serials.get(serial) };
    for (const p of SPEC) r[p.key] = n(p.key);
    return r;
  });
  return rows;
}
/** Units per test day, in date order. */
function dayCounts(rows) {
  const days = new Map();
  for (const r of rows) { const set = days.get(r.day) ?? new Set(); set.add(r.serial); days.set(r.day, set); }
  return [...days].sort(([a], [b]) => a < b ? -1 : 1).map(([day, set]) => ({ day, units: set.size }));
}
// A reversed range is corrected instead of silently returning nothing.
const inRange = (rows, from, to) => { if (from && to && from > to) [from, to] = [to, from]; return rows.filter(r => (!from || r.day >= from) && (!to || r.day <= to)); };
const dateOk = v => v === undefined || v === "" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

const round = (v, d = 4) => v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d));
const ANALYSIS_KEYS = ["rowType", "seq", "processHour", "label", "key", "unit", "n", "mean", "sigmaWithin", "sigmaOverall", "lsl", "usl", "cp", "cpk", "pp", "ppk", "outOfSpec", "dpmo", "sigmaLevel", "status",
  "units", "firstPass", "finalPass", "fpy", "yield", "defects", "measured", "mr", "cl", "ucl", "lcl", "mrCl", "mrUcl", "ooc", "mrOoc", "rule", "serial", "day", "binFrom", "binTo", "count", "expected", "severity", "message"];
const analysisRow = (rowType, seq, fields) => ({ ...Object.fromEntries(ANALYSIS_KEYS.map(k => [k, null])), rowType, seq, ...fields });

function analyze(rowsAll, { condition, parameter }) {
  const spec = SPEC.find(p => p.label === parameter), cond = CONDITIONS.includes(condition) ? condition : null;
  if (!spec || !cond) throw new PluginOperationError("failed");
  if (!rowsAll.length) return [];
  const summary = productionSummary(rowsAll);
  const caps = SPEC.map((p, i) => {
    const series = firstPass(rowsAll, cond), values = series.map(r => r[p.key]);
    const c = capability(values, p.lsl, p.usl);
    return c && { ...c, key: p.key, label: p.label, unit: p.unit, lsl: p.lsl, usl: p.usl, seq: i + 1, drift: drift(values) };
  }).filter(Boolean);
  const out = [];
  summary.forEach((s, i) => out.push(analysisRow("kpi", i + 1, { label: s.label, units: s.units, firstPass: s.firstPass, finalPass: s.finalPass, fpy: round(s.fpy, 1), yield: round(s.yield, 1), defects: s.defects, dpmo: round(s.dpmo, 1), sigmaLevel: round(s.sigmaLevel, 2) })));
  for (const c of caps) out.push(analysisRow("capability", c.seq, { label: c.label, key: c.key, unit: c.unit || null, n: c.n, mean: round(c.mean), sigmaWithin: round(c.sigmaWithin), sigmaOverall: round(c.sigmaOverall), lsl: c.lsl, usl: c.usl,
    cp: round(c.cp, 2), cpk: round(c.cpk, 2), pp: round(c.pp, 2), ppk: round(c.ppk, 2), outOfSpec: c.outOfSpec, dpmo: round(c.dpmo, 1), sigmaLevel: round(c.sigmaLevel, 2), status: capabilityStatus(c.cpk === null ? null : round(c.cpk, 2)) }));
  const series = firstPass(rowsAll, cond), values = series.map(r => r[spec.key]);
  let chart = null;
  const cap = caps.find(c => c.key === spec.key);
  if (cap && values.length >= 2) {
    chart = imr(values);
    const caption = `${spec.label}${spec.unit ? ` (${spec.unit})` : ""} · ${cond} · 최초 시험 ${values.length}대`;
    series.forEach((r, i) => out.push(analysisRow("point", i + 1, { label: caption, key: spec.key, processHour: round(r.processHour, 3), measured: round(values[i]), mr: round(chart.mr[i]), cl: round(chart.cl), ucl: round(chart.ucl), lcl: round(chart.lcl),
      mrCl: round(chart.mrBar), mrUcl: round(chart.mrUcl), ooc: chart.rule[i] !== "", mrOoc: chart.mrOoc[i], rule: chart.rule[i] || null, serial: r.serial, day: r.day })));
    histogram(values, cap.mean, cap.sigmaOverall, spec.lsl, spec.usl).forEach((b, i) => out.push(analysisRow("bin", i + 1, { label: caption, key: spec.key, binFrom: round(b.a, 5), binTo: round(b.b, 5), count: b.count, expected: round(b.expected, 3), mean: round(cap.mean, 5), lsl: spec.lsl, usl: spec.usl })));
  }
  // Worst Cpk over every condition, regardless of the selected one.
  let worst = null;
  for (const cd of CONDITIONS) for (const p of SPEC) {
    const c = capability(firstPass(rowsAll, cd).map(r => r[p.key]), p.lsl, p.usl);
    if (c && c.cpk !== null && (!worst || c.cpk < worst.cpk)) worst = { cpk: c.cpk, label: p.label, cond: cd, n: c.n };
  }
  const list = insights({ rows: rowsAll, condition: cond, parameter: spec, caps, chart, summary });
  if (worst) list.splice(2, 0, { severity: worst.cpk < 1.33 ? "주의" : "정상", message: `모든 조건을 통틀어 Cpk가 가장 낮은 곳은 ${worst.cond} 조건의 ${worst.label}(Cpk ${worst.cpk.toFixed(2)})예요.` });
  list.forEach((m, i) => out.push(analysisRow("insight", i + 1, { severity: m.severity, message: m.message })));
  return out;
}

function dateChoices(settings, file, allowed) {
  if (typeof file !== "string" || !file) return [];
  return dayCounts(readTable(settings, file)).filter(d => allowed(d.day)).map(d => ({ value: d.day, label: `${d.day} (${d.units}대)` }));
}

/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  const envelope = rows => ({ rows: rows.slice(0, ROW_LIMIT), truncated: rows.length > ROW_LIMIT, total: rows.length });
  return {
    operations: {
      // Dropdown choices (inputOptions): newest file first, so the first entry is a sensible default.
      async files() {
        const folder = dataFolder(context.settings);
        return readdirSync(folder).filter(name => FILE_PATTERN.test(name)).map(name => ({ name, time: statSync(path.join(folder, name)).mtimeMs }))
          .sort((a, b) => b.time - a.time || (a.name < b.name ? -1 : 1)).slice(0, 100).flatMap(({ name }) => {
            try { const days = dayCounts(readTable(context.settings, name)); return [{ value: name, label: `${name} · ${days.length}일 · ${days.reduce((s, d) => s + d.units, 0)}대` }]; } catch { return []; }
          });
      },
      // Start dates never go past the chosen end date, and end dates never before the start date.
      async "from-dates"({ file, dateTo }) { return dateChoices(context.settings, file, day => !dateTo || day <= dateTo); },
      async "to-dates"({ file, dateFrom }) { return dateChoices(context.settings, file, day => !dateFrom || day >= dateFrom); },
      async measurements(input) {
        if (!dateOk(input.dateFrom) || !dateOk(input.dateTo)) throw new PluginOperationError("failed");
        const rows = inRange(readTable(context.settings, input.file), input.dateFrom, input.dateTo);
        return envelope(rows.map(r => ({ ...r, vinLabel: `${r.vin}Vac`, voutLabel: `${r.vout}Vdc`, fail: r.result === "FAIL" })));
      },
      async analysis(input) {
        if (!dateOk(input.dateFrom) || !dateOk(input.dateTo)) throw new PluginOperationError("failed");
        const rows = inRange(readTable(context.settings, input.file), input.dateFrom, input.dateTo);
        const out = analyze(rows, input);
        return envelope(out);
      },
    },
    status: () => ({ available: true, message: "설정의 데이터 폴더에 있는 EOL CSV를 읽어 그래프와 공정 능력(Cp/Cpk)을 계산해요.", folders: [], decorations: [], accounts: [] }),
    dispose() {},
  };
}
