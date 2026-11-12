// Pure statistics for 공정 분석기. No I/O. All numbers shown by the app are computed here.

export const SPEC = [
  { key: "eff_pct", label: "효율", unit: "%", lsl: 93.5, usl: null },
  { key: "thd_pct", label: "입력전류 THD", unit: "%", lsl: null, usl: 5.0 },
  { key: "pf", label: "역률", unit: "", lsl: 0.98, usl: null },
  { key: "vout_err_pct", label: "출력전압 정확도 오차", unit: "%", lsl: -1.0, usl: 1.0 },
  { key: "iout_err_pct", label: "출력전류 정확도 오차", unit: "%", lsl: -1.5, usl: 1.5 },
  { key: "vsense_err_pct", label: "입력전압 센서 오차", unit: "%", lsl: -0.8, usl: 0.8 },
  { key: "isense_err_pct", label: "입력전류 센서 오차", unit: "%", lsl: -1.0, usl: 1.0 },
  { key: "tsense_err_c", label: "온도센서 오차", unit: "°C", lsl: -2.0, usl: 2.0 },
];
export const CONDITIONS = ["180Vac/180Vdc", "180Vac/400Vdc", "230Vac/180Vdc", "230Vac/400Vdc", "260Vac/180Vdc", "260Vac/400Vdc"];
const D2 = 1.128; // d2 for moving range of 2
const CPK_GOOD = 1.33, CPK_MIN = 1.0;

export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export const stdev = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/** Inverse normal CDF (Acklam). */
export function phiInv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425; let q, r;
  if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** Sigma level from DPMO with the conventional 1.5-sigma long-term shift, capped at 6. */
export function sigmaLevelFromDpmo(dpmo) {
  const p = Math.min(Math.max(dpmo / 1e6, 1e-12), 1 - 1e-12);
  return Math.min(phiInv(1 - p) + 1.5, 6); // capped: 6.0 means "six sigma or better"
}
const round = (v, d = 4) => v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d));

/** Process capability for one parameter. `values` must be in time order (first-pass data). */
export function capability(values, lsl, usl) {
  const n = values.length;
  if (n < 2) return null;
  const m = mean(values), sOverall = stdev(values);
  const mr = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const sWithin = mean(mr) / D2;
  const idx = (s) => {
    if (!(s > 0)) return { c: null, ck: null };
    const cpu = usl === null ? null : (usl - m) / (3 * s), cpl = lsl === null ? null : (m - lsl) / (3 * s);
    const ck = Math.min(...[cpu, cpl].filter(v => v !== null));
    return { c: lsl !== null && usl !== null ? (usl - lsl) / (6 * s) : null, ck };
  };
  const w = idx(sWithin), o = idx(sOverall);
  // Expected out-of-spec rate under a normal model with the overall sigma.
  const p = sOverall > 0 ? (lsl === null ? 0 : phi((lsl - m) / sOverall)) + (usl === null ? 0 : 1 - phi((usl - m) / sOverall)) : (values.some(v => (lsl !== null && v < lsl) || (usl !== null && v > usl)) ? 1 : 0);
  const dpmo = p * 1e6;
  const out = values.filter(v => (lsl !== null && v < lsl) || (usl !== null && v > usl)).length;
  return { n, mean: m, sigmaWithin: sWithin, sigmaOverall: sOverall, cp: w.c, cpk: w.ck, pp: o.c, ppk: o.ck, dpmo, sigmaLevel: sigmaLevelFromDpmo(dpmo), outOfSpec: out, mrBar: mean(mr) };
}
export const capabilityStatus = cpk => cpk === null ? "판정 불가" : cpk >= CPK_GOOD ? "양호" : cpk >= CPK_MIN ? "주의" : "부적합";

