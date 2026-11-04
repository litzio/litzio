// The Desktop app's Editor UI with a stand-in for its bridge: Settings → About, the release channel,
// update notifications and the restart check the Desktop app asks before installing. The browser
// Editor without the bridge shows common recovery Settings only. Updater behavior itself is tested in apps/desktop.
// pnpm browser:test desktop-updates
async (page, { screenshots = false, fullLayout = true, openPath, brand, showNotifications }) => {
  page.setDefaultTimeout(15000);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  check(await page.getByRole('button', {name:'Settings', exact:true}).count() === 1, 'Common recovery Settings is missing');
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  check(await page.getByRole('button',{name:'About & updates',exact:true}).count() === 0, 'Browser exposes Desktop-only category');
  check(await page.getByTestId('cli-integration').count() === 0, 'Browser exposes Desktop CLI integration');
  check(await page.getByRole('button',{name:'Open log folder',exact:true}).count() === 0, 'Browser exposes Desktop logs');
  await page.getByRole('button',{name:'Saving & recovery',exact:true}).click();
  check(await page.getByRole('heading',{name:'Local recovery',exact:true}).isVisible() && !await page.getByTestId('app-version').count(), 'Browser settings mixed recovery with Desktop-only information');
  await page.keyboard.press('Escape');
  const capture = async name => {
    if (!screenshots) return;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    });
    await page.screenshot({path:`tmp/desktop-visual/${name}.png`});
  };
  if (screenshots) await page.setViewportSize({width:1440, height:1000});
  await capture('browser-before');

  await page.addInitScript(() => {
    const listeners = new Set();
    let restartCheck = null;
    const info = {version:'0.2.0', channel:sessionStorage.getItem('update-channel') || 'stable', updatesSupported:true, update:{phase:'idle'}, seenUpdate:sessionStorage.getItem('update-seen')};
    const calls = JSON.parse(sessionStorage.getItem('update-calls') || '[]');
    window.__desktop = {connected:true, calls, info, push(state) { info.update = state; for (const listener of listeners) listener(state); }};
    window.__cli = {state:{status:'off'}, calls:[], pending:false, fail:false};
    window.litzioDesktop = {
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
  await page.unrouteAll();
  await page.reload();
  await ready();
  // Shared production controls; only the native boundary is a bridge stand-in.
  await page.getByRole('button', {name:'Desktop menu',exact:true}).click();
  await page.getByRole('menuitem', {name:'Open in browser',exact:true}).click();
  check(await page.evaluate(() => window.__desktop.calls.some(call => call[0] === 'browser')), 'Browser menu did not call the Desktop opener');
  for (const width of screenshots ? [1440,640] : [640]) {
    await page.setViewportSize({width,height:1000});
    await page.getByRole('button', {name:'Desktop menu',exact:true}).click();
    await capture(`daemon-menu-${width}`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name:'Settings',exact:true}).click();
    await page.getByRole('button', {name:'About & updates',exact:true}).click();
    await page.getByText('running · CLI (start) · 0.2.0', {exact:true}).waitFor();
    check(await page.getByText('http://127.0.0.1:25887', {exact:true}).isVisible(), 'Daemon address missing');
    await capture(`daemon-status-${width}`);
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  }
  await page.getByRole('button', {name:'Desktop menu',exact:true}).click();
  await page.getByRole('menuitem', {name:'Stop daemon',exact:true}).click();
  await page.getByTestId('daemon-disconnected').waitFor();
  if (screenshots) { await page.setViewportSize({width:1440,height:1000}); await capture('daemon-disconnected-1440'); await page.setViewportSize({width:640,height:1000}); }
  await capture('daemon-disconnected-640');
  const raw = "Error invoking remote method 'desktop:host-connection': Error: Recorded daemon (pid 1234) is not responding or incompatible: fetch failed";
  await page.evaluate(raw => { window.__desktop.failure = raw; }, raw);
  await page.getByRole('button', {name:'Reconnect',exact:true}).click();
  const connectionNotice = page.getByTestId('daemon-disconnected');
  await connectionNotice.getByText('The local daemon is not responding or is incompatible.', {exact:true}).waitFor();
  check(!await connectionNotice.getByText(`Error: ${raw}`, {exact:true}).isVisible(), 'IPC diagnostic is always visible');
  await connectionNotice.getByText('Details', {exact:true}).click();
  await connectionNotice.getByText(`Error: ${raw}`, {exact:true}).waitFor();
  await connectionNotice.getByText('Details', {exact:true}).click();

  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:1000});
    await capture(`messages-en-${width}`);
  }
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  await page.getByTestId('theme').selectOption('dark');
  await page.getByTestId('ui-language').selectOption('ko');
  await page.keyboard.press('Escape');
  await showNotifications(page);
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:1000});
    await capture(`messages-ko-dark-${width}`);
  }
}
