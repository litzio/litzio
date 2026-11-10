import { useEffect, useState, type ReactNode } from "react";
import { ASSISTANT, type AiProvider, type AssistantAccountUsage } from "../../shared/assistant.ts";
import { AssistantAccount, AssistantRateLimits } from "../AssistantAccountUsage.tsx";
import { createAssistantRequest } from "../assistant-api.ts";
import { useHostClient } from "../host-context.tsx";
import { i18n } from "../i18n.ts";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";

export function AssistantUsageTooltip({ provider, active, context, children }: { provider: AiProvider; active: boolean; context: string; children: ReactNode }) {
  const client = useHostClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<AssistantAccountUsage>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setValue(undefined); setFailed(false);
    if (!active || !open || provider !== "codex") return;
    const controller = new AbortController();
    const request = createAssistantRequest(client);
    const read = async () => {
      try {
        const next = await request<AssistantAccountUsage>(`${ASSISTANT.diagnosticsRoute}?provider=codex&summary=account-usage`, undefined, controller.signal);
        if (!controller.signal.aborted) { setValue(next); setFailed(false); }
      } catch { if (!controller.signal.aborted) { setValue(undefined); setFailed(true); } }
      // Poll only while the tooltip is visible. The Host reuses the 60s cache,
      // invalidating it on official account/rate-limit notifications.
      if (!controller.signal.aborted) timer = setTimeout(() => void read(), 5_000);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, active, open, provider]);
  return <Tooltip onOpenChange={setOpen}>
    <TooltipTrigger render={<span className="assistant-usage" tabIndex={0} role="img" aria-label={i18n.t("Context usage")} />}>{children}</TooltipTrigger>
    <TooltipContent className="max-w-md"><div className="min-w-0 break-words">
      <p>{context}</p>
      {provider === "codex" ? <div className="mt-2 border-t border-current/20 pt-2">
        <strong>{i18n.t("Account")}</strong>
        <p className="break-all">{value ? <AssistantAccount value={value} /> : i18n.t(failed ? "Unavailable" : "Loading…")}</p>
        {value?.account?.type === "chatgpt" || failed || value?.accountError ? <div className="mt-2">
          <strong>{i18n.t("Usage and limits")}</strong>
          <div>{value ? <AssistantRateLimits value={value} /> : i18n.t("Unavailable")}</div>
        </div> : null}
      </div> : null}
    </div></TooltipContent>
  </Tooltip>;
}
