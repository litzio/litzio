// Real saves and fake AI: retained tabs and uncertain HTTP outcomes must show disk state.
async (page, { expect, doclingFixture: fixture }) => {
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const call = async (route, method = 'GET', body) => {
    const response = await page.request.fetch(`${origin}/api/${route}`, { method, ...(body ? { data: body } : {}) });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  await call('docling-features', 'PUT', { conversion: true, comparison: true, review: true });
  await call('docling-settings', 'PUT', { server: fixture.url }); fixture.mode('success');
  const job = await call('docling-conversion', 'POST', { path: fixture.input });
  await expect.poll(async () => (await call(`docling-conversion?id=${job.id}`)).state).toBe('success');
  const dashboard = page.getByTestId('docling-dashboard');
  const showDashboard = async () => { await page.getByTestId('sidebar').getByRole('button', { name: 'Docling', exact: true }).click(); await expect(dashboard).toBeVisible(); };
  await expect(page.locator('.docling-tab[data-active=true]')).toBeVisible(); await showDashboard();
  const result = dashboard.locator(`[data-result-id="${job.id}"]`);
  await result.getByRole('button', { name: 'Run review', exact: true }).click();
  await expect(result).toContainText('Pending proposals: 2');
  const open = async () => { await showDashboard(); await result.getByRole('button', { name: 'Open comparison', exact: true }).click(); };
  await open();
  const tab = page.locator('.docling-tab[data-active=true]'), panel = tab.locator('.docling-review');
  const reading = tab.getByTestId('comparison-document');
  const select = async () => { await panel.locator('.docling-review-list button').filter({ hasText: '1.1 Merged headers and table notes' }).click(); };
  const heading = level => reading.locator(`h${level}`).filter({ hasText: '1.1 Merged headers and table notes' });
  const fresh = async () => { await page.reload(); await open(); await select(); };
  await select(); await panel.getByRole('button', { name: 'Approve proposal', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  expect(await heading(3).count()).toBe(1);
  const comparisonTab = page.getByRole('tab', { name: /paper.*Docling comparison/ });
  const tabId = await comparisonTab.getAttribute('id');
  await showDashboard();
  await dashboard.getByRole('checkbox', { name: 'Structure review', exact: true }).uncheck();
  await expect(result).toContainText('Review is disabled.');
  await dashboard.getByRole('checkbox', { name: 'Structure review', exact: true }).check();
  await expect(result.getByRole('button', { name: 'Run review', exact: true })).toBeEnabled();
  await comparisonTab.click();
  await expect(comparisonTab).toHaveAttribute('id', tabId);
  await select(); await expect(panel.locator('.docling-review-status')).toHaveText('Approved');
  await expect.soft(heading(3), 'reactivation must read the saved H3, not the opening H2').toHaveCount(1);
  await fresh(); // Independent fault cases start from an explicitly reopened current snapshot.
  for (const [action, level] of [['undo', 2], ['approve', 3]]) {
    let publications = 0;
    const route = `**/api/docling-review-${action}`;
    await page.route(route, async intercepted => {
      const response = await intercepted.fetch(); expect(response.status()).toBe(200); publications++;
      await intercepted.fulfill({ status: 400, json: { error: `Result published; cleanup failed: synthetic ${action} cleanup error` } });
    });
    await panel.getByRole('button', { name: action === 'undo' ? 'Undo approval' : 'Approve proposal', exact: true }).click();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await expect(panel.getByRole('alert')).toContainText(`synthetic ${action} cleanup error`);
    await expect.soft(heading(level), `${action} cleanup failure must still display the published document`).toHaveCount(1);
    await expect(panel.locator('.docling-review-status')).toHaveText(action === 'undo' ? 'Pending' : 'Approved');
    expect(publications).toBe(1);
    await page.unroute(route); await fresh();
  }
  let failReads = true, failures = 0, undoRequests = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/docling-review-undo')) undoRequests++; });
  await page.route('**/api/docling-compare?*', intercepted => {
    if (!failReads) return intercepted.continue();
    failures++; return intercepted.fulfill({ status: 500, json: { error: 'Synthetic comparison refresh unavailable' } });
  });
  await panel.getByRole('button', { name: 'Undo approval', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Synthetic comparison refresh unavailable');
  expect(failures).toBeGreaterThan(0);
  await expect(reading, 'an unread current generation must not leave the old document visible').toHaveCount(0);
  failReads = false;
  // No reload or mutation retry: only a later successful GET may reconcile this failure.
  await expect.soft(heading(2), 'a failed document refresh must recover without reopening or resubmitting undo').toHaveCount(1);
  await expect(panel.locator('.docling-review-status')).toHaveText('Pending');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(undoRequests).toBe(1);
  await page.unroute('**/api/docling-compare?*');
}
