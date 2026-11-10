import type { AssistantAccountUsage } from "../shared/assistant.ts";
import { i18n } from "./i18n.ts";

/** Settings and the Context tooltip share the same account and quota wording. */
export function AssistantAccount({ value }: { value?: AssistantAccountUsage }) {
  if (value?.accountError) return <>{i18n.t("Unavailable")}</>;
  const account = value?.account;
  if (!account) return <>{i18n.t("Codex login is required on the Host.")}</>;
  if (account.type !== "chatgpt") return <>{account.type}</>;
  return <>{[account.type, account.email, account.planType].filter(Boolean).join(" · ")}</>;
}

export function AssistantRateLimits({ value }: { value?: AssistantAccountUsage }) {
  if (value?.rateLimitsError || !value?.rateLimits?.length) return <>{i18n.t("Unavailable")}</>;
  return <>{value.rateLimits.map(bucket => <div key={bucket.name}><strong>{bucket.name}</strong>
    {bucket.windows.map((window, index) => <p key={index}>{window.windowDurationMins ?? "—"} {i18n.t("minutes")} · {window.usedPercent}% {i18n.t("used")}
      {window.resetsAt ? ` · ${i18n.t("Resets")}: ${new Date(window.resetsAt * 1000).toLocaleString()}` : ""}</p>)}
  </div>)}</>;
}
