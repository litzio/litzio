// The Desktop bridge in the sandboxed page: typed calls to the main process, nothing else.
// No Node.js API or document content is exposed. OS folder actions are validated in main.
import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, RestartCheck, UpdateState } from "../../editor/shared/desktop-bridge.ts";

let restartCheck: (() => RestartCheck) | null = null;

ipcRenderer.on("desktop:restart-check", (_event, id: number) => {
  let answer: RestartCheck;
  try {
    answer = restartCheck ? restartCheck() : { ok: false, reason: "The editor is not ready to restart." };
  } catch {
    answer = { ok: false, reason: "Could not confirm that your work is saved." };
  }
  ipcRenderer.send("desktop:restart-check-result", id, answer);
});

const bridge: DesktopBridge = {
  registeredHosts: () => ipcRenderer.invoke("desktop:hosts"),
  registerHost: (origin, label) => ipcRenderer.invoke("desktop:host-register", origin, label),
  renameHost: (id, label) => ipcRenderer.invoke("desktop:host-rename", id, label),
  removeHost: id => ipcRenderer.invoke("desktop:host-remove", id),
  reportHostWork: summary => ipcRenderer.invoke("desktop:host-work", summary),
  restartForHosts: () => ipcRenderer.invoke("desktop:host-restart"),
  hostConnection: () => ipcRenderer.invoke("desktop:host-connection"),
  startup: () => ipcRenderer.invoke("desktop:startup"),
  openInBrowser: () => ipcRenderer.invoke("desktop:browser"),
  daemonInfo: () => ipcRenderer.invoke("desktop:daemon-info"),
  stopDaemon: () => ipcRenderer.invoke("desktop:daemon-stop"),
  checkDaemon: () => ipcRenderer.invoke("desktop:daemon-check"),
  reconnectDaemon: () => ipcRenderer.invoke("desktop:daemon-reconnect"),
  setOpenedFolders: roots => ipcRenderer.invoke("desktop:opened-folders", roots),
  providerSessionLog: (hostId, id, provider, action) => ipcRenderer.invoke("desktop:provider-session-log", hostId, id, provider, action),
  openFolderInExplorer: folder => ipcRenderer.invoke("desktop:open-folder", folder),
  openLogFolder: () => ipcRenderer.invoke("desktop:open-log-folder"),
  setTheme: (theme) => ipcRenderer.invoke("desktop:set-theme", theme),
  setWindowBackground: (color, overlay) => ipcRenderer.invoke("desktop:set-window-background", color, overlay),
  info: () => ipcRenderer.invoke("desktop:info"),
  cliIntegration: () => ipcRenderer.invoke("desktop:cli-state"),
  setCliIntegration: (enabled) => ipcRenderer.invoke("desktop:cli-set", enabled),
  setChannel: (channel) => ipcRenderer.invoke("desktop:set-channel", channel),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download"),
  installUpdate: () => ipcRenderer.invoke("desktop:install"),
  markUpdateSeen: (version) => ipcRenderer.invoke("desktop:seen-update", version),
  openReleaseNotes: (version) => ipcRenderer.invoke("desktop:release-notes", version),
  onUpdateState(listener) {
    const handler = (_event: unknown, state: UpdateState) => listener(state);
    ipcRenderer.on("desktop:update-state", handler);
    return () => { ipcRenderer.removeListener("desktop:update-state", handler); };
  },
  onRestartCheck(check) {
    restartCheck = check;
    return () => { if (restartCheck === check) restartCheck = null; };
  },
};

contextBridge.exposeInMainWorld("litzioDesktop", bridge);
