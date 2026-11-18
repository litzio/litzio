// Local daemon observation remains usable after remote registration UI is removed.
async (page, { expect, screenshots, brand, openPath, assistantFixture }) => {
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
      daemonInfo:async()=>({state:'running',url:location.origin,launcher:'desktop',productVersion:version,protocolVersion:'1',pid:1,startedAt:'2026-11-18T00:00:00Z',daemonHome:'daemon-home',executable:'litzio',roots:[],nonLoopback:false}),cliIntegration:async()=>({status:'off'}),
      onUpdateState:()=>()=>{},onRestartCheck:()=>()=>{}};
  },{version:health.productVersion,prefix:brand.storagePrefix});
  await page.reload();
  const status=page.locator('.sidebar-host-account .host-status');
  await expect(status).toHaveText('Connecting');release();
  await expect(status).toHaveText('Connected');
  await page.setViewportSize({width:1440,height:1000});
  // The status dot shares the footer icon column, and the account row opens no hover surface over Settings.
  const account=page.locator('.sidebar-host-account');
  const footerColumn=()=>page.locator('.sidebar-footer').evaluate(footer=>{
    const center=node=>{const box=node.getBoundingClientRect();return box.left+box.width/2;};
    const icons=[...footer.querySelectorAll(':scope > button > svg, [data-open-settings] svg')].map(center);
    return {icons,dot:center(footer.querySelector('.sidebar-host-account [data-status-indicator]'))};
  });
  const expectAligned=async()=>{const {icons,dot}=await footerColumn();expect(icons.length).toBeGreaterThan(0);for(const icon of icons) expect(Math.abs(icon-dot)).toBeLessThanOrEqual(1);};
  await expect(account).toHaveAccessibleName('Background service · Run as: Fixture account');
  await expectAligned();
  await account.hover();await page.waitForTimeout(300);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(account).not.toHaveAttribute('title');
  await page.getByRole('button',{name:'Collapse Explorer'}).click();
  await expectAligned();
  await page.getByRole('button',{name:'Expand Explorer'}).click();
  await page.mouse.move(720,500);
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.accent='plum';},theme);
    await expect(status).toHaveCSS('color',theme==='light'?'rgb(20, 115, 75)':'rgb(112, 212, 165)');
    if(screenshots) await page.screenshot({path:`tmp/status-host-${theme}.png`,mask:[page.locator('.sidebar-folder-header'),page.locator('.document-location')]});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  online=false;await expect(status).toHaveText('Unreachable',{timeout:12000});
  online=true;await expect(status).toHaveText('Connected',{timeout:12000});
  await expect(page.getByLabel('Host',{exact:true})).toHaveCount(0);
  const capture=async name=>{if(screenshots){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`docs/design/assets/single-host-connection/after-${name}.png`,mask:[page.locator('.document-location'),page.locator('.sidebar-folder-header')]});}};
  await capture('explorer');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByTestId('settings-dialog').getByRole('button',{name:'Hosts',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Appearance & language',exact:true})).toBeVisible();
  await capture('settings');
  // The account row's former hover explanation lives with the background service facts.
  await page.getByTestId('settings-dialog').getByRole('button',{name:'About & updates',exact:true}).click();
  const runAs=page.getByTestId('settings-dialog').locator('dl').filter({has:page.getByText('Run as',{exact:true})});
  await expect(runAs).toContainText('Fixture account');
  await expect(runAs).toContainText("This Host performs file operations and assistant execution with this account's permissions.");
  await page.getByRole('button',{name:'Close Settings',exact:true}).click();
  await page.route('**/api/assistant/settings',route=>route.fulfill({json:{provider:'codex',model:'fixture',reasoningEffort:'low',permissionMode:'opened-folders'}}));
  await page.route('**/api/assistant/models*',route=>route.fulfill({json:{provider:'codex',models:[{id:'fixture',model:'fixture',displayName:'Fixture model',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'}]}}));
  await page.route('**/api/assistant/diagnostics*',route=>route.fulfill({json:{connected:true,account:'Fixture'}}));
  await page.getByRole('button',{name:'Assistant',exact:true}).click();
  await expect(page.locator('.assistant-panel')).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Select Host',exact:true})).toHaveCount(0);
  await capture('assistant');

  // An Explorer action on a same-path document must retain its open session's connection.
  await page.getByRole('button',{name:'Close assistant',exact:true}).click();
  await openPath(page, assistantFixture.document);
  const originalTab = await page.locator('[data-document-tab][data-active=true]').getAttribute('data-document-tab');
  const replacement = 'http://replacement.invalid';
  let replacementWrites = 0;
  await page.route(replacement+'/**',async route=>{
    const req=route.request(),suffix=req.url().slice(replacement.length);
    const cors={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    if(req.method()!=='GET') {replacementWrites++;return route.fulfill({status:409,headers:cors,json:{error:'Replacement write refused by fixture'}});}
    const response=await route.fetch({url:origin+suffix,headers:{...req.headers(),Connection:'close'}});
    await route.fulfill({response,headers:{...response.headers(),...cors}});
  });
  await page.evaluate(async url=>(await import('/src/host-client.ts')).setDesktopHost(url),replacement);
  const row=page.getByRole('treeitem',{name:'document.md',exact:true});
  await row.click({button:'right'});
  await page.getByRole('menuitem',{name:'Rename…',exact:true}).click();
  const rename=page.getByRole('dialog');
  await rename.getByRole('textbox').fill('must-not-rename');
  await rename.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(rename.getByRole('alert')).toContainText('connection changed');
  expect(replacementWrites).toBe(0);
  await expect(page.locator(`[data-document-tab="${originalTab}"]`)).toHaveCount(1);
  await rename.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.evaluate(async url=>(await import('/src/host-client.ts')).setDesktopHost(url),origin);
}
