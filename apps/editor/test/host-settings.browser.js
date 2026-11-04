// Real settings and client runtime; native persistence/dialogs are bridge fixtures.
async (page, { expect, screenshots }) => {
  await page.addInitScript(() => {
    const hosts = JSON.parse(sessionStorage.getItem("host-fixture") || "[]");
    const applied = hosts.map(host => host.hostId);
    const listeners = new Set();
    let restartCheck = null;
    const info = {version:'0.2.0', channel:sessionStorage.getItem('update-channel') || 'stable', updatesSupported:true, update:{phase:'idle'}, seenUpdate:sessionStorage.getItem('update-seen')};
    const calls = JSON.parse(sessionStorage.getItem('update-calls') || '[]');
    window.__desktop = {connected:true, calls, info, push(state) { info.update = state; for (const listener of listeners) listener(state); }};
    window.__cli = {state:{status:'off'}, calls:[], pending:false, fail:false};
    window.litzioDesktop = {
      registeredHosts: async () => ({ hosts, allowedHostIds: applied, productVersion: "0.2.0" }),
      registerHost: async (origin, label) => {
        hosts.push({ hostId: "remote-fixture", origin, label });
        sessionStorage.setItem("host-fixture", JSON.stringify(hosts));
      },
      renameHost: async (id, label) => { hosts.find(host => host.hostId === id).label = label; sessionStorage.setItem("host-fixture", JSON.stringify(hosts)); },
      removeHost: async id => { hosts.splice(hosts.findIndex(host => host.hostId === id), 1); sessionStorage.setItem("host-fixture", JSON.stringify(hosts)); },
      restartForHosts: async () => { const result = restartCheck(); window.__restartResult = result; return result; },
      reportHostWork: async () => {},
      hostConnection: async () => ({url: location.origin, productVersion: info.version, desktopVersion: info.version}),
      daemonInfo: async () => ({state: window.__desktop.connected ? 'running' : 'unreachable', url:'http://127.0.0.1:25887', launcher:'cli-start', productVersion:'0.2.0', protocolVersion:'1', pid:1234, startedAt:'2026-11-04T00:00:00Z', daemonHome:'C:/temporary/daemon/beta', executable:'C:/Litzio/Litzio.exe', roots:[], nonLoopback:false}),
      checkDaemon: async () => { if (!window.__desktop.connected) throw Error('Disconnected'); },
      reconnectDaemon: async () => { calls.push(['reconnect']); if (window.__desktop.failure) throw Error(window.__desktop.failure); window.__desktop.connected = true; return {url:location.origin, productVersion:info.version, desktopVersion:info.version}; },
      stopDaemon: async () => { calls.push(['daemon-stop']); window.__desktop.connected = false; return true; },
      openInBrowser: async () => { calls.push(['browser']); },
      setTheme: async theme => theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches),
      setWindowBackground: async (color, overlay) => { window.__desktop.appearance = { color, overlay }; },
      info: async () => ({...info}),
      cliIntegration: async () => ({...window.__cli.state}),
      setCliIntegration: async enabled => {
        const cli = window.__cli;
        cli.calls.push(enabled);
        if (cli.pending) await new Promise(resolve => cli.finish = resolve);
        if (cli.fail) { cli.state = {status:'broken'}; throw Error('Injected CLI registration failure'); }
        return cli.state = {status:enabled ? 'installed' : 'off'};
      },
      setChannel: async (channel) => { calls.push(['channel', channel]); info.channel = channel; return {...info}; },
      checkForUpdates: async () => { calls.push(['check']); },
      downloadUpdate: async () => { calls.push(['download']); },
      // The Desktop app asks the Editor's registered check before it restarts.
      installUpdate: async () => {
        const answer = restartCheck ? restartCheck() : {ok:false, reason:'no restart check'};
        calls.push(['install', answer]);
        return answer;
      },
      markUpdateSeen: async (version) => { calls.push(['seen', version]); info.seenUpdate = version; },
      openReleaseNotes: async (version) => { calls.push(['notes', version ?? null]); },
      openLogFolder: async (...args) => {
        calls.push(['logs', ...args]);
        await new Promise(resolve => window.__desktop.finishLogs = resolve);
        if (window.__desktop.failLogs) throw Error('OS failed');
      },
      onUpdateState(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      onRestartCheck(check) { restartCheck = check; return () => { if (restartCheck === check) restartCheck = null; }; },
    };
  });

  let healthMode = "connected";
  let resumeHealth;
  await page.route("**/daemon/health", async route => {
    if (healthMode === "connecting") await new Promise(resolve => { resumeHealth = resolve; });
    await route.fulfill({ json: healthMode === "unreachable" ? { protocolVersion: "4" } : {
      protocolVersion: healthMode === "protocol" ? "incompatible" : "4",
      productVersion: healthMode === "version" ? "0.1.0" : "0.2.0",
    } });
  });
  await page.reload();
  const settings = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Hosts", exact: true }).click();
  };
  await settings();
  await page.getByLabel("Host address", { exact: true }).fill(await page.evaluate(() => location.origin));
  await page.getByLabel("Host label", { exact: true }).fill("Test remote Host");
  await page.getByRole("button", { name: "Register Host", exact: true }).click();
  await expect(page.getByTestId("host-settings").getByText("Restart required", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Restart to apply Hosts", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__restartResult?.ok)).toBe(true);
  await page.reload();
  await settings();
  await expect(page.getByTestId("host-settings").getByText("Connected", { exact: true })).toBeVisible();
  const row = page.locator("section").filter({ has: page.getByRole("heading", { name: "Test remote Host" }) });
  await row.getByLabel("Host label", { exact: true }).fill("Renamed remote");
  await row.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Renamed remote" })).toBeVisible();
  for (const [mode, text] of [["protocol", "Protocol mismatch"], ["version", "Version warning"], ["unreachable", "Unreachable"]]) {
    healthMode = mode;
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(page.getByTestId("host-settings").getByText(text, { exact: true })).toBeVisible();
  }
  healthMode = "connecting";
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByTestId("host-settings").getByText("Connecting", { exact: true })).toBeVisible();
  await expect.poll(() => !!resumeHealth).toBe(true);
  healthMode = "connected"; resumeHealth();
  await expect(page.getByTestId("host-settings").getByText("Connected", { exact: true })).toBeVisible();
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeInViewport();
    const buttons = await page.locator(".host-actions button").evaluateAll(buttons => buttons.map(button => { const box = button.getBoundingClientRect(); return { y: box.y, height: box.height }; }));
    expect(new Set(buttons.map(button => button.y)).size).toBe(1);
    expect(new Set(buttons.map(button => button.height)).size).toBe(1);
    await page.mouse.move(0, 0);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await expect(page.locator('[data-slot="tooltip-content"]')).toBeHidden();
    if (screenshots) await page.screenshot({ path: `tmp/host-settings-${width}.png` });
  }
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByTestId("host-settings").getByText("No remote Hosts registered.", { exact: true })).toBeVisible();
}
