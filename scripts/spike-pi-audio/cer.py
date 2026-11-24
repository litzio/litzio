# Spike: character error rate of the FLEURS transcriptions per route.
# Normalization: NFKC, lower case, punctuation and whitespace removed (Korean digits/units are not normalized,
# so "15미터" vs "15m" counts as errors). Usage: python cer.py <samples.json> <results.jsonl>
import json, sys, unicodedata, re

def norm(text):
    text = unicodedata.normalize("NFKC", text or "").lower()
    return re.sub(r"[\W_]+", "", text)

def distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]

samples = {s["id"]: s for s in json.load(open(sys.argv[1], encoding="utf8"))}
rows = [json.loads(l) for l in open(sys.argv[2], encoding="utf8")]
totals = {}
for r in rows:
    if r["task"] != "transcribe": continue
    ref = norm(samples[r["id"]]["raw"]); hyp = norm(r.get("text"))
    d = distance(ref, hyp); key = (r["lang"], r["route"])
    t = totals.setdefault(key, [0, 0]); t[0] += d; t[1] += len(ref)
    print(f'{r["lang"]} {samples[r["id"]]["split"]} {r["id"]} {r["route"]:6} CER={d / len(ref):.3f}')
for (lang, route), (d, n) in sorted(totals.items()):
    print(f"TOTAL {lang} {route:6} CER={d / n:.3f} ({d}/{n})")
