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
  if (!value || value.rateLimitsError || !value.rateLimits) return <>{i18n.t("Unavailable")}</>;
  if (!value?.rateLimits?.length) return <>{i18n.t("No usage information")}</>;
  const number = (value: number | null, round = false) => value === null ? "—" : value.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: round ? 0 : 20 });
  return <>{value.rateLimits.map(bucket => {
    const individual = bucket.individualLimit;
    const hasIndividual = individual && Object.values(individual).some(value => value !== null);
    const usedPercent = individual?.remainingPercent != null ? 100 - individual.remainingPercent
      : individual?.used != null && individual.limit != null && individual.limit > 0 ? individual.used / individual.limit * 100 : undefined;
    return <div key={bucket.name}><strong>{[bucket.name, bucket.planType].filter(Boolean).join(" · ")}</strong>
    {bucket.windows.map((window, index) => <p className="whitespace-nowrap" key={index}>{windowDuration(window.windowDurationMins)} · {window.usedPercent}% {i18n.t("used")}
      {window.resetsAt ? ` · ${i18n.t("Resets {{time}}", { time: resetTime(window.resetsAt) })}` : ""}</p>)}
    {hasIndividual ? <>
      <p className="whitespace-nowrap">{i18n.t("Individual limit")} · {number(individual.used, true)} / {number(individual.limit)}
        {usedPercent !== undefined ? ` · ${Math.round(usedPercent)}% ${i18n.t("used")}` : ""}
        {individual.resetsAt ? ` · ${i18n.t("Resets {{time}}", { time: resetTime(individual.resetsAt) })}` : ""}</p>
      {individual.remainingPercent !== null ? <p>{i18n.t("{{percent}}% remaining", { percent: number(individual.remainingPercent) })}</p> : null}
    </> : null}
    {bucket.credits ? <p>{i18n.t(bucket.credits.unlimited ? "Unlimited credits" : bucket.credits.hasCredits ? "Credits available" : "No credits")}
      {bucket.credits.balance !== null ? ` · ${number(bucket.credits.balance)}` : ""}</p> : null}
    {bucket.spendControlReached ? <p><strong>{i18n.t("Spending limit reached.")}</strong></p> : null}
    {!bucket.windows.length && !hasIndividual && !bucket.credits && !bucket.spendControlReached ? <p>{i18n.t("No usage information")}</p> : null}
  </div>; })}</>;
}
