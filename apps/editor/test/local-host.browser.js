// Local daemon observation remains usable after remote registration UI is removed.
async (page, { expect, screenshots, brand }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const health = await page.evaluate(async()=>({protocolVersion:(await import('/shared/daemon-version.ts')).DAEMON_PROTOCOL,productVersion:'test'}));
  await page.route('**/daemon/health',route=>route.fulfill({json:health}));
  let online = true, release;
  const initial = new Promise(resolve => { release = resolve; });
  await page.route('**/api/host-capabilities', async route => {
    await initial;
    return route.fulfill(online ? {json:{fileDeletion:'trash',identity:{runAs:'Fixture account'}}} : {status:503,json:{error:'Local Host unavailable'}});
  });
  await page.addInitScript(({version,prefix}) => {
    localStorage.setItem(prefix+'.theme','light');localStorage.setItem(prefix+'.uiLanguage','en');
    const connection=()=>Promise.resolve({url:location.origin,productVersion:version,desktopVersion:version});
    window.litzioDesktop={hostConnection:connection,reconnectDaemon:connection,startup:async()=>({}),
      setTheme:async()=>true,setWindowBackground:async()=>{},reportPendingWork:()=>{},info:async()=>({version,channel:'beta',updatesSupported:false,update:{phase:'idle'},seenUpdate:null}),
      onUpdateState:()=>()=>{},onRestartCheck:()=>()=>{}};
  },{version:health.productVersion,prefix:brand.storagePrefix});
  await page.reload();
  const status=page.locator('.sidebar-host-account .host-status');
  await expect(status).toHaveText('Connecting');release();
  await expect(status).toHaveText('Connected');
  online=false;await expect(status).toHaveText('Unreachable',{timeout:12000});
  online=true;await expect(status).toHaveText('Connected',{timeout:12000});
  await expect(page.getByLabel('Host',{exact:true})).toHaveCount(0);
  const capture=async name=>{if(screenshots){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`docs/design/assets/remote-host-removal/after-${name}.png`,mask:[page.locator('.sidebar-host-account'),page.locator('.document-location'),page.locator('.sidebar-folder-header')]});}};
  await capture('explorer');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByTestId('settings-dialog').getByRole('button',{name:'Hosts',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Appearance & language',exact:true})).toBeVisible();
  await capture('settings');
  await page.getByRole('button',{name:'Close Settings',exact:true}).click();
  await page.route('**/api/assistant/settings',route=>route.fulfill({json:{provider:'codex',model:'fixture',reasoningEffort:'low',permissionMode:'opened-folders'}}));
  await page.route('**/api/assistant/models*',route=>route.fulfill({json:{provider:'codex',models:[{id:'fixture',model:'fixture',displayName:'Fixture model',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'}]}}));
  await page.route('**/api/assistant/diagnostics*',route=>route.fulfill({json:{connected:true,account:'Fixture'}}));
  await page.getByRole('button',{name:'Assistant',exact:true}).click();
  await expect(page.locator('.assistant-panel')).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Select Host',exact:true})).toHaveCount(0);
  await capture('assistant');
}
