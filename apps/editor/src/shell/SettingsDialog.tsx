import { Row, Section } from "../components/ui/row.tsx";
import { Status } from "../components/ui/status.tsx";
import { brand } from "../../../../brand.ts";
import { PluginSettings } from "../PluginSettings.tsx";
import { ResetSettings } from "./ResetSettings.tsx";
import { AssistantSettings } from "../AssistantSettings.tsx";
import { useNativeHistoryBoundary } from "../ui/use-native-history-boundary.ts";
import { DaemonStatus } from "./DesktopDaemon.tsx";
import { useTableWrapDefault, setTableWrapDefault } from "../table-wrap.ts";
import { useMessageState } from "../ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState } from "react";
import { FileText, Info, Palette, History, Server } from "lucide-react";
import { SettingsRow, SettingsSelect, SettingsProgress } from "@/components/ui/settings.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { CliIntegrationState, DesktopBridge, DesktopInfo, OfferedUpdate, ReleaseChannel, UpdateState } from "../../shared/desktop-bridge.ts";
import { RecoveryDeleteDialog } from "./Recovery.tsx";
import { Notice } from "../ui/primitives.tsx";
import { PAGE_BACKGROUNDS, readPageBackground, writePageBackground, type PageBackground, ACCENT_COLORS, readAccentColor, writeAccentColor, writeUiLanguage, THEME_LABELS, THEMES, type UiLanguage, type ThemePreference } from "../preferences.ts";
import { applyPageBackground } from "../theme.ts";

const ACCENT_LABELS = { blue: "Blue", violet: "Violet", plum: "Plum", teal: "Teal", green: "Green", graphite: "Graphite" } as const;
const PAGE_LABELS = { paper: "Paper", flat: "Flat" } as const;

const CHANNELS: { value: ReleaseChannel; label: string; hint: string }[] = [
  { value: "stable", get label() { return i18n.t("Stable"); }, get hint() { return i18n.t("Tested releases."); } },
  { value: "beta", get label() { return i18n.t("Beta"); }, get hint() { return i18n.t("New features earlier, and every Stable release."); } },
];

const kind = (update: OfferedUpdate) => (update.prerelease ? i18n.t("Beta") : i18n.t("Stable"));

/** What updating is doing, in one sentence. Every phase comes from the Desktop updater. */
function updateStatusText(info: DesktopInfo): string {
  const state: UpdateState = info.update;
  const channel = info.channel === "beta" ? i18n.t("Beta") : i18n.t("Stable");
  switch (state.phase) {
    case "idle":
      return info.updatesSupported ? i18n.t("{{product}} checks for updates automatically.") : i18n.t("Updates run in the installed app.");
    case "checking":
      return i18n.t("Checking for updates…");
    case "no-stable-release":
      return i18n.t("No Stable release has been published yet.");
    case "up-to-date":
      return state.latest && state.latest !== info.version
        ? i18n.t("You have {{version}}. The newest {{channel}} release is {{latest}}; {{product}} updates when a newer {{channel}} release is published.", { version: info.version, channel: channel, latest: state.latest })
        : i18n.t("{{product}} is up to date.");
    case "available":
      return i18n.t("{{product}} {{version}} ({{channel}}) is available. You have {{current}}.", { version: state.version, channel: kind(state), current: info.version });
    case "downloading":
      return i18n.t("Downloading {{product}} {{version}}… {{percent}}%", { version: state.version, percent: Math.floor(state.percent) });
    case "downloaded":
      return i18n.t("{{product}} {{version}} is downloaded and verified. Restart to install it.", { version: state.version });
    case "installing":
      return i18n.t("Restarting to install {{product}} {{version}}…", { version: state.version });
    case "error":
      return state.during === "check" ? i18n.t("Could not check for updates: {{reason}}", { reason: state.message })
        : state.during === "download" ? i18n.t("Could not download the update: {{reason}}", { reason: state.message })
        : i18n.t("Could not install the update: {{reason}}", { reason: state.message });
  }
}

export type SettingsCategory = "plugins" | "appearance" | "recovery" | "assistant" | "about";

