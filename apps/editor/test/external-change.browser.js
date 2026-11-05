async (page, { openPath, activeDocument, removeTabFixture, screenshots, expect }) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'document-tabs', 'technical-1.md'].join(sep);
  await openPath(page, file);
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  removeTabFixture(disk.source + '\nExternal disk content.\n');
  await page.getByTestId('external-change').waitFor({ timeout: 8000 });
  const capture = async name => {
    if (!screenshots) return;
    for (const [theme, language] of [['light', 'en'], ['dark', 'ko']]) for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async ({ theme, language }) => {
        (await import('/src/i18n.ts')).i18n.changeLanguage(language);
        document.documentElement.dataset.theme = theme;
        await document.fonts.ready;
      }, { theme, language });
      const bounds = await page.locator('.notification-center').evaluate(node => {
        const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, width: node.clientWidth, scroll: node.scrollWidth };
      });
      check(bounds.left >= 0 && bounds.right <= width && bounds.bottom <= 900 && bounds.scroll <= bounds.width, 'Notification overflow');
      await page.screenshot({ path: `tmp/external-change/${name}-${theme}-${width}.png` });
    }
    await page.evaluate(async () => { (await import('/src/i18n.ts')).i18n.changeLanguage('en'); document.documentElement.dataset.theme = 'light'; });
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  await capture('detected');
  await page.getByTestId('external-change').getByRole('button', { name: 'Reload from disk', exact: true }).click();
  await activeDocument(page).getByText('External disk content.', { exact: true }).waitFor();
  // A delayed check of the previous checkpoint must not flag our own successful Save.
  let release, reached;
  const held = new Promise(resolve => { reached = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const delay = async route => { const response = await route.fetch(); reached(); await barrier; await route.fulfill({ response }); };
  await page.route('**/api/folder-version?*', delay);
  await held;
  await activeDocument(page).locator('.document-editor').evaluate(node => node.editor.commands.insertContentAt(1, 'My own Save. '));
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  const accepted = page.waitForResponse(r => r.url().includes('/api/folder-version?'));
  release(); await accepted;
  await page.unroute('**/api/folder-version?*', delay);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check(await page.getByTestId('external-change').count() === 0, 'A stale revision check flagged our own Save');
  // A missed detection must still expose both actions directly from the 409 notification.
  const editor = activeDocument(page).locator('.document-editor');
  await editor.evaluate(node => node.editor.commands.insertContentAt(1, 'My local change. '));
  removeTabFixture(disk.source + '\nSecond disk change.\n');
  const saved = page.waitForResponse(r => r.url().endsWith('/api/document') && r.request().method() === 'POST');
  await page.getByTestId('save').click();
  check((await saved).status() === 409, 'Save must refuse external bytes');
  await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor();
  await capture('conflict');
  await page.getByTestId('external-change').getByRole('button', { name: 'Compare with disk', exact: true }).click();
  const comparison = page.getByTestId('save-comparison');
  await comparison.getByRole('button', { name: 'Source', exact: true }).click();
  await comparison.getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  await expect(comparison).toContainText('My local change.');
  await expect(comparison).toContainText('Second disk change.');
  check((await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json()).source.includes('Second disk change.'), 'Comparison wrote the file');
  await page.keyboard.press('Escape');
  await comparison.waitFor({ state: 'detached' });
  await page.getByTestId('external-change').getByRole('button', { name: 'Reload from disk', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Discard local changes?', exact: true });
  await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(editor).toContainText('My local change.');
  await page.getByTestId('external-change').getByRole('button', { name: 'Reload from disk', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard and reload', exact: true }).click();
  await activeDocument(page).getByText('Second disk change.', { exact: true }).waitFor();
  // Close the folder, retaining the mounted document: no periodic checks may be added.
  await page.getByTestId('folder').first().getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Close folder', exact: true }).click();
  let checks = 0;
  page.on('request', request => { if (request.url().includes('/api/folder-version?')) checks++; });
  await page.clock.install();
  await page.clock.fastForward(6000);
  check(checks === 0, 'Document without a folder introduced periodic requests');
  removeTabFixture(disk.source + '\nFocus disk change.\n');
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  await page.getByTestId('external-change').waitFor();
  check(checks === 1, 'Paired focus/visibility events must share one revision request');
  await page.getByTestId('external-change').getByRole('button', { name: 'Reload from disk', exact: true }).click();
  await activeDocument(page).getByText('Focus disk change.', { exact: true }).waitFor();
  return { externalChangeDetected: true, conflictCompared: true, dirtyReloadConfirmed: true, focusOnlyOutsideFolders: true };
}