/** Individuals and moving-range chart with Nelson rules 1, 2 and 3. */
export function imr(values) {
  const n = values.length, cl = mean(values);
  const mr = values.map((v, i) => i === 0 ? null : Math.abs(v - values[i - 1]));
  const mrBar = mean(mr.filter(v => v !== null)) || 0;
  const ucl = cl + 2.66 * mrBar, lcl = cl - 2.66 * mrBar, mrUcl = 3.267 * mrBar, sigma = mrBar / D2;
  const rule = Array(n).fill("");
  const mark = (i, text) => { rule[i] = rule[i] ? `${rule[i]}, ${text}` : text; };
  values.forEach((v, i) => { if (v > ucl || v < lcl) mark(i, "R1 관리한계 이탈"); });
  let run = 0, side = 0;
  values.forEach((v, i) => {
    const s = v > cl ? 1 : v < cl ? -1 : 0;
    run = s !== 0 && s === side ? run + 1 : s !== 0 ? 1 : 0; side = s;
    if (run >= 9) mark(i, "R2 9점 연속 한쪽");
  });
  let up = 1, down = 1;
  values.forEach((v, i) => {
    if (i === 0) return;
    up = v > values[i - 1] ? up + 1 : 1; down = v < values[i - 1] ? down + 1 : 1;
    if (up >= 6 || down >= 6) mark(i, "R3 6점 연속 증가/감소");
  });
  return { cl, ucl, lcl, mrBar, mrUcl, sigma, mr, rule, mrOoc: mr.map(v => v !== null && v > mrUcl) };
}

/** Linear drift of values over their time order. */
export function drift(values) {
  const n = values.length; if (n < 8) return null;
  const xs = values.map((_, i) => i), mx = mean(xs), my = mean(values);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), sxy = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0);
  const slope = sxy / sxx, syy = values.reduce((s, v) => s + (v - my) ** 2, 0);
  if (!(syy > 0)) return { slope: 0, total: 0, t: 0, sigma: 0 };
  const r2 = (sxy * sxy) / (sxx * syy), t = Math.sign(slope) * Math.sqrt(r2 * (n - 2) / Math.max(1 - r2, 1e-12));
  return { slope, total: slope * (n - 1), t, sigma: stdev(values) };
}

export function histogram(values, m, s, lsl, usl) {
  const n = values.length;
  const k = Math.min(14, Math.max(6, Math.round(Math.sqrt(n))));
  const lo = Math.min(...values), hi = Math.max(...values), w = (hi - lo) / k || 1;
  const bins = Array.from({ length: k }, (_, i) => ({ a: lo + i * w, b: lo + (i + 1) * w, count: 0, expected: 0 }));
  for (const v of values) bins[Math.min(k - 1, Math.floor((v - lo) / w))].count++;
  for (const b of bins) b.expected = s > 0 ? n * (phi((b.b - m) / s) - phi((b.a - m) / s)) : 0;
  return bins;
}

const num = v => typeof v === "number" && Number.isFinite(v);
/** Tidy rows -> per-unit first-pass rows for a condition, in time order. */
export function firstPass(rows, condition) {
  return rows.filter(r => r.attempt === 1 && r.condition === condition).sort((a, b) => a.processHour - b.processHour);
}
const outOfSpec = (r, p) => num(r[p.key]) && ((p.lsl !== null && r[p.key] < p.lsl) || (p.usl !== null && r[p.key] > p.usl));
/** Unit level KPIs per day plus a total row: FPY (first pass), final yield (after retest), DPMO and sigma level. */
export function productionSummary(rows) {
  const units = new Map();
  for (const r of rows) {
    const u = units.get(r.serial) ?? { day: r.day, attempts: new Map() };
    u.attempts.set(r.attempt, (u.attempts.get(r.attempt) ?? true) && r.result === "PASS");
    units.set(r.serial, u);
  }
  const per = [...units.values()].map(u => ({ day: u.day, first: u.attempts.get(1) === true, final: u.attempts.get(Math.max(...u.attempts.keys())) === true }));
  const make = (label, list, firstRows) => {
    const opportunities = firstRows.length * SPEC.length;
    const defects = firstRows.reduce((s, r) => s + SPEC.filter(p => outOfSpec(r, p)).length, 0);
    const dpmo = opportunities ? defects / opportunities * 1e6 : 0, pct = k => list.length ? list.filter(u => u[k]).length / list.length * 100 : 0;
    return { label, units: list.length, firstPass: list.filter(u => u.first).length, finalPass: list.filter(u => u.final).length, fpy: pct("first"), yield: pct("final"), defects, dpmo, sigmaLevel: sigmaLevelFromDpmo(dpmo) };
  };
  const first = rows.filter(r => r.attempt === 1), days = [...new Set(per.map(u => u.day))].sort();
  return [...days.map(d => make(d, per.filter(u => u.day === d), first.filter(r => r.day === d))), ...(days.length > 1 ? [make("전체", per, first)] : [])];
}