function CliSettings({ desktop }: { desktop: DesktopBridge }) {
  const [state, setState] = useState<CliIntegrationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let active = true;
    void desktop.cliIntegration().then(value => { if (active) setState(value); })
      .catch(error => { if (active) setProblem(String(error)); });
    return () => { active = false; };
  }, [desktop]);
  const [changed, setChanged] = useState(false);
  const change = async (enabled?: boolean) => {
    setBusy(true); setProblem("");
    try { setState(await (enabled === undefined ? desktop.cliIntegration() : desktop.setCliIntegration(enabled))); setChanged(enabled === true); }
    catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      // A failed operation can leave an owned, repairable registration. Reflect its real state.
      try { setState(await desktop.cliIntegration()); } catch { /* Keep the first actionable error. */ }
    } finally { setBusy(false); }
  };
  return <div data-testid="cli-integration" aria-busy={busy}>
    <Row label={i18n.t("Command-line tools (CLI)")} description={<>{i18n.t("Run {{command}} commands without installing Node.js.", { command: brand.cliCommand })}{state?.unsupported ? <p>{i18n.t("Available in the installed Windows app.")}</p> : null}</>}>
      <span role="status" data-testid="cli-status"><Status variant="plain" tone={!state ? "progress" : state.status === "installed" ? "ok" : state.status === "broken" ? "error" : "neutral"} label={!state ? i18n.t("Loading…") : state.status === "installed" ? i18n.t("On") : state.status === "broken" ? i18n.t("CLI path is broken") : i18n.t("CLI off")} /></span>
      <div className="settings-actions" title={i18n.t("PATH changes apply to new terminals.")}>
      {state ? <>
        {state.status !== "installed" ? <Button size="sm" variant="outline" disabled={busy || state.unsupported || !!state.conflict}
          onClick={() => void change(true)}>{i18n.t(state.status === "broken" ? "Repair CLI" : "Turn on CLI")}</Button> : null}
        {state.status !== "off" ? <Button size="sm" variant="outline" disabled={busy || state.unsupported}
          onClick={() => void change(false)}>{i18n.t("Turn off CLI")}</Button> : null}
      </> : null}
      {problem || state?.conflict ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change()}>{i18n.t("Refresh CLI status")}</Button> : null}
      </div>
    </Row>
    {changed ? <p className="type-helper" role="status">{i18n.t("PATH changes apply to new terminals.")}</p> : null}
    {state?.conflict ? <Notice tone="error">{i18n.t("Another command or file conflicts with {{product}} CLI. Nothing was overwritten.")} {state.conflict}</Notice> : null}
    {problem ? <Notice tone="error" data-testid="cli-problem">{problem}</Notice> : null}
  </div>;
}

type SettingsDialogProps = {
  onAssistantSaved(): void;
  theme: ThemePreference;
  themeProblem: boolean;
  onThemeChange(theme: ThemePreference): void;
  highlightUpdate?: boolean;
  category: SettingsCategory;
  onCategoryChange(category: SettingsCategory): void;
  desktop?: DesktopBridge;
  recoveryCount?: number;
  recoveryProblem?: string;
  onClearRecovery?(): Promise<void>;
  info: DesktopInfo | null;
  onInfo(info: DesktopInfo): void;
  /** Restart to install; resolves to why not, or "" when the app is restarting. */
  onInstall(): Promise<string>;
};

