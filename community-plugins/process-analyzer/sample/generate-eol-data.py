#!/usr/bin/env python3
"""Generate SYNTHETIC OBCM EOL (End-of-Line) test data for the 공정 분석기 spike.

Every number is random output of this script (seed fixed). It is not measured data.
Usage: python3 generate-eol-data.py <output-dir>
"""
import csv, sys, os, random, datetime as dt

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
rng = random.Random(20261113)

# parameter, label, unit, LSL, USL, target
SPEC = [
    ("eff_pct", "효율", "%", 93.5, None, None),
    ("thd_pct", "입력전류 THD", "%", None, 5.0, None),
    ("pf", "역률", "", 0.980, None, None),
    ("vout_err_pct", "출력전압 정확도 오차", "%", -1.0, 1.0, 0.0),
    ("iout_err_pct", "출력전류 정확도 오차", "%", -1.5, 1.5, 0.0),
    ("vsense_err_pct", "입력전압 센서 오차", "%", -0.8, 0.8, 0.0),
    ("isense_err_pct", "입력전류 센서 오차", "%", -1.0, 1.0, 0.0),
    ("tsense_err_c", "온도센서 오차", "°C", -2.0, 2.0, 0.0),
]
LSL = {p[0]: p[3] for p in SPEC}; USL = {p[0]: p[4] for p in SPEC}
# 6 EOL conditions: Vin (Vac) x Vout (Vdc). load current setpoint follows Vout.
CONDS = [(180, 180), (180, 400), (230, 180), (230, 400), (260, 180), (260, 400)]
IOUT_SET = {180: 15.0, 400: 16.5}
MEAN = {  # per-condition process mean
    "eff_pct": [94.3, 95.4, 95.3, 96.3, 95.0, 96.0],
    "thd_pct": [3.6, 3.0, 3.3, 2.7, 3.9, 3.2],
    "pf": [0.9905, 0.9925, 0.9915, 0.9930, 0.9890, 0.9910],
}
SD = {"eff_pct": 0.22, "thd_pct": 0.33, "pf": 0.0020, "vout_err_pct": 0.18, "iout_err_pct": 0.30,
      "vsense_err_pct": 0.20, "isense_err_pct": 0.24, "tsense_err_c": 0.45}
CONST_MEAN = {"vout_err_pct": 0.05, "iout_err_pct": -0.05, "vsense_err_pct": 0.0, "isense_err_pct": 0.12, "tsense_err_c": 0.30}
DIGITS = {"eff_pct": 2, "thd_pct": 2, "pf": 4}
DAYS = [dt.date(2026, 11, 11), dt.date(2026, 11, 12), dt.date(2026, 11, 13)]
UNITS = [14, 16, 15]
SHIFT_START = dt.time(8, 30)
STEP_MIN = 4

def measure(day_i, unit_i, cond_i, station, sample_i):
    row = {}
    for name, *_ in SPEC:
        mean = MEAN[name][cond_i] if name in MEAN else CONST_MEAN[name]
        if name == "thd_pct" and day_i == 2:  # drift: THD creeps up through day 3
            mean += 0.50 * (unit_i / (UNITS[2] - 1))
        if name == "isense_err_pct" and station == "EOL-02" and day_i == 1:
            mean += 0.10  # station offset on day 2
        v = rng.gauss(mean, SD[name])
        row[name] = round(v, DIGITS.get(name, 3))
    return row