const f = (v, d = 2) => v === null ? "—" : v.toFixed(d);
export function insights({ rows, condition, parameter, caps, chart, summary }) {
  const out = [];
  const add = (severity, message) => out.push({ severity, message });
  const total = summary[summary.length - 1];
  if (total) add(total.fpy < 100 || total.yield < 100 ? "주의" : "정상", `선택 기간 ${total.units}대 중 최초 합격 ${total.firstPass}대(FPY ${f(total.fpy, 1)}%), 최종 수율 ${f(total.yield, 1)}%예요. 재시험·재작업이 ${total.units - total.firstPass}대 있었어요.`);
  const ranked = caps.filter(c => c.cpk !== null).sort((a, b) => a.cpk - b.cpk);
  if (ranked.length) {
    const lo = ranked[0];
    add(lo.cpk < CPK_MIN ? "경고" : lo.cpk < CPK_GOOD ? "주의" : "정상", `${condition} 조건에서 Cpk가 가장 낮은 항목은 ${lo.label}(Cpk ${f(lo.cpk)})예요. ${lo.cpk >= CPK_GOOD ? "모든 항목이 기준 1.33 이상이라 공정 능력은 양호해요." : lo.cpk >= CPK_MIN ? "기준 1.33에는 못 미쳐요. 산포나 평균 치우침을 점검하세요." : "1.0 미만이라 규격 이탈 가능성이 높아요. 원인 조치가 필요해요."}`);
    const watch = ranked.filter(c => c.cpk < CPK_GOOD && c !== lo).map(c => `${c.label}(${f(c.cpk)})`);
    if (watch.length) add("주의", `Cpk 1.33 미만인 다른 항목: ${watch.join(", ")}.`);
  }
  for (const c of caps) {
    if (c.cp !== null && c.cpk !== null && c.cp - c.cpk > 0.4) add("주의", `${c.label}은(는) Cp ${f(c.cp)} 대비 Cpk ${f(c.cpk)}로 평균이 규격 중심에서 치우쳐 있어요. 평균 조정만으로 능력을 높일 수 있어요.`);
    if (c.ppk !== null && c.cpk !== null && c.cpk - c.ppk > 0.3) add("주의", `${c.label}은(는) Ppk(${f(c.ppk)})가 Cpk(${f(c.cpk)})보다 많이 낮아요. 단기 산포보다 시간에 따른 변동이 커요.`);
    if (c.drift && Math.abs(c.drift.t) > 3 && c.sigmaOverall > 0 && Math.abs(c.drift.total) > 0.5 * c.sigmaOverall)
      add("주의", `${c.label}이(가) 시간이 지날수록 ${c.drift.total > 0 ? "올라가는" : "내려가는"} 추세예요(기간 중 ${c.drift.total > 0 ? "+" : ""}${f(c.drift.total, c.key === "pf" ? 4 : 2)}${c.unit}, 표준편차의 ${f(Math.abs(c.drift.total) / c.sigmaOverall, 1)}배). 아직 규격은 지켜도 드리프트 원인을 확인하세요.`);
  }
  if (chart) {
    const n = chart.rule.filter(Boolean).length;
    add(n ? "주의" : "정상", n ? `${parameter.label} 관리도에서 관리 이탈·이상 패턴이 ${n}점 보여요(${[...new Set(chart.rule.filter(Boolean).flatMap(r => r.split(", ").map(x => x.split(" ")[0])))].join(", ")}). 빨간 점을 확인하세요.` : `${parameter.label} 관리도에는 관리 이탈·이상 패턴이 없어요.`);
  }
  const minN = Math.min(...caps.map(c => c.n));
  if (caps.length && minN < 30) add("정보", `표본이 ${minN}개라 Cp/Cpk 추정 오차가 커요. 30개 이상(며칠 치)을 모아 다시 보면 더 믿을 만해요.`);
  return out;
}
