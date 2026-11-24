# Spike: measures the first model request a fake Ollama recorded (Responses or Chat Completions shape).
# Usage: python measure.py <fake.jsonl> [n-th model request, default 1]
import json, sys

MARK = "# 리치오 비서"  # first line of the Litzio assistant instructions (apps/editor/server/assistant/AGENTS.md)
log = sys.argv[1]; nth = int(sys.argv[2]) if len(sys.argv) > 2 else 1
reqs = [json.loads(l) for l in open(log, encoding="utf8")]
reqs = [r for r in reqs if r.get("path") in ("/v1/responses", "/v1/chat/completions")]
r = reqs[nth - 1]; b = r["body"]
def text(c):
    if isinstance(c, str): return c
    if isinstance(c, list): return "".join(p.get("text", "") or "" for p in c if isinstance(p, dict))
    return ""
tools = b.get("tools") or []
names = [t.get("name") or t.get("function", {}).get("name") for t in tools]
tool_chars = len(json.dumps(tools, ensure_ascii=False))
if r["path"] == "/v1/responses":
    system = b.get("instructions") or ""
    msgs = b.get("input") or []
    system += "".join(text(m.get("content")) for m in msgs if m.get("role") in ("system", "developer"))
    user = "".join(text(m.get("content")) for m in msgs if m.get("role") == "user")
else:
    msgs = b.get("messages") or []
    system = "".join(text(m.get("content")) for m in msgs if m.get("role") in ("system", "developer"))
    user = "".join(text(m.get("content")) for m in msgs if m.get("role") == "user")
whole = json.dumps(b, ensure_ascii=False)
print(json.dumps({
    "path": r["path"], "model_requests": len(reqs), "body_chars": len(whole),
    "tools": len(tools), "tool_def_chars": tool_chars, "system_chars": len(system), "user_chars": len(user),
    "litzio_instructions_count": whole.count(MARK),
    "reasoning_fields": {k: b[k] for k in ("reasoning", "reasoning_effort", "think", "include") if k in b},
    "other_keys": sorted(k for k in b if k not in ("model", "messages", "input", "tools", "instructions", "stream")),
    "tool_names": names,
}, ensure_ascii=False, indent=1))