def build():
    rows = []; seq = 0
    outlier_unit = (1, 8); thd_fail_unit = (2, 13)  # day2 unit9 temp-sensor outlier, day3 unit14 THD fail
    for di, day in enumerate(DAYS):
        t = dt.datetime.combine(day, SHIFT_START) + dt.timedelta(minutes=8)
        for ui in range(UNITS[di]):
            seq += 1
            serial = f"OBCM-{day:%y%m%d}-{ui+1:03d}"
            station = "EOL-01" if ui % 2 == 0 else "EOL-02"
            retest_needed = False
            unit_rows = []
            for cond_i, (vin, vout) in enumerate(CONDS):
                tt = t + dt.timedelta(minutes=cond_i * STEP_MIN)
                m = measure(di, ui, cond_i, station, seq)
                if (di, ui) == outlier_unit and cond_i == 4: m["tsense_err_c"] = 3.35   # outlier
                if (di, ui) == thd_fail_unit and cond_i == 4: m["thd_pct"] = 5.42        # drift-related fail
                unit_rows.append((cond_i, vin, vout, tt, m))
            t_end = None
            for attempt in (1, 2):
                fail_any = False
                for cond_i, vin, vout, tt, m in unit_rows:
                    tt2 = tt + dt.timedelta(minutes=0 if attempt == 1 else 22)
                    mm = dict(m)
                    if attempt == 2:  # retest after rework: fresh measurement, centred on nominal
                        mm = measure(di, ui, cond_i, station, seq)
                        if (di, ui) == outlier_unit: mm["tsense_err_c"] = round(rng.gauss(0.3, 0.3), 3)
                        if (di, ui) == thd_fail_unit: mm["thd_pct"] = round(rng.gauss(MEAN["thd_pct"][cond_i] + 0.6, 0.2), 2)
                    fails = [n for n, *_ in SPEC if (LSL[n] is not None and mm[n] < LSL[n]) or (USL[n] is not None and mm[n] > USL[n])]
                    fail_any |= bool(fails)
                    rows.append({"data_origin": "SYNTHETIC", "serial_no": serial, "lot_no": f"LOT-{day:%y%m%d}-A",
                                 "test_date": day.isoformat(), "test_time": tt2.strftime("%Y-%m-%d %H:%M:%S"),
                                 "process_hour": round(di * 9 + (tt2 - dt.datetime.combine(day, SHIFT_START)).total_seconds() / 3600, 3),
                                 "station": station, "attempt": attempt, "step_no": cond_i + 1,
                                 "condition": f"{vin}Vac/{vout}Vdc", "vin_v": vin, "vout_v": vout, "iout_set_a": IOUT_SET[vout], **mm,
                                 "fail_items": ";".join(fails), "result": "FAIL" if fails else "PASS"})
                if attempt == 1 and not fail_any: break
            t += dt.timedelta(minutes=rng.randint(27, 33))
    return rows

COLS = ["data_origin", "serial_no", "lot_no", "test_date", "test_time", "process_hour", "station", "attempt", "step_no",
        "condition", "vin_v", "vout_v", "iout_set_a"] + [p[0] for p in SPEC] + ["fail_items", "result"]
rows = build()
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "eol_synthetic_3days.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, COLS); w.writeheader(); w.writerows(rows)
with open(os.path.join(OUT, "eol_spec.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f); w.writerow(["parameter", "label_ko", "unit", "lsl", "usl", "target"])
    for p in SPEC: w.writerow([p[0], p[1], p[2]] + ["" if v is None else v for v in p[3:]])
try:
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = "README"
    for line in ["SYNTHETIC DATA / 합성 데이터", "OBCM EOL 시험 합성 데이터입니다. 실제 측정값이 아닙니다 (공정 분석기 스파이크 시연용).",
                 "data 시트: 유닛 1대 × EOL 6개 조건(Vin 180/230/260 Vac × Vout 180/400 Vdc). attempt=2는 재시험.",
                 "spec 시트: 항목별 LSL/USL/목표."]: ws.append([line])
    d = wb.create_sheet("data"); d.append(COLS)
    for r in rows: d.append([r[c] for c in COLS])
    s = wb.create_sheet("spec"); s.append(["parameter", "label_ko", "unit", "lsl", "usl", "target"])
    for p in SPEC: s.append(list(p))
    wb.save(os.path.join(OUT, "eol_synthetic_3days.xlsx"))
except ImportError:
    print("openpyxl missing; xlsx skipped")
print(len(rows), "rows")
