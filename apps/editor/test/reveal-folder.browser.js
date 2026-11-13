// Folder menus are common; only the Desktop capability enables the OS Explorer action.
async (page, { openFolderPicker, screenshots = false, expect }) => {
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const source = await (await page.request.get(page.url().split('/').slice(0, 3).join('/') + '/api/document', { headers: { Connection: "close" } })).json();
  const sep = source.path.includes('\\') ? '\\' : '/';
  const root = source.path.split(sep).slice(0, -4).concat('tmp', 'folder-navigation').join(sep);
  const open = async () => {
    await openFolderPicker(page);
    await page.getByTestId('folder-path').fill(root + sep);
    await page.getByTestId('folder-open').click();
    await page.getByTestId('folder').waitFor();
  };
  await open();
  const folder = page.getByTestId('folder');
  const closeMenu = async () => {
    await page.getByRole('menu').and(page.locator(':focus-within')).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({state:'hidden'});
  };
  await folder.getByRole('button', {name:'More actions', exact:true}).click();
  await expect(page.getByRole('menuitem', {name:'Open in File Explorer', exact:true})).toHaveCount(0);
  await closeMenu();
  await folder.getByRole('button', {name:'More actions for guides', exact:true}).click();
  await expect(page.getByRole('menuitem', {name:'Open in File Explorer', exact:true})).toHaveCount(0);
  await expect(page.getByRole('menuitem', {name:'Delete folder…', exact:true})).toHaveAttribute('aria-disabled','true');
  await closeMenu();
  await page.addInitScript(() => {
    window.__explorer = { calls: [], roots: [], fail: false };
    window.litzioDesktop = {
      reportPendingWork: () => {},
        hostConnection: async () => ({url:location.origin, productVersion:"test", desktopVersion:"test"}),
        checkDaemon: async () => {},
      setTheme: async () => false, setWindowBackground: async () => {},
      info: async () => ({version:'0.0.2', channel:'beta', updatesSupported:false, update:{phase:'idle'}, postponed:null}),
      onUpdateState: () => () => {}, onRestartCheck: () => () => {},
      setOpenedFolders: async roots => { window.__explorer.roots = roots; },
      openFolderInExplorer: async path => {
        window.__explorer.calls.push(path);
        if (window.__explorer.fail) throw Error('Folder deleted');
      },
    };
  });
  await page.reload(); await ready(); await folder.waitFor();
  await folder.getByRole('button', {name:'More actions', exact:true}).click();
  const action = page.getByRole('menuitem', {name:'Open in File Explorer', exact:true});
  await expect(action).toBeVisible();
  if (screenshots) {
    await page.setViewportSize({width:1440, height:900});
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path:'tmp/reveal-folder-1440.png'});
  }
  await action.click();
  await expect.poll(() => page.evaluate(() => window.__explorer.calls)).toEqual([root]);
  const child = folder.getByRole('treeitem', {name:'guides', exact:true});
  const expanded = await child.getAttribute('aria-expanded');
  await folder.getByRole('button', {name:'More actions for guides', exact:true}).click();
  await action.click();
  await expect.poll(() => page.evaluate(() => window.__explorer.calls)).toEqual([root, root + sep + 'guides']);
  await expect(child).toHaveAttribute('aria-expanded', expanded);
  await page.evaluate(() => { window.__explorer.fail = true; });
  await folder.getByRole('button', {name:'More actions', exact:true}).click(); await action.click();
  await expect(page.getByText('Could not open the folder in File Explorer. Check that it still exists and is accessible.', {exact:true})).toBeVisible();
  await folder.getByRole('button', {name:'More actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Close folder', exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.__explorer.roots)).toEqual([]);
}
