// Real C1 Host, fake AI adapter, synthetic PDF conversion. No real AI call.
async (page, { expect, doclingFixture: fixture, screenshots }) => {
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const call = async (route, method = 'GET', body) => {
    const response = await page.request.fetch(`${origin}/api/${route}`, { method, ...(body ? { data: body } : {}) });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  await call('docling-features', 'PUT', { conversion: true, comparison: true, review: true });
  await call('docling-settings', 'PUT', { server: fixture.url });
  fixture.mode('success');
  const job = await call('docling-conversion', 'POST', { path: fixture.input });
  await expect.poll(async () => (await call(`docling-conversion?id=${job.id}`)).state).toBe('success');
  const dashboard = page.getByTestId('docling-dashboard');
  const show = async () => { await page.getByTestId('sidebar').getByRole('button', { name: 'Docling', exact: true }).click(); await expect(dashboard).toBeVisible(); };
  await expect(page.locator('.docling-tab[data-active=true]')).toBeVisible();
  await show();
  const result = dashboard.locator(`[data-result-id="${job.id}"]`);
  await expect(result.getByRole('button', { name: 'Run review', exact: true })).toBeEnabled();
  await result.getByRole('button', { name: 'Run review', exact: true }).click();
  await expect(result).toContainText('Review in progress');
  await result.getByRole('button', { name: 'Cancel review', exact: true }).click();
  await expect(result).toContainText('Review cancelled');
  await result.getByRole('button', { name: 'Run review', exact: true }).click();
  await expect(result).toContainText('Pending proposals: 2');
  await result.getByRole('button', { name: 'Open comparison', exact: true }).click();
  const tab = page.locator('.docling-tab[data-active=true]');
  const panel = tab.locator('.docling-review');
  const proposal = ref => panel.getByRole('button', { name: new RegExp(`^heading · #/texts/${ref} ·`) });
  await proposal(1).click();
  await expect(tab.locator('.docling-region[data-source-ref="#/texts/1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab.locator('.docling-target-highlight').first()).toBeAttached();
  const reading = tab.getByTestId('comparison-document');
  expect(await reading.locator('h2').filter({ hasText: '1.1 Merged headers' }).count()).toBe(1);
  await panel.getByRole('button', { name: 'Approve proposal', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  // Direct DOM after busy completion: no reload, polling, or retry to mask refresh.
  expect(await reading.locator('h3').filter({ hasText: '1.1 Merged headers' }).count()).toBe(1);
  await expect(proposal(1)).toContainText('approved');
  await panel.getByRole('button', { name: 'Undo approval', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  expect(await reading.locator('h2').filter({ hasText: '1.1 Merged headers' }).count()).toBe(1);
  await proposal(4).click();
  await panel.getByRole('button', { name: 'Reject proposal', exact: true }).click();
  await expect(proposal(4)).toContainText('rejected');
  await proposal(5).click();
  await expect(panel).toContainText('inapplicable');
  await expect(panel.getByRole('button', { name: 'Approve proposal', exact: true })).toHaveCount(0);
  await proposal(1).click();
  for (const [width, theme, language] of [[1440, 'light', 'en'], [640, 'dark', 'ko']]) {
    await page.evaluate(({ theme, language }) => { localStorage.setItem('litzio.theme', theme); localStorage.setItem('litzio.uiLanguage', language); }, { theme, language });
    await page.setViewportSize({ width, height: 1000 });
    if (language === 'ko') { await page.reload(); await show(); await result.getByRole('button', { name: '대조 열기', exact: true }).click(); await panel.getByRole('button', { name: /#\/texts\/1/ }).click(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    if (screenshots) await page.screenshot({ path: `tmp/900-captures/review-${width}-${theme}-${language}.png` });
  }
  // Fault/staleness presentation uses a fake job-service read; no real AI is called.
  const saved = await call(`docling-review?folder=${encodeURIComponent(job.output)}`);
  for (const status of ['error', 'uncertain']) {
    await page.route('**/api/docling-review?*', route => route.fulfill({ json: { ...saved, task: { ...saved.task, status, error: 'Synthetic task failure' }, proposals: saved.proposals.map(p => ({ ...p, stale: true })) } }));
    await expect(panel).toContainText(status === 'error' ? '검수 실패' : '검수 결과가 불확실합니다.');
    await panel.getByRole('button', { name: /#\/texts\/1/ }).click();
    await expect(panel.getByRole('button', { name: '제안 승인', exact: true })).toBeDisabled();
    await page.unroute('**/api/docling-review?*');
  }
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); }); await page.reload();
  await show();
  if (screenshots) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tmp/900-captures/dashboard-1440-light-en.png' });
    await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'ko'); localStorage.setItem('litzio.theme', 'dark'); });
    await page.setViewportSize({ width: 640, height: 1000 }); await page.reload(); await show();
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tmp/900-captures/dashboard-640-dark-ko.png' });
    await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); }); await page.reload(); await show();
  }
  await dashboard.getByRole('checkbox' , { name: 'Structure review', exact: true }).uncheck();
  await expect(result.getByRole('button', { name: 'Run review', exact: true })).toBeDisabled();
  await expect(result).toContainText('Review is disabled.');
  await dashboard.getByRole('checkbox', { name: 'Structure review', exact: true }).check();
  // Simulate unavailable status only; review decisions above all used the real Host.
  await page.route('**/api/docling-review-agent', route => route.fulfill({ json: null }));
  await expect(dashboard).toContainText('AI agent: Off');
  await expect(result.getByRole('button', { name: 'Run review', exact: true })).toBeDisabled();
  await page.unroute('**/api/docling-review-agent');
  await page.route('**/api/docling-review-agent', route => route.fulfill({ json: { adapter: 'Fake', available: false, loginRequired: true } }));
  await expect(dashboard).toContainText('AI agent: Login required');
  await expect(result.getByRole('button', { name: 'Run review', exact: true })).toBeDisabled();
  await page.unroute('**/api/docling-review-agent');
}
