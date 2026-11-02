// Persistent read faults: automatic recovery ends, ordinary observation continues, and manual retry never repeats a write.
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
  let failReads = false, reads = 0, proposalReads = 0, posts = 0;
  page.on('request', request => {
    if (request.method() === 'GET' && request.url().includes('/api/docling-review?')) proposalReads++;
    if (request.method() === 'POST' && /\/api\/docling-review-(approve|undo)$/.test(request.url())) posts++;
  });
  await page.route('**/api/docling-compare?*', route => {
    reads++;
    return failReads ? route.fulfill({ status: 500, json: { error: 'Persistent comparison read failure' } }) : route.continue();
  });
  const retry = tab.getByRole('button', { name: 'Reload comparison', exact: true });
  const warning = tab.getByText('The comparison may not be current. Automatic reload stopped. Reload it to continue.', { exact: true });
  const reactivate = async () => {
    // Both off and on recreate views. Isolate the on activation's read budget.
    failReads = false;
    await showDashboard();
    await dashboard.getByRole('checkbox', { name: 'Structure review', exact: true }).uncheck();
    await expect(result).toContainText('Review is disabled.');
    await expect(page.locator('.docling-tab').getByTestId('comparison-document')).toHaveCount(1);
    reads = 0; failReads = true;
    await dashboard.getByRole('checkbox', { name: 'Structure review', exact: true }).check();
    await expect(result.getByRole('button', { name: 'Run review', exact: true })).toBeEnabled();
    await page.getByRole('tab', { name: /paper.*Docling comparison/ }).click();
  };
  for (const mode of ['mount', 'approve']) {
    await select(); reads = 0; failReads = true;
    if (mode === 'mount') await reactivate();
    else await panel.getByRole('button', { name: 'Approve proposal', exact: true }).click();
    await expect(warning, `${mode}: persistent failure must reach a terminal warning`).toBeVisible();
    expect(reads, `${mode}: at most three automatic document reads`).toBe(3);
    await expect(retry, `${mode}: a human must be able to retry`).toBeEnabled();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    const stoppedAt = reads, pollsAt = proposalReads;
    // Observe two ordinary proposal polls, rather than freezing timers or sleeping through the retry window.
    await expect.poll(() => proposalReads).toBeGreaterThan(pollsAt + 1);
    expect(reads, `${mode}: proposal polling must not restart document recovery`).toBe(stoppedAt);
    const postsAt = posts; failReads = false;
    await expect(panel).not.toContainText('Loading…');
    await retry.click();
    await expect(heading(mode === 'approve' ? 3 : 2)).toHaveCount(1);
    expect(reads).toBe(stoppedAt + 1);
    expect(posts).toBe(postsAt);
    await fresh();
  }
  expect(posts).toBe(1);
  // Closing a tab during its retry delay must cancel subsequent document reads.
  reads = 0; failReads = true; await reactivate();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Close .*Docling comparison$/ }).click();
  await expect(page.getByRole('tab', { name: /paper.*Docling comparison/ })).toHaveCount(0);
  const readsAtClose = reads, pollsAtClose = proposalReads;
  await expect.poll(() => proposalReads).toBeGreaterThan(pollsAtClose + 1);
  expect(reads).toBe(readsAtClose); expect(posts).toBe(1);
}
