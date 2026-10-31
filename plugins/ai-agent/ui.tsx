import type { BlockSelection, UiHost } from "@litzio/plugin-api/ui";
import "./ui.css";

type Receipt = { id: string; status: "running" | "success" | "error" | "uncertain"; error?: string; result?: { markdown: string; before: string; after: string } };
export function activate(host: UiHost) {
  const h = host.React.createElement;
  function View({ data: selection }: { data: BlockSelection }) {
    const [instruction, setInstruction] = host.React.useState("");
    const [receipt, setReceipt] = host.React.useState<Receipt>();
    const [busy, setBusy] = host.React.useState(false);
    const [problem, setProblem] = host.React.useState("");
    const [decision, setDecision] = host.React.useState("");
    const live = host.React.useRef(false);
    host.React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    host.React.useEffect(() => {
      if (receipt?.status !== "running") return;
      let stopped = false, timer: ReturnType<typeof setTimeout>;
      const poll = async () => {
        try {
          const next = await host.readJson<Receipt>("api/ai-proposal", { id: receipt.id });
          if (stopped) return;
          setReceipt(next);
          if (next.status === "running") timer = setTimeout(poll, 200);
          else { setBusy(false); if (next.error) setProblem(next.error); }
        } catch (error) { if (!stopped) { setBusy(false); setProblem(String(error)); } }
      };
      void poll();
      return () => { stopped = true; clearTimeout(timer); };
    }, [receipt?.id, receipt?.status]);
    async function request() {
      setBusy(true); setProblem(""); setDecision(""); setReceipt(undefined);
      try {
        const next = await host.requestProposal<Receipt>({ id: crypto.randomUUID(), source: selection.source, index: selection.index, instruction });
        if (!live.current) return;
        setReceipt(next);
        if (next.status !== "running") { setBusy(false); if (next.error) setProblem(next.error); }
      } catch (error) { if (live.current) { setBusy(false); setProblem(String(error)); } }
    }
    function apply() {
      try { host.applyBlockProposal(selection, receipt!.result!.markdown); setDecision("적용했습니다. 문서에서 한 번의 Undo로 되돌릴 수 있습니다."); }
      catch (error) { setProblem(String(error)); setDecision("문서가 바뀌었다면 문서에서 다시 요청하세요."); }
    }
    return h("div", { className: "ai-agent-proposal" },
      h("h2", null, "AI 수정 제안"),
      h("p", null, "선택한 문단 또는 제목의 수정을 제안받습니다. 승인 전에는 문서가 바뀌지 않습니다."),
      h("label", null, "수정 지시", h("textarea", { "aria-label": "수정 지시", value: instruction, disabled: busy,
        onChange: (event: { target: { value: string } }) => setInstruction(event.target.value) })),
      h(host.Button, { onClick: () => { void request(); }, disabled: busy || !instruction.trim() || Boolean(decision) }, "제안 요청"),
      busy ? h("p", { role: "status" }, "AI 제안을 기다리고 있습니다…") : null,
      problem ? h("p", { role: "alert" }, problem) : null,
      receipt?.result ? h(host.SourceComparison, { before: receipt.result.before, after: receipt.result.after }) : null,
      receipt?.result && !decision ? h("div", { className: "ai-agent-actions" },
        h(host.Button, { onClick: apply }, "적용"),
        h(host.Button, { onClick: () => setDecision("거절했습니다. 문서는 바뀌지 않았습니다.") }, "거절")) : null,
      decision ? h("p", { role: "status" }, decision) : null);
  }
  return {
    commands: [{ id: "propose", label: "AI에게 수정 제안 요청", keywords: ["AI", "proposal", "수정"], run: async () => {
      const selection = await host.readSelection();
      const problem = await host.openTab("proposal", JSON.stringify(selection));
      if (problem) throw new Error(problem);
    } }],
    sidebar: [],
    tabs: [{ id: "proposal", label: "AI 수정 제안", className: "ai-agent-tab", View,
      open: async (resource: string) => { const data: BlockSelection = JSON.parse(resource); return { path: `AI/${crypto.randomUUID()}`, data }; } }],
    dispose() {},
  };
}
