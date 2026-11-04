async (page, { expect, screenshots, recoveryRecords }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).concat('tmp', 'multi-host').join(sep);
  const path = root + sep + 'same.txt';
  const sources = { local: 'Local text', remote: 'Remote text' };
  const saves = [];
  const versions = { local: 0, remote: 0 };
  const revision = host => (host === "local" ? "a" : "b").repeat(60) + String(versions[host]).padStart(4, "0");
  await page.route('**/api/document**', async route => {
    const url = route.request().url();
    const host = url.includes('/fixture/remote/') ? 'remote' : 'local';
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); if (body.revision !== revision(host)) throw new Error("Save used another Host’s revision"); sources[host] = body.source; versions[host]++; saves.push(host); return route.fulfill({ json: { revision: revision(host) } }); }
    if (!url.includes('?path=')) return route.fulfill({ json: { start: true } });
    return route.fulfill({ json: { kind: 'text', path, source: sources[host], revision: revision(host) } });
  });
  await page.route('**/api/folder?**', route => route.fulfill({ json: { root, path: root, entries: [{ path, name: 'same.txt', kind: 'document', native: false }] } }));
  await page.route('**/api/folder-version?**', route => route.fulfill({ json: { version: '1', revisions: [] } }));
  await page.route('**/fixture/remote/api/host-capabilities', route => route.fulfill({ json: { fileDeletion: 'trash' } }));
  await page.route('**/fixture/off/api/host-capabilities', route => route.fulfill({ status: 503, json: { error: 'Unreachable' } }));
  await page.evaluate(({ path, root }) => {
    for (const host of ['local', 'remote']) { localStorage.setItem(JSON.stringify([host, 'litzio.openTabs']), JSON.stringify({ paths: [], activePath: null })); localStorage.setItem(JSON.stringify([host, 'litzio.openFolders']), JSON.stringify([root])); }
  }, { path, root });
  await page.addInitScript(() => {
    window.__explorerCalls = [];
    window.litzioDesktop = {
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
  await page.getByRole('textbox', { name: 'Text editor' }).fill('Remote saved');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves.join()).toBe('remote');
  await local.click();
  await page.getByRole('textbox', { name: 'Text editor' }).fill('Local saved');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves.join()).toBe('remote,local');
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
  await expect.poll(() => saves.join()).toBe('remote,local,remote');
  await local.click();
  await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveValue('Local saved');
  if ((await page.evaluate(() => window.__explorerCalls)).length) throw new Error('Remote paths reached the Desktop shell');
  const assistantRequests = [];
  await page.route('**/fixture/remote/api/assistant/**', route => { assistantRequests.push(route.request().url()); return route.fulfill({ json: route.request().url().includes('/models') ? { models: [], provider: 'codex' } : route.request().url().includes('/diagnostics') ? { connected: false, error: 'Fixture: no model call' } : { provider: 'codex', permissionMode: 'opened-folders', model: '', reasoningEffort: '' } }); });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Select Host' })).toBeVisible();
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'tmp/pr4-choose-1440.png' }); await page.setViewportSize({ width: 640, height: 900 }); await page.screenshot({ path: 'tmp/pr4-choose-640.png' }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Remote', exact: true }).click();
  await expect(page.locator('.assistant-context')).toContainText('Remote');
  await expect.poll(() => assistantRequests.some(url => url.endsWith('/settings'))).toBe(true);
  await local.click();
  await page.getByLabel('Host', { exact: true }).selectOption('local');
  await expect(page.locator('.assistant-context')).toContainText('Remote');
  if (screenshots) { await page.screenshot({ path: 'tmp/pr4-assistant-1440.png' }); await page.setViewportSize({ width: 640, height: 900 }); await page.screenshot({ path: 'tmp/pr4-assistant-640.png' }); }
  await page.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByLabel('Host', { exact: true }).selectOption('');
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'tmp/pr4-1440.png' }); await page.setViewportSize({ width: 640, height: 900 }); await page.screenshot({ path: 'tmp/pr4-640.png' }); }
}