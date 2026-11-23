import { useEffect, useRef, useState } from "react";
import { Status } from "./components/ui/status.tsx";
import { Button } from "./components/ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import { Notice } from "./ui/primitives.tsx";
import { i18n } from "./i18n.ts";
import { ASSISTANT, type AiProvider, type AssistantDiagnostics, type ProviderUpdate } from "../shared/assistant.ts";

type Request = <T>(route: string, method?: string, body?: unknown) => Promise<T>;
const POLL_MS = 1000;

/** Latest-release status beside the installed version; the Host owns the comparison. */
export function CliVersionStatus({ diagnostics }: { diagnostics?: AssistantDiagnostics }) {
  if (!diagnostics?.versionStatus) return null;
  const status = diagnostics.versionStatus;
  const checked = diagnostics.latestCheckedAt ? new Date(diagnostics.latestCheckedAt).toLocaleString() : "";
  return <Tooltip><TooltipTrigger render={<span tabIndex={0} data-testid="assistant-cli-version-status" />}>
    <Status variant="plain" tone={status === "current" ? "ok" : status === "available" ? "warning" : "neutral"}
      label={i18n.t(status === "current" ? "Up to date" : status === "available" ? "Newer version available" : "Couldn't check")} />
  </TooltipTrigger><TooltipContent>{status === "unknown" ? i18n.t("Could not read the latest public release. Run diagnostics to check again.")
    : `${i18n.t("Latest release {{version}}", { version: diagnostics.latestVersion ?? "" })} · ${i18n.t("Last checked")}: ${checked}`}</TooltipContent></Tooltip>;
}

/** Runs the provider CLI's own update on the target Host; the run continues while this screen is closed. */
export function useCliUpdate(provider: AiProvider, request: Request, finished: () => void) {
  const [update, setUpdate] = useState<ProviderUpdate>();
  const [problem, setProblem] = useState("");
  const start = useRef<() => Promise<void>>(async () => {}), onFinished = useRef(finished);
  onFinished.current = finished;
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined, running = false;
    setUpdate(undefined); setProblem("");
    const show = (value: ProviderUpdate) => {
      if (!alive) return;
      // The Host re-read diagnostics before it reported the result.
      if (running && value.status !== "running") onFinished.current();
      running = value.status === "running"; setUpdate(value);
      clearTimeout(timer);
      if (running) timer = setTimeout(() => void follow(), POLL_MS);
    };
    const fail = (error: Error) => { if (alive) setProblem(error.message); };
    const follow = () => request<ProviderUpdate>(`${ASSISTANT.providerUpdateRoute}?provider=${provider}`).then(show, fail);
    void follow();
    start.current = async () => {
      setProblem("");
      await request<ProviderUpdate>(ASSISTANT.providerUpdateRoute, "POST", { provider }).then(show, fail);
    };
    return () => { alive = false; clearTimeout(timer); };
  }, [provider]);
  return { update, problem, start: () => void start.current() };
}

export function CliUpdateButton({ provider, diagnostics, running, start }: { provider: AiProvider; diagnostics?: AssistantDiagnostics; running: boolean; start(): void }) {
  const reason = diagnostics?.updateUnavailable === "missing" ? i18n.t("The CLI was not found on the Host.")
    : diagnostics?.updateUnavailable === "unsupported" ? i18n.t("This CLI version has no update command. Update it the way you installed it.")
    // The screen only: the Host operation and CLI still run the CLI's own update when it is current.
    : diagnostics?.versionStatus === "current" ? i18n.t("Already up to date.") : undefined;
  const command = provider === "copilot" ? "copilot update" : "codex update";
  return <Tooltip><TooltipTrigger render={<span tabIndex={reason ? 0 : -1} />}>
    <Button variant="outline" size="sm" data-testid="assistant-cli-update" disabled={!diagnostics || running || !!reason} onClick={start}>{i18n.t(running ? "Updating…" : "Update")}</Button>
  </TooltipTrigger><TooltipContent>{reason ?? i18n.t("Runs {{command}} on the Host.", { command })}</TooltipContent></Tooltip>;
}

/** Result and output of the last run in this daemon session. */
export function CliUpdateResult({ update, problem }: { update?: ProviderUpdate; problem: string }) {
  if (problem) return <Notice tone="error">{problem}</Notice>;
  if (!update || update.status === "idle") return null;
  const output = update.output ? <pre className="agent-cli-update-output" data-testid="assistant-cli-update-output">{update.outputTruncated ? "…\n" : ""}{update.output}</pre> : null;
  if (update.status === "running") return output;
  const failure = update.timedOut ? i18n.t("The update did not finish within the time limit.") : update.error ? i18n.t(update.error as never) : "";
  return <div className="agent-cli-update-result" data-testid="assistant-cli-update-result">
    {update.status === "succeeded" ? <Notice tone="info">{i18n.t("Updated. If a response is running, the new version is used after it finishes.")}</Notice>
      : <Notice tone="error">{update.exitCode === undefined || update.exitCode === null ? i18n.t("Could not update.") : i18n.t("Could not update (exit code {{code}}).", { code: update.exitCode })}{failure ? ` ${failure}` : ""}</Notice>}
    {output ? <details><summary>{i18n.t("Output")}</summary>{output}</details> : null}
  </div>;
}
