async (page, { openPath, activeDocument, removeTabFixture, screenshots, expect }) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'document-tabs', 'technical-1.md'].join(sep);
  await openPath(page, file);
  const disk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`, { headers: { Connection: "close" } })).json();
  removeTabFixture(disk.source + '\nExternal disk content.\n');
  await expect(activeDocument(page)).toContainText('External disk content.', { timeout: 8000 });
  check(await page.getByTestId('external-change').count() === 0, 'Clean native tab should reload automatically');
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
  await capture('automatic');
  await activeDocument(page).getByText('External disk content.', { exact: true }).waitFor();
  // Inject an engine edit during a held GET to exercise the response-acceptance race;
  // ordinary pointer/keyboard input is blocked by Reload's existing modal boundary.
  let releaseRead, readStarted;
  const reading = new Promise(resolve => { readStarted = resolve; });
  const readBarrier = new Promise(resolve => { releaseRead = resolve; });
  const holdRead = async route => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } });
    readStarted(); await readBarrier; await route.fulfill({ response });
  };
  await page.route('**/api/document?*', holdRead);
  try {
    removeTabFixture(disk.source + '\nRacing disk content.\n');
    await reading;
    await activeDocument(page).locator('.document-editor').evaluate(node => node.editor.commands.insertContentAt(1, 'Input during reload. '));
    releaseRead();
    await expect(page.getByRole('dialog', { name: 'Reloading…', exact: true })).toBeHidden();
    await expect(activeDocument(page)).toContainText('Input during reload.');
    await page.getByTestId('external-change').getByRole('button', { name: 'Reload from disk', exact: true }).click();
    await page.getByRole('button', { name: 'Discard and reload', exact: true }).click();
    await activeDocument(page).getByText('Racing disk content.', { exact: true }).waitFor();
  } finally { releaseRead(); await page.unroute('**/api/document?*', holdRead); }
  // A delayed check of the previous checkpoint must not flag our own successful Save.
  let release, reached;
  const held = new Promise(resolve => { reached = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const delay = async route => { const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } }); reached(); await barrier; await route.fulfill({ response }); };
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
  await page.getByTestId('external-change').waitFor({ timeout: 8000 });
  await expect(editor).toContainText('My local change.');
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
  check((await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`, { headers: { Connection: "close" } })).json()).source.includes('Second disk change.'), 'Comparison wrote the file');
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
  await activeDocument(page).getByText('Focus disk change.', { exact: true }).waitFor();
  check(checks === 1, 'Paired focus/visibility events must share one revision request');
  // Reclassification through the same Reload path also supports clean text tabs.
  const detect = async () => {
    await page.clock.fastForward(2100);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  };
  removeTabFixture('Plain disk text.');
  await detect();
  await expect(page.getByTestId('plain-markdown')).toContainText('Plain disk text.');
  removeTabFixture('New plain disk text.');
  await detect();
  await expect(page.getByTestId('plain-markdown')).toContainText('New plain disk text.');
  await page.getByTestId('view-visual').click();
  const input = page.getByTestId('text-editor');
  await input.fill('Keep local text.');
  removeTabFixture('Another disk text.');
  await detect();
  await page.getByTestId('external-change').waitFor();
  await expect(input).toHaveValue('Keep local text.');
  return { externalChangeDetected: true, conflictCompared: true, dirtyReloadConfirmed: true, focusOnlyOutsideFolders: true };
}
