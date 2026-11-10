async (page, { brand, expect, screenshots, recoveryRecords, showNotifications }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document', { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).concat('tmp', 'multi-host').join(sep);
  const path = root + sep + 'same.txt';
  const empty = await (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(root + sep + 'empty.md'), { headers: { Connection: "close" } })).json();
  const nativePath = initial.path.split(sep).slice(0, -4).concat('tmp', 'document-tabs', 'technical-1.md').join(sep);
  const native = await (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(nativePath), { headers: { Connection: "close" } })).json();
  let showNative = false;
  const hanging = root + sep + "hanging.txt";
  let hangReads = 0;
  const heldReads = [];
  const mutationPaths = ['rename-pending.txt', 'delete-pending.txt'].map(name => root + sep + name);
  const mutationReads = [], mutations = [];
  const removed = { local: new Set(), remote: new Set() };
  const comparisonHosts = [], previewHosts = [], assetRequests = [];
  await page.route('**/fixture/remote/document/**', route => {
    assetRequests.push(route.request().url());
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="navy"/></svg>' });
  });
  const missing = root + sep + 'missing.txt', fresh = root + sep + 'fresh.txt';
  let failRemembered = false, failedReads = 0, showFresh = false;
  let delayStartup = false, releaseStartup, freshReads = 0;
  const sources = { local: 'Local text', remote: 'Remote text' };
  const saves = [];
  const created = { local: new Map(), remote: new Map() };
  const creations = [];
  const versions = { local: 0, remote: 0 };
  const revision = host => (host === "local" ? "a" : "b").repeat(60) + String(versions[host]).padStart(4, "0");
  await page.route('**/api/document**', async route => {
    const url = route.request().url();
    const host = url.includes('/fixture/remote/') ? 'remote' : 'local';
    if (url.includes('/api/document-compare')) {
      comparisonHosts.push(host);
      return route.fulfill({ response: await route.fetch({ headers: { ...route.request().headers(), Connection: "close" }, url: origin + '/api/document-compare' }) });
    }
    if (url.includes('/api/document-source') && route.request().postDataJSON()?.path === nativePath) {
      previewHosts.push(host);
      return route.fulfill({ response: await route.fetch({ headers: { ...route.request().headers(), Connection: "close" }, url: origin + '/api/document-source?recovery=1' }) });
    }
    if (route.request().method() === 'PUT') {
      const { path: target } = route.request().postDataJSON();
      creations.push({ host, path: target, kind: 'document' });
      created[host].set(target, 'document');
      return route.fulfill({ json: { ...empty, path: target } });
    }
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); if (body.revision !== revision(host)) throw new Error("Save used another Host’s revision"); sources[host] = body.source; versions[host]++; saves.push(host); return route.fulfill({ json: { revision: revision(host) } }); }
    if (!url.includes('?path=')) return route.fulfill({ json: { start: true } });
    const requestedPath = decodeURIComponent(url.split('?path=')[1].split('&')[0]);
    if (mutationPaths.includes(requestedPath)) {
      await new Promise(resolve => { mutationReads.push({ host, path: requestedPath, release: async () => {
        try { await route.fulfill({ json: { kind: 'text', path: requestedPath, source: host, revision: revision(host) } }); } catch {}
        resolve();
      } }); });
      return;
    }
    if (host === 'remote' && requestedPath === hanging) {
      hangReads++;
      await new Promise(resolve => { heldReads.push(async () => { try { await route.fulfill({ json: { kind: 'text', path: hanging, source: 'Late remote response', revision: revision(host) } }); } catch {} resolve(); }); });
      return;
    }
    if (requestedPath === nativePath) return route.fulfill({ json: native });
    if (created[host].get(requestedPath) === 'document') return route.fulfill({ json: { ...empty, path: requestedPath } });
    if (host === 'remote' && requestedPath === missing && failRemembered) { failedReads++; return route.fulfill({ status: 503, json: { error: 'Fixture startup read failure' } }); }
    if (host === 'remote' && requestedPath === fresh) freshReads++;
    const json = { kind: 'text', path: requestedPath, source: sources[host], revision: revision(host) };
    if (host === 'remote' && requestedPath === path && delayStartup) {
      delayStartup = false;
      await new Promise(resolve => { releaseStartup = async () => { await route.fulfill({ json }); resolve(); }; });
      return;
    }
    return route.fulfill({ json });
  });
  let offlineCatalogReads=0;
  await page.route('**/fixture/off/api/views',route=>{offlineCatalogReads++;return route.fulfill({status:503,json:{error:'Offline Host'}});});
  await page.route('**/api/views',route=>{
    const host=route.request().url().includes('/fixture/remote/')?'remote':'local';
    if(route.request().url().includes('/fixture/off/'))return route.fallback();
    const {action}=route.request().postDataJSON();expect(['catalog','list']).toContain(action);
    const definition={kind:'litzio-view',schemaVersion:2,catalog:'litzio-v2',profile:'query',owner:'fixture.screen',title:'예시: Host screen',refresh:'manual',sources:{stats:{kind:'operation',operation:'fixture.screen.read',version:1,args:{}}},layout:{component:'Panel',direction:'vertical',children:[{component:'Table',title:'예시: Rows',source:'stats',data:'/rows',columns:['label']}]}};
    return route.fulfill({json:{catalog:{operations:[{plugin:'fixture.screen',operation:'fixture.screen.read',version:1,inputSchema:{type:'object',properties:{},additionalProperties:false},rowSchema:{label:{type:'string',label:'Label'}}}]},views:[{plugin:'fixture.screen',id:'summary',title:'예시: Host screen',definition}],screens:[{plugin:'fixture.screen',id:'summary',title:'예시: Host screen',icon:'Table',defaultViewIds:['summary'],primary:true}],favourites:[],receipt:{operation:`view.${action}`,outcome:'success'}}});
  });
  await page.route('**/api/file', route => {
    const host = route.request().url().includes('/fixture/remote/') ? 'remote' : 'local';
    const body = route.request().postDataJSON();
    if (!mutationPaths.includes(body.path)) return route.fallback();
    removed[host].add(body.path);
    mutations.push({ host, path: body.path, method: route.request().method() });
    return route.fulfill({ json: { path: route.request().method() === 'PATCH' ? root + sep + body.name + '.txt' : body.path } });
  });
  await page.route('**/api/folder?**', route => {
    const url = route.request().url();
    const host = url.includes('/fixture/remote/') ? 'remote' : 'local';
    const directory = decodeURIComponent(url.match(/[?&]path=([^&]*)/)?.[1] ?? '') || root;
    const entries = [...created[host]].filter(([target]) => target.slice(0, target.lastIndexOf(sep)) === directory)
      .map(([target, kind]) => ({ path: target, name: target.split(sep).at(-1), kind, native: kind === 'document' }));
    return route.fulfill({ json: { root, path: directory, entries: [...(directory === root ? [{ path, name: 'same.txt', kind: 'document', native: false }, ...mutationPaths.filter(target => !removed[host].has(target)).map(target => ({ path: target, name: target.split(sep).at(-1), kind: 'document', native: false })), ...(host === 'local' ? [{ path: root + sep + 'responsive.txt', name: 'responsive.txt', kind: 'document', native: false }] : []), ...(host === 'remote' ? [{ path: hanging, name: 'hanging.txt', kind: 'document', native: false }] : []), ...(showNative ? [{ path: nativePath, name: 'technical-1.md', kind: 'document', native: true }] : []), ...(showFresh ? [{ path: fresh, name: 'fresh.txt', kind: 'document', native: false }] : [])] : []), ...entries] } });
  });
  await page.route('**/api/folder', route => {
    const host = route.request().url().includes('/fixture/remote/') ? 'remote' : 'local';
    const { parent, name } = route.request().postDataJSON();
    if (name === 'conflict') return route.fulfill({ status: 409, json: { error: 'Fixture folder conflict' } });
    if (name === 'disconnected') return route.fulfill({ status: 503, json: { error: 'Fixture folder unavailable' } });
    const target = parent + sep + name;
    creations.push({ host, path: target, kind: 'folder' });
    created[host].set(target, 'folder');
    return route.fulfill({ json: { path: target } });
  });
  await page.route('**/fixture/remote/api/folder-browse?**', route => {
    const directory = decodeURIComponent(route.request().url().split('?path=')[1]).replace(/[\\/]+$/, '');
    return route.fulfill({ json: { path: directory, crumbs: [{ path: root, name: 'multi-host' }, ...(directory === root ? [] : [{ path: directory, name: directory.split(sep).at(-1) }])], entries: [...created.remote].filter(([target]) => target.slice(0, target.lastIndexOf(sep)) === directory).map(([target, kind]) => ({ path: target, name: target.split(sep).at(-1), kind })) } });
  });
  await page.route('**/fixture/remote/api/folder-places', route => route.fulfill({ json: { places: [{ kind: 'home', name: 'Fixture home', path: root }] } }));
  await page.route('**/api/folder-version?**', route => route.fulfill({ json: { version: '1', revisions: [] } }));
  await page.route('**/fixture/remote/api/reviews',route=>{
    const body=route.request().postDataJSON();
    if(body.action!=="workspace-find"||body.root!==root)throw new Error("Unexpected remote review operation");
    return route.fulfill({json:{providers:[]}});
  });
  let remoteAvailable = true;
  await page.route('**/api/host-capabilities', route => route.fulfill({ json: { fileDeletion: 'trash', identity: { runAs: 'WORKSTATION\\local-user' } } }));
  await page.route('**/fixture/remote/api/host-capabilities', route => route.fulfill(remoteAvailable ? { json: { fileDeletion: 'trash', identity: { runAs: 'remote-user' } } } : { status: 503, json: { error: 'Fixture unreachable' } }));
  await page.route('**/fixture/off/api/host-capabilities', route => route.fulfill({ status: 503, json: { error: 'Unreachable' } }));
  await page.evaluate(({ path, root }) => {
    for (const host of ['local', 'remote']) { localStorage.setItem(JSON.stringify([host, 'litzio.openTabs']), JSON.stringify({ paths: [], activePath: null })); localStorage.setItem(JSON.stringify([host, 'litzio.openFolders']), JSON.stringify([root])); }
  }, { path, root });
  await page.addInitScript(() => {
    window.__explorerCalls = [];
    window.litzioDesktop = {
      registeredHosts: async () => ({ hosts: [], allowedHostIds: [], productVersion: 'test' }),
      reportPendingWork: () => {}, reportHostWork: async () => {},
      hostConnection: async () => ({ url: location.origin, productVersion: 'test', desktopVersion: 'test' }),
      checkDaemon: async () => {}, setTheme: async () => false, setWindowBackground: async () => {},
      info: async () => ({ version: '0.0.2', channel: 'beta', updatesSupported: false, update: { phase: 'idle' }, postponed: null }),
      onUpdateState: () => () => {}, onRestartCheck: () => () => {}, setOpenedFolders: async () => {},
      openFolderInExplorer: async path => { window.__explorerCalls.push(path); },
    };
  });
  await page.goto(origin + '/host-fixture');
  await page.locator('[data-host-id="local"]').getByRole('treeitem', { name: /same.txt/ }).click();
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /same.txt/ }).click();
  const local = page.getByRole('tab', { name: /same.txt.*Local/ });
  const remote = page.getByRole('tab', { name: /same.txt.*Remote/ });
  await expect(local).toHaveCount(1); await expect(remote).toHaveCount(1);
  const off = page.locator('[data-host-id="off"]');
  await expect(off).toContainText('Unreachable');
  await page.getByLabel('Host', { exact: true }).selectOption('remote');
  await expect(page.locator('[data-host-id="remote"]')).toBeVisible();
  await remote.click();
  await expect(page.locator(".sidebar-host-account")).toContainText("Remote · remote-user");
  if (screenshots) { for (const width of [1440, 640]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: `tmp/1199-run-as-${width}.png` }); } await page.setViewportSize({ width: 1440, height: 1000 }); }
  await expect(page.getByTestId("current-host")).toHaveText("Remote");
  await page.getByRole('textbox', { name: 'Text editor' }).fill('Remote saved');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves.join()).toBe('remote');
  await local.click();
  await expect(page.locator('.sidebar-host-account')).toContainText('Local · WORKSTATION\\local-user');
  await page.setViewportSize({ width: 640, height: 900 });
  const accountRow = page.locator('.sidebar-host-account');
  const accountText = accountRow.locator('.sidebar-tree-name');
  await expect(accountText).toHaveCSS('text-overflow', 'ellipsis');
  const rowBox = await accountRow.boundingBox(), settingsBox = await page.locator('.sidebar-preferences').boundingBox();
  expect(settingsBox.y + settingsBox.height).toBeLessThanOrEqual(rowBox.y);
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(640);
  await accountRow.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(accountRow).toBeFocused();
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText("Local · Run as: WORKSTATION\\local-user");
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText("This Host performs file operations and assistant execution with this account's permissions.");
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-slot="tooltip-content"]')).toBeHidden();
  if (screenshots) await page.screenshot({ path: 'tmp/1199-run-as-local-640.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await expect(page.getByTestId('current-host')).toHaveText('Local');
  await page.getByRole('textbox', { name: 'Text editor' }).fill('Local saved');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves.join()).toBe('remote,local');
  await page.getByLabel('Host', { exact: true }).selectOption('');
  await local.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open to the right', exact: true }).click();
  await remote.click();
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /hanging.txt/ }).click();
  await expect.poll(() => hangReads).toBe(1);
  // A different group's local tab, Open and Save remain usable while the remote read is pending.
  await local.click();
  const localInput = page.locator('#' + await local.getAttribute('aria-controls')).getByRole('textbox', { name: 'Text editor' });
  await localInput.fill('Local during remote hang');
  await page.keyboard.press('Control+s');
  await expect.poll(() => sources.local).toBe('Local during remote hang');
  await page.locator('[data-host-id="local"]').getByRole('treeitem', { name: /responsive.txt/ }).click();
  const responsive = page.getByRole('tab', { name: /responsive.txt/ });
  await expect(responsive).toHaveCount(1);
  await page.locator('.document-tab').filter({ has: responsive }).locator('.document-tab-close').click();
  await local.click();
  await showNotifications(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await heldReads.shift()();
  // Rename/delete must invalidate the old read, without cancelling another Host at that path.
  for (const [index, target] of mutationPaths.entries()) {
    const name = target.split(sep).at(-1);
    await remote.click();
    await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name, exact: true }).click();
    await expect.poll(() => mutationReads.filter(read => read.path === target && read.host === 'remote').length).toBe(1);
    await local.click();
    await page.locator('[data-host-id="local"]').getByRole('treeitem', { name, exact: true }).click();
    await expect.poll(() => mutationReads.filter(read => read.path === target && read.host === 'local').length).toBe(1);
    await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name, exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: index === 0 ? 'Rename…' : 'Delete file…', exact: true }).click();
    if (index === 0) {
      await page.getByRole('textbox', { name: 'File name', exact: true }).fill('renamed-pending');
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
    } else await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mutations.at(-1)).toEqual({ host: 'remote', path: target, method: index === 0 ? 'PATCH' : 'DELETE' });
    await mutationReads.find(read => read.path === target && read.host === 'remote').release();
    await mutationReads.find(read => read.path === target && read.host === 'local').release();
    const localResult = page.getByRole('tab', { name: new RegExp(name + '.*Local') });
    await expect(localResult).toHaveCount(1);
    await expect(page.getByRole('tab', { name: new RegExp(name + '.*Remote') })).toHaveCount(0);
    await page.locator('.document-tab').filter({ has: localResult }).locator('.document-tab-close').click();
    await local.click();
  }
  await local.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to other group', exact: true }).click();
  await expect(page.getByRole('tab', { name: /hanging.txt/ })).toHaveCount(0);
  // Without navigation, the same read is bounded by the production timeout.
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /hanging.txt/ }).click();
  await expect.poll(() => hangReads).toBe(2);
  await showNotifications(page);
  await expect(page.getByTestId('error')).toBeVisible({ timeout: 20000 });
  await heldReads.shift()();
  await expect(page.getByRole('tab', { name: /hanging.txt/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /hanging.txt/ }).click();
  await expect.poll(() => hangReads).toBe(3);
  await page.locator('.document-tab').filter({ has: local }).locator('.document-tab-close').click();
  await expect(local).toHaveCount(0);
  await heldReads.shift()();
  await expect(page.getByRole('tab', { name: /hanging.txt/ })).toHaveCount(0);
  await page.locator('[data-host-id="local"]').getByRole('treeitem', { name: /same.txt/ }).click();
  await expect(local).toHaveAttribute('aria-selected', 'true');
  // Reopening creates a new panel; bind after activation rather than retaining the previous editor.
  const reopenedLocalInput = page.locator('#' + await local.getAttribute('aria-controls')).getByRole('textbox', { name: 'Text editor' });
  await reopenedLocalInput.fill('Local saved');
  await page.keyboard.press('Control+s');
  await expect.poll(() => sources.local).toBe('Local saved');
  await page.reload();
  await expect(local).toHaveCount(1); await expect(remote).toHaveCount(1);
  await remote.click(); await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveValue('Remote saved');
  await page.locator('[data-host-id="local"] [data-folder-menu]').click();
  await expect(page.getByRole('menuitem', { name: 'Open in File Explorer', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Open in File Explorer', exact: true })).toHaveCount(0);
  await page.locator('[data-host-id="remote"] [data-folder-menu]').click();
  await expect(page.getByRole('menuitem', { name: 'Open in File Explorer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Refresh', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Refresh', exact: true })).toHaveCount(0);
  let deleteAttempts = 0;
  await page.route('**/fixture/remote/api/file', route => { deleteAttempts++; return route.fulfill({ status: 500, json: { error: 'Fixture trash failure' } }); });
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /same.txt/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete file…', exact: true }).click();
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture trash failure');
  if (deleteAttempts !== 1) throw new Error('Remote trash failure was retried');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(remote).toHaveCount(1); await expect(local).toHaveCount(1);
  await remote.click();
  await page.getByRole('textbox', { name: 'Text editor' }).fill('Remote unsaved recovery');
  await expect.poll(async () => (await recoveryRecords(page)).some(record => record.hostId === 'remote' && record.recoveryText.includes('Remote unsaved recovery'))).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('recovery-prompt')).toContainText('Remote');
  await page.getByRole('button', { name: 'Restore work', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveValue('Remote unsaved recovery');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves.join()).toBe('remote,local,local,local,remote');
  await local.click();
  await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveValue('Local saved');
  if ((await page.evaluate(() => window.__explorerCalls)).length) throw new Error('Remote paths reached the Desktop shell');
  // This fixture starts fresh on each Host, independently of earlier assistant scenarios.
  await page.evaluate(prefix => { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix + '.assistantConversation:')) localStorage.removeItem(key); }, brand.storagePrefix);
  const assistantRequests = [];
  const submissionLookups = [];
  let rejectedSend, rejectionComplete = false, rejectedSends = 0;
  await page.route('**/api/assistant/**', route => {
    const url = route.request().url(); assistantRequests.push(url);
    if (url.includes('/conversations?submissionId=')) {
      submissionLookups.push(url);
      const id = decodeURIComponent(url.split('submissionId=')[1].split('&')[0]);
      return route.fulfill({ json: { submission: { id, status: rejectionComplete ? 'rejected' : 'pending', ...(rejectionComplete ? { error: 'Fixture reference rejected' } : {}) } } });
    }
    if (url.includes('/models')) return route.fulfill({ json: { models: [{ id: 'fixture', model: 'fixture', displayName: 'Fixture model', supportedReasoningEfforts: [{ reasoningEffort: 'low' }], defaultReasoningEffort: 'low' }], provider: 'codex' } });
    if (url.includes('/diagnostics')) return route.fulfill({ json: { connected: true, account: { type: 'apiKey' } } });
    if (url.includes('/settings')) return route.fulfill({ json: { provider: 'codex', permissionMode: 'opened-folders', model: 'fixture', reasoningEffort: 'low' } });
    throw new Error('Unexpected assistant fixture request: ' + route.request().method() + ' ' + url);
  });
  // A consumed local reference must not be replayed when New conversation selects another Host.
  await page.locator('[data-host-id="local"]').getByRole('treeitem', { name: /same.txt/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove reference: same.txt', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Select Host' });
  await expect(chooser).toBeVisible();
  const unavailable = chooser.getByRole('button', { name: /^Offline/ });
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toContainText('Unreachable');
  await unavailable.locator('..').hover();
  await expect(page.getByText('This Host is unreachable. A new conversation cannot be started.', { exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByText('This Host is unreachable. A new conversation cannot be started.', { exact: true })).toHaveCount(0);
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'tmp/pr4-choose-1440.png' }); await page.setViewportSize({ width: 640, height: 900 }); await page.screenshot({ path: 'tmp/pr4-choose-640.png' }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Remote/ }).click();
  await expect(page.locator('.assistant-context')).toContainText('Remote');
  await expect(page.getByRole('button', { name: 'Remove reference: same.txt', exact: true })).toHaveCount(0);
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /same.txt/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove reference: same.txt', exact: true })).toHaveCount(1);
  await expect(page.locator('.assistant-context')).toContainText('Remote');
  await page.getByLabel('Message assistant').fill('Keep this remote draft');
  await page.locator('[data-host-id="local"]').getByRole('treeitem', { name: /same.txt/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await showNotifications(page);
  await expect(page.getByTestId('error')).toContainText('Start a conversation on the file’s Host');
  await expect(page.getByLabel('Message assistant')).toHaveValue('Keep this remote draft');
  await expect(page.getByRole('button', { name: 'Remove reference: same.txt', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  let releaseRejectedSend;
  const rejectedSendGate = new Promise(resolve => { releaseRejectedSend = resolve; });
  const rejectSend = async route => { rejectedSends++; rejectedSend = route.request().postDataJSON(); await rejectedSendGate; rejectionComplete = true; return route.fulfill({ json: { submission: { id: rejectedSend.submissionId, status: 'rejected', error: 'Fixture reference rejected' } } }); };
  await page.route('**/fixture/remote/api/assistant/conversations', rejectSend);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  // Exercise the supported first-POST/status-GET race on every run, without a sleep.
  await expect.poll(() => submissionLookups.length > 0).toBe(true);
  releaseRejectedSend();
  await expect(page.getByTestId('assistant-panel')).toContainText('Fixture reference rejected');
  expect(rejectedSends).toBe(1);
  expect(submissionLookups.every(url => url === origin + '/fixture/remote/api/assistant/conversations?submissionId=' + encodeURIComponent(rejectedSend.submissionId))).toBe(true);
  await page.getByRole('button', { name: 'Restore to input', exact: true }).click();
  expect(rejectedSend.references).toEqual([path]);
  expect(rejectedSend.folders).toEqual([root]);
  expect(rejectedSend.document).toBeUndefined();
  await expect(page.getByLabel('Message assistant')).toHaveValue('Keep this remote draft');
  await expect(page.getByRole('button', { name: 'Remove reference: same.txt', exact: true })).toHaveCount(1);
  await page.unroute('**/fixture/remote/api/assistant/conversations', rejectSend);
  await expect.poll(() => assistantRequests.some(url => url.endsWith('/settings'))).toBe(true);
  await local.click();
  await page.getByLabel('Host', { exact: true }).selectOption('local');
  await expect(page.locator('.assistant-context')).toContainText('Remote');
  if (screenshots) { await page.screenshot({ path: 'tmp/pr4-assistant-1440.png' }); await page.setViewportSize({ width: 640, height: 900 }); await page.screenshot({ path: 'tmp/pr4-assistant-640.png' }); }
  await page.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByLabel('Host', { exact: true }).selectOption('');
  await expect(page.locator('[data-host-id="local"]').getByRole('button', { name: 'Open folder…', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-host-id="remote"]').getByRole('button', { name: 'Open folder…', exact: true })).toHaveCount(0);
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'tmp/pr4-1440.png' }); await page.setViewportSize({ width: 640, height: 900 }); await expect(page.getByTestId('current-host')).toBeVisible(); await page.screenshot({ path: 'tmp/pr4-640.png' }); }
  // Only Local is available: opening Assistant must skip the chooser, even with three registrations.
  remoteAvailable = false;
  await page.reload();
  await expect(page.locator('[data-host-id="remote"]')).toContainText('Unreachable');
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Select Host' })).toHaveCount(0);
  await expect(page.locator('.assistant-context')).toContainText('Local');
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();

  // One failed remembered read preserves the original list until this Host is explicitly navigated.
  await page.setViewportSize({ width: 1440, height: 1000 });
  remoteAvailable = true; failRemembered = true;
  const rememberedRemote = () => page.evaluate(() => JSON.parse(localStorage.getItem(JSON.stringify(['remote', 'litzio.openTabs']))));
  await page.evaluate(({ path, missing }) => localStorage.setItem(JSON.stringify(['remote', 'litzio.openTabs']), JSON.stringify({ paths: [path, missing], activePath: path })), { path, missing });
  await page.reload();
  await expect.poll(() => failedReads).toBe(1);
  await expect(remote).toHaveCount(1);
  await local.click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await rememberedRemote()).toEqual({ paths: [path, missing], activePath: path });
  // Closing the successfully restored tab must resume persistence even before another Open.
  await page.getByRole('button', { name: /^Close same.txt.*Remote$/ }).click();
  await expect.poll(async () => (await rememberedRemote()).paths).toEqual([]);
  failRemembered = false; showFresh = true;
  await page.locator('[data-host-id="remote"] [data-folder-menu]').click();
  await page.getByRole('menuitem', { name: 'Refresh', exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
  await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /fresh.txt/ }).click();
  await expect.poll(async () => (await rememberedRemote()).paths).toEqual([fresh]);
  await page.getByRole('button', { name: /^Close fresh.txt.*Remote$/ }).click();
  await expect.poll(async () => (await rememberedRemote()).paths).toEqual([]);
  await page.reload();
  await expect(local).toHaveCount(1);
  await expect(remote).toHaveCount(0);
  expect((await rememberedRemote()).paths).toEqual([]);

  // Saved order/selection must survive replies completing in the opposite order (#1184).
  delayStartup = true; releaseStartup = undefined; freshReads = 0;
  await page.evaluate(({ path, fresh }) => localStorage.setItem(JSON.stringify(['remote', 'litzio.openTabs']), JSON.stringify({ paths: [path, fresh], activePath: fresh })), { path, fresh });
  await page.reload();
  await expect.poll(() => typeof releaseStartup).toBe('function');
  await expect.poll(() => freshReads).toBe(1);
  await releaseStartup();
  const freshTab = page.getByRole('tab', { name: /fresh.txt.*Remote/ });
  await expect(remote).toHaveCount(1);
  await expect(freshTab).toHaveCount(1);
  await expect(page.getByRole('tab').filter({ hasText: /Remote/ })).toHaveText([/same.txt/, /fresh.txt/]);
  await expect(freshTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /^Close fresh.txt.*Remote$/ }).click();
  await local.click();

  // A late startup read must neither replace an explicit open nor resurrect an explicitly closed tab.
  for (const closeBeforeReply of [false, true]) {
    delayStartup = true; releaseStartup = undefined;
    await page.evaluate(path => localStorage.setItem(JSON.stringify(['remote', 'litzio.openTabs']), JSON.stringify({ paths: [path], activePath: path })), path);
    await page.reload();
    await expect.poll(() => typeof releaseStartup).toBe('function');
    await page.locator('[data-host-id="remote"]').getByRole('treeitem', { name: /same.txt/ }).click();
    await expect(remote).toHaveCount(1);
    await expect(remote).toHaveAttribute('aria-selected', 'true');
    if (closeBeforeReply) {
      await page.getByRole('button', { name: /^Close same.txt.*Remote$/ }).click();
      await expect(remote).toHaveCount(0);
    }
    const lateReply = page.waitForResponse(response => response.url().includes('/fixture/remote/api/document?path=') && response.request().method() === 'GET');
    await releaseStartup();
    await (await lateReply).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(local).toHaveCount(1);
    await expect(remote).toHaveCount(closeBeforeReply ? 0 : 1);
    await expect(closeBeforeReply ? local : remote).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveValue(closeBeforeReply ? sources.local : sources.remote);
  }
  // #1190: creation follows the Explorer's Host while Local owns the active tab.
  await local.click();
  await page.getByLabel('Host', { exact: true }).selectOption('');
  const remoteExplorer = page.locator('[data-host-id="remote"]');
  const localExplorer = page.locator('[data-host-id="local"]');
  const newPath = root + sep + 'remote-created.md';
  const newFolder = root + sep + 'remote-folder';
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await remoteExplorer.getByRole('button', { name: 'New document…', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/1190-plus-${width}.png` });
      await remoteExplorer.locator('[data-folder-menu]').click();
      await page.getByRole('menuitem', { name: 'New folder…', exact: true }).waitFor();
      await page.screenshot({ path: `tmp/1190-menu-${width}.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('menuitem', { name: 'New folder…', exact: true }).waitFor({ state: 'hidden' });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await remoteExplorer.getByRole('button', { name: 'New document…', exact: true }).click();
  await expect(page.getByTestId('new-file-directory')).toHaveValue(root);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(remoteExplorer.getByRole('button', { name: 'New document…', exact: true })).toBeFocused();
  await remoteExplorer.getByRole('button', { name: 'New document…', exact: true }).click();
  await page.getByTestId('new-file-name').fill('remote-created');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const createdTab = page.getByRole('tab', { name: /remote-created.md.*Remote/ });
  await expect(createdTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('current-host')).toHaveText('Remote');
  await expect(page.locator('[data-document-tab][data-active=true] .document-editor')).toBeFocused();
  await expect(remoteExplorer.getByRole('treeitem', { name: /remote-created.md/ })).toBeVisible();
  await remoteExplorer.locator('[data-folder-menu]').click();
  await page.getByRole('menuitem', { name: 'New folder…', exact: true }).click();
  await page.getByTestId('new-folder-name').fill('remote-folder');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(remoteExplorer.getByRole('treeitem', { name: 'remote-folder', exact: true })).toBeVisible();
  await remoteExplorer.getByRole('treeitem', { name: 'remote-folder', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New document…', exact: true }).click();
  await expect(page.getByTestId('new-file-directory')).toHaveValue(newFolder);
  await page.getByTestId('new-file-name').fill('child');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('tab', { name: /child.md.*Remote/ })).toHaveAttribute('aria-selected', 'true');
  await expect(remoteExplorer.getByRole('treeitem', { name: /child.md/ })).toBeVisible();
  await remoteExplorer.getByRole('treeitem', { name: 'remote-folder', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New folder…', exact: true }).click();
  await expect(page.getByTestId('new-folder-directory')).toHaveValue(newFolder);
  await page.getByTestId('new-folder-name').fill('nested');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(remoteExplorer.getByRole('treeitem', { name: 'nested', exact: true })).toBeVisible();
  // Creating inside the folder picker must retain its new location when Explorer refreshes.
  await remoteExplorer.locator('[data-folder-menu]').click();
  await page.getByRole('menuitem', { name: 'Open folder…', exact: true }).click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('option', { name: 'remote-folder', exact: true }).click();
  await expect(page.getByTestId('folder-path')).toHaveValue(newFolder + sep);
  await picker.getByRole('button', { name: 'New folder', exact: true }).click();
  for (const [name, message] of [['conflict', 'Fixture folder conflict'], ['disconnected', 'Fixture folder unavailable']]) {
    await page.getByTestId('new-folder-name').fill(name);
    await picker.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByTestId('new-error')).toHaveText(message);
    await expect(page.getByTestId('new-folder-name')).toHaveValue(name);
    await expect(page.getByTestId('folder-path')).toHaveValue(newFolder + sep);
  }
  await page.getByTestId('new-folder-name').fill('picked');
  await picker.getByRole('button', { name: 'Create', exact: true }).click();
  const picked = newFolder + sep + 'picked';
  await expect(remoteExplorer.getByRole('treeitem', { name: 'picked', exact: true, includeHidden: true })).toBeVisible();
  await expect(page.getByTestId('folder-path')).toHaveValue(picked + sep);
  await expect(page.getByTestId('folder-open')).toContainText('picked');
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('tab', { name: /child.md.*Remote/ })).toHaveAttribute('aria-selected', 'true');
  expect(creations).toEqual([
    { host: 'remote', path: newPath, kind: 'document' },
    { host: 'remote', path: newFolder, kind: 'folder' },
    { host: 'remote', path: newFolder + sep + 'child.md', kind: 'document' },
    { host: 'remote', path: newFolder + sep + 'nested', kind: 'folder' },
    { host: 'remote', path: newFolder + sep + 'picked', kind: 'folder' },
  ]);
  expect([...created.local]).toEqual([]);
  // A native remote recovery keeps its captured client for dry-run, semantics and images.
  showNative = true;
  await remoteExplorer.locator('[data-folder-menu]').click();
  await page.getByRole('menuitem', { name: 'Refresh', exact: true }).click();
  await remoteExplorer.getByRole('treeitem', { name: 'technical-1.md', exact: true }).click();
  await page.locator('[data-document-tab][data-active="true"] .document-editor h1').first().click();
  await page.keyboard.press('Home'); await page.keyboard.type('Remote recovery. ');
  await expect.poll(async () => (await recoveryRecords(page)).some(record => record.hostId === 'remote' && record.path === nativePath && record.recoveryText.includes('Remote recovery.'))).toBe(true);
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  const recoveryPrompt = page.getByTestId('recovery-prompt');
  await expect(recoveryPrompt).toContainText('Remote');
  const beforeComparison = JSON.stringify(await recoveryRecords(page));
  await recoveryPrompt.getByRole('button', { name: 'Compare', exact: true }).click();
  const recoveryVisual = recoveryPrompt.getByTestId('visual-comparison');
  await expect(recoveryVisual.locator('.document-editor')).toHaveCount(2);
  await expect.poll(() => recoveryVisual.locator('img[data-testid="figure-image"]').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  const previewImages = await recoveryVisual.locator('img[data-testid="figure-image"]').evaluateAll(images => images.map(image => image.src));
  expect(previewImages.length).toBeGreaterThan(0);
  expect(previewImages.every(url => url.includes('/fixture/remote/document/'))).toBe(true);
  expect(previewHosts).toEqual(['remote']); expect(comparisonHosts).toEqual(['remote']);
  expect(assetRequests.length).toBeGreaterThan(0);
  expect(assetRequests.every(url => url.includes('/fixture/remote/document/'))).toBe(true);
  await recoveryPrompt.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(recoveryPrompt.getByRole('region', { name: 'Source differences', exact: true })).toBeVisible();
  expect(JSON.stringify(await recoveryRecords(page))).toBe(beforeComparison);
  await recoveryPrompt.getByRole('button', { name: 'Delete record', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete recovery record?', exact: true }).getByRole('button', { name: 'Delete record', exact: true }).click();
  await expect(recoveryPrompt).toHaveCount(0);
  await createdTab.click();
  await localExplorer.locator('[data-folder-menu]').click();
  await page.getByRole('menuitem', { name: 'Refresh', exact: true }).click();
  await expect(localExplorer.getByRole('treeitem', { name: /remote-created|remote-folder|child.md/ })).toHaveCount(0);
  await remoteExplorer.locator('[data-folder-menu]').click();
  await page.getByRole('menuitem', { name: 'Close folder', exact: true }).click();
  await expect(remoteExplorer.getByTestId('folder')).toHaveCount(0);
  await expect(localExplorer.getByTestId('folder')).toHaveCount(1);
  await expect(createdTab).toHaveCount(1);

  // Explicit entry Host must replace a different Host selected in the existing screen.
  await page.getByTestId('sidebar').getByRole('button',{name:'예시: Host screen',exact:true}).click();
  const screen=page.getByTestId('view-workspace').filter({visible:true});
  await expect(screen.getByRole('combobox',{name:'Host',exact:true})).toHaveValue('local');
  await screen.getByRole('combobox',{name:'Host',exact:true}).selectOption('remote');
  await expect(screen.getByRole('combobox',{name:'Host',exact:true})).toHaveValue('remote');
  await page.getByTestId('sidebar').getByRole('button',{name:'예시: Host screen',exact:true}).click();
  await expect(screen.getByRole('combobox',{name:'Host',exact:true})).toHaveValue('local');
  expect(offlineCatalogReads).toBe(0);
}
