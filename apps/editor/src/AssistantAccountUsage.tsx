import type { AssistantAccountUsage } from "../shared/assistant.ts";
import { i18n } from "./i18n.ts";

/** Settings and the Context tooltip share the same account and quota wording. */
export function AssistantAccount({ value }: { value?: AssistantAccountUsage }) {
  if (value?.accountError) return <>{i18n.t("Unavailable")}</>;
  const account = value?.account;
  if (!account) return <>{i18n.t("Codex login is required on the Host.")}</>;
  if (account.type !== "chatgpt") return <>{i18n.t("API key login")}</>;
  return <>{[i18n.t("ChatGPT login"), account.email, account.planType].filter(Boolean).join(" · ")}</>;
}

function windowDuration(minutes: number | null) {
  if (minutes === null) return "—";
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), remainder = minutes % 60;
  return ([[days, "day"], [hours, "hour"], [remainder, "minute"]] as const)
    .filter(([value, unit]) => value || unit === "minute" && minutes === 0)
    .map(([value, unit]) => new Intl.NumberFormat(i18n.resolvedLanguage, { style: "unit", unit, unitDisplay: "long" }).format(value)).join(" ");
}

function resetTime(seconds: number) {
  const date = new Date(seconds * 1000), now = new Date();
  const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    ...(today ? {} : { month: "numeric", day: "numeric" }), hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
}

export function AssistantRateLimits({ value }: { value?: AssistantAccountUsage }) {
  if (value?.rateLimitsError || !value?.rateLimits?.length) return <>{i18n.t("Unavailable")}</>;
  return <>{value.rateLimits.map(bucket => <div key={bucket.name}><strong>{bucket.name}</strong>
    {bucket.windows.map((window, index) => <p className="whitespace-nowrap" key={index}>{windowDuration(window.windowDurationMins)} · {window.usedPercent}% {i18n.t("used")}
      {window.resetsAt ? ` · ${i18n.t("Resets {{time}}", { time: resetTime(window.resetsAt) })}` : ""}</p>)}
  </div>)}</>;
}