/** Shared local recovery settings; About and update controls require the Desktop bridge. */
export function SettingsDialog({ onAssistantSaved, theme, themeProblem, onThemeChange, highlightUpdate = false, category, onCategoryChange, desktop, info, onInfo, onInstall, recoveryCount = 0, recoveryProblem: storageProblem, onClearRecovery }: SettingsDialogProps) {
  useTranslation();
  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  useNativeHistoryBoundary(screen);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const [clearing, setClearing] = useState(false);
  const [recoveryProblem, setRecoveryProblem] = useMessageState("");
  const [problem, setProblem] = useMessageState("");
  const [languageProblem, setLanguageProblem] = useState(false);
  const [accent, setAccent] = useState(() => ACCENT_COLORS.find(color => color === document.documentElement.dataset.accent) ?? readAccentColor());
  const [accentProblem, setAccentProblem] = useState(false);
  const [page, setPage] = useState(() => PAGE_BACKGROUNDS.find(page => page === document.documentElement.dataset.page) ?? readPageBackground());
  const [pageProblem, setPageProblem] = useState(false);
  const tableWrapDefault = useTableWrapDefault();
  const [tableWrapProblem, setTableWrapProblem] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logProblem, setLogProblem] = useState(false);
  const state = info?.update;
  const offered = state && "version" in state ? state : state?.phase === "error" ? state.update : undefined;
  const busy = state?.phase === "downloading" || state?.phase === "installing";
  const run = (action: () => Promise<unknown>) => {
    setProblem("");
    void action().catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)));
  };
  const categories = [
    { id: "appearance", label: i18n.t("Appearance & language"), icon: Palette },
    { id: "recovery", label: i18n.t("Saving & recovery"), icon: History },
    { id: "plugins", label: i18n.t("Plugins"), icon: Server },
    { id: "assistant", label: i18n.t("Assistant"), icon: FileText },
    ...(desktop ? [{ id: "about" as const, label: i18n.t("About & updates"), icon: Info }] : []),
  ] as const;

  return (
    <div ref={setScreen} className="settings-screen" data-testid="settings-dialog">
        <div className="settings-body">
          <aside className="settings-navigation">
            <h1>{i18n.t("Settings")}</h1>
            <nav aria-label={i18n.t("Settings categories")}>
              {categories.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost"
                aria-current={category === id ? "page" : undefined} onClick={() => onCategoryChange(id)}>
                <Icon aria-hidden="true" />{label}
              </Button>)}
            </nav>
          </aside>
          <main className="settings-content" aria-labelledby={`settings-category-${category}`}>
            <div className="settings-content-inner">
              <header className="settings-category-header"><h2 id={`settings-category-${category}`}>{categories.find(item => item.id === category)?.label}</h2></header>
              {category === "plugins" ? <PluginSettings /> : null}
              {category === "assistant" ? <AssistantSettings onSaved={onAssistantSaved} /> : null}
              {category === "appearance" ? <>
                <SettingsSelect label={i18n.t("Theme")} testId="theme"
                  value={theme} onChange={value => {
                      onThemeChange(value as ThemePreference);
                    }} options={THEMES.map(value => ({ value, label: i18n.t(THEME_LABELS[value]) }))} />
                  {themeProblem ? <p role="alert">{i18n.t("Theme could not be saved. This choice applies until you close this page.")}</p> : null}

                <SettingsSelect label={i18n.t("Page style")} testId="page-background"
                  value={page} onChange={value => {
                      const choice = value as PageBackground;
                      applyPageBackground(choice);
                      setPage(choice);
                      setPageProblem(!writePageBackground(choice));
                    }} options={PAGE_BACKGROUNDS.map(value => ({ value, label: i18n.t(PAGE_LABELS[value]) }))} />
                  {pageProblem ? <p role="alert">{i18n.t("Page style could not be saved. This choice applies until you close this page.")}</p> : null}

                <SettingsSelect label={i18n.t("Tables in new documents")} description={i18n.t("Default for documents without a remembered choice on this device.")} testId="table-wrap-default"
                  value={String(tableWrapDefault)} onChange={value => setTableWrapProblem(!setTableWrapDefault(value === "true"))} options={[{ value: "true", label: i18n.t("Wrap long text") }, { value: "false", label: i18n.t("Single line") }]} />
                  {tableWrapProblem ? <p role="alert">{i18n.t("This choice could not be saved. It applies until you close this page.")}</p> : null}

                <SettingsSelect label={i18n.t("Display language")} description={i18n.t("Remembered here; never saved in the document.")} testId="ui-language"
                  value={i18n.resolvedLanguage ?? i18n.language} onChange={value => {
                      const language = value as UiLanguage;
                      void i18n.changeLanguage(language);
                      setLanguageProblem(!writeUiLanguage(language));
                    }} options={[{ value: "ko", label: "한국어", lang: "ko" }, { value: "en", label: "English", lang: "en" }]} />
                  {languageProblem ? <p role="alert">{i18n.t("Language preference could not be saved. This choice applies until you close this page.")}</p> : null}

                <SettingsRow label={i18n.t("Accent color")} description={i18n.t("Remembered here; never saved in the document.")}>
                  <div className="settings-accent-control">
                    <div className="settings-accents" role="radiogroup" aria-label={i18n.t("Accent color")} data-testid="accent-color">
                      {ACCENT_COLORS.map(color => <label key={color} className="settings-accent" title={i18n.t(ACCENT_LABELS[color])}>
                        <input type="radio" name="accent-color" value={color} checked={accent === color} aria-label={i18n.t(ACCENT_LABELS[color])}
                          onChange={() => {
                            document.documentElement.dataset.accent = color;
                            setAccent(color);
                            setAccentProblem(!writeAccentColor(color));
                          }} />
                        <span className="settings-accent-face">
                          <span className="settings-accent-swatch" style={{ backgroundColor: `var(--id-color-accent-${color})` }} aria-hidden="true" />
                        </span>
                      </label>)}
                    </div>
                    <span className="settings-accent-name">{i18n.t(ACCENT_LABELS[accent])}</span>
                  </div>
                </SettingsRow>
                  {accentProblem ? <p role="alert">{i18n.t("Accent color could not be saved. This choice applies until you close this page.")}</p> : null}

              </> : null}
              {category === "recovery" ? <Section title={i18n.t("Local recovery")}>
                <Row label={i18n.t("Recovery records")} description={i18n.t("Applied edits are recorded on this device in this browser or app profile. Records are separate from your original files and are not shared with other devices or browsers.")}>
                  <span className="type-body">{storageProblem || i18n.t("recoveryCount", { count: recoveryCount })}</span>
                  <Button ref={clearButton} size="sm" variant="outline" onClick={() => setClearConfirm(true)}>{i18n.t("Clear all recovery records…")}</Button>
                </Row>
                <Row kind="fact" label={i18n.t("What is kept")}><ul className="settings-recovery-details">
                    <li>{i18n.t("Records expire 10 days after the last recording, at the next startup or cleanup. Closing a window keeps them. A clean Save, a tab's Don't save, a successful Reload, or Delete record removes that session's record.")}</li>
                    <li>{i18n.t("Unapplied property drafts, Undo history, selection, pending requests and image files are not backed up. Recording may fail; changes after the last record may be lost. Saving the original and recording recovery are separate operations.")}</li>
                  </ul></Row>
                <RecoveryDeleteDialog open={clearConfirm} pending={clearing} finalFocus={clearButton}
                  onCancel={() => setClearConfirm(false)} onDelete={() => {
                    setClearing(true); setRecoveryProblem("");
                    void onClearRecovery?.().then(() => setClearConfirm(false)).catch(error => setRecoveryProblem(String(error))).finally(() => { setClearConfirm(false); setClearing(false); });
                  }} />
                {recoveryProblem ? <p role="alert">{recoveryProblem}</p> : null}
                {desktop ? <ResetSettings desktop={desktop} /> : null}
              </Section> : null}
              {category === "about" && info && desktop ? (
                <>
                  <Section title={i18n.t("Local background service")}>
                    <DaemonStatus desktop={desktop}>
                    <Row label={i18n.t("Log folder")}>
                      <Button size="sm" variant="outline" disabled={logBusy} onClick={async () => {
                      setLogBusy(true); setLogProblem(false);
                      try { await desktop.openLogFolder(); }
                      catch { setLogProblem(true); }
                      finally { setLogBusy(false); }
                    }}>{i18n.t("Open log folder")}</Button>
                    {logProblem ? <Notice tone="error">{i18n.t("Could not open the log folder.")}</Notice> : null}

                    </Row>
                    </DaemonStatus>
                  </Section>
                  <Section title={i18n.t("Updates")}>
                  <div className={highlightUpdate ? "settings-update-highlight" : undefined} data-testid="settings-update-section"
                    ref={highlightUpdate ? node => node?.scrollIntoView({ block: "nearest" }) : undefined}>
                    <Row kind="fact" label={i18n.t("Version")} description={<span role="status" data-testid="update-status" data-phase={state?.phase}><Status variant="plain" tone={state?.phase === "error" ? "error" : state?.phase === "checking" || busy ? "progress" : state?.phase === "up-to-date" || state?.phase === "downloaded" ? "ok" : state?.phase === "available" ? "warning" : "neutral"} label={updateStatusText(info)} /></span>}>
                      <span data-testid="app-version">{info.version}</span>
                      {state?.phase === "available" || (state?.phase === "error" && state.during === "download") ? (
                        <Button size="sm" onClick={() => run(() => desktop.downloadUpdate())}>{i18n.t("Download update")}</Button>
                      ) : state?.phase === "downloaded" ? (
                        <Button size="sm" onClick={() => run(async () => { const reason = await onInstall(); if (reason) setProblem(reason); })}>{i18n.t("Restart to update")}</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!info.updatesSupported || state?.phase === "checking" || busy}
                          onClick={() => run(() => desktop.checkForUpdates())}>{i18n.t("Check for updates")}</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => run(() => desktop.openReleaseNotes(offered?.version))}>{i18n.t("Release notes")}</Button>
                    </Row>
                    {state?.phase === "downloading" ? (
                      <SettingsProgress max={100} value={state.percent} aria-label={i18n.t("Update download")} />
                    ) : null}
                    {problem ? <Notice tone="error" data-testid="update-problem">{problem}</Notice> : null}
                  </div>
                  <SettingsSelect label={i18n.t("Release channel")} testId="release-channel" disabled={busy} value={info.channel}
                    description={CHANNELS.find(channel => channel.value === info.channel)?.hint}
                    options={CHANNELS} onChange={value => run(async () => onInfo(await desktop.setChannel(value as ReleaseChannel)))} />
                  </Section>
                  <CliSettings desktop={desktop} />
                </>
              ) : category === "about" && desktop ? <p className="settings-status">{i18n.t("Loading…")}</p> : null}
            </div>
          </main>
        </div>
    </div>
  );
}
