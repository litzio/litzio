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
  const snippets = { 1: '1.1 Merged headers and table notes', 4: '1.2 Display expression and equation number', 5: 'Q / P = ( a + b ) / ( 1 + c )' };
  const proposal = ref => panel.locator('.docling-review-list button').filter({ hasText: snippets[ref] });
  await proposal(1).click();
  await expect(proposal(1).locator('.docling-review-source')).toHaveText(snippets[1]);
  await expect(proposal(1).locator('.docling-review-item-labels')).toHaveText('Heading depthPending');
  await expect(panel.locator('.docling-review-values')).toHaveText('BeforeHeading 2AfterHeading 3');
  const approve = panel.getByRole('button', { name: 'Approve proposal', exact: true });
  const reject = panel.getByRole('button', { name: 'Reject proposal', exact: true });
  const styles = await Promise.all([approve, reject].map(button => button.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderColor }))));
  expect(styles[0].background).not.toBe(styles[1].background);
  await expect(tab.locator('.docling-region[data-source-ref="#/texts/1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab.locator('.docling-target-highlight').first()).toBeAttached();
  const reading = tab.getByTestId('comparison-document');
  expect(await reading.locator('h2').filter({ hasText: '1.1 Merged headers' }).count()).toBe(1);
  await panel.getByRole('button', { name: 'Approve proposal', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  // Direct DOM after busy completion: no reload, polling, or retry to mask refresh.
  expect(await reading.locator('h3').filter({ hasText: '1.1 Merged headers' }).count()).toBe(1);
  await expect(proposal(1)).toContainText('Approved');
  await panel.getByRole('button', { name: 'Undo approval', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  expect(await reading.locator('h2').filter({ hasText: '1.1 Merged headers' }).count()).toBe(1);
  await proposal(4).click();
  await panel.getByRole('button', { name: 'Reject proposal', exact: true }).click();
  await expect(proposal(4)).toContainText('Rejected');
  await proposal(5).click();
  await expect(panel).toContainText('Cannot apply');
  await expect(panel.getByRole('button', { name: 'Approve proposal', exact: true })).toHaveCount(0);
  await proposal(1).click();
  const saved = await call(`docling-review?folder=${encodeURIComponent(job.output)}`);
  for (const [width, theme, language] of [[1440, 'light', 'en'], [640, 'dark', 'ko']]) {
    await page.evaluate(({ theme, language }) => { localStorage.setItem('litzio.theme', theme); localStorage.setItem('litzio.uiLanguage', language); }, { theme, language });
    await page.setViewportSize({ width, height: 1000 });
    if (language === 'ko') { await page.reload(); await show(); await result.getByRole('button', { name: '대조 열기', exact: true }).click(); await proposal(1).click(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await expect(proposal(1).locator('.docling-review-item-labels')).toHaveText(language === 'ko' ? '제목 깊이대기' : 'Heading depthPending');
    await expect(panel.locator('.docling-review-values')).toHaveText(language === 'ko' ? '변경 전제목 2변경 후제목 3' : 'BeforeHeading 2AfterHeading 3');
    await expect(panel.locator('.docling-review-status')).toHaveText(language === 'ko' ? '대기' : 'Pending');
    if (screenshots) {
      await tab.locator('.docling-source img').first().evaluate(image => image.decode());
      await page.evaluate(() => document.fonts.ready);
      if (width === 640) await panel.locator('.docling-review-proposal').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(panel.locator('.docling-review-values')).toBeInViewport();
      await page.screenshot({ path: `tmp/900-captures/review-${width}-${theme}-${language}.png` });
    }
    // Display-only synthetic service reads cover all operation descriptions in both languages.
    const cases = [
      { source: 'A subsection heading', operation: 'heading', value: { level: null }, label: 'section_header', level: 2, expected: ['BeforeHeading 2AfterBody text', '변경 전제목 2변경 후본문'] },
      { source: 'An ordinary paragraph', operation: 'heading', value: { level: 2 }, label: 'text', expected: ['BeforeBody textAfterHeading 2', '변경 전본문변경 후제목 2'] },
      { source: 'A running journal title', operation: 'furniture', value: { label: 'page_header' }, label: 'text', expected: ['BeforeBody textAfterPage header', '변경 전본문변경 후머리글'] },
      { source: 'A page footer fragment', operation: 'furniture', value: { label: 'text' }, label: 'page_footer', expected: ['BeforePage footerAfterBody text', '변경 전바닥글변경 후본문'] },
      { source: 'First paragraph.', operation: 'merge-paragraphs', value: { next: '#/texts/2' }, label: 'text', expected: ['BeforeFirst paragraph.Continuation.AfterFirst paragraph. Continuation.', '변경 전First paragraph.Continuation.변경 후First paragraph. Continuation.'] },
    ];
    for (const [index, testCase] of cases.entries()) {
      const item = { ...saved.proposals[0], id: `display-${index}`, before: { ...saved.proposals[0].before, text: testCase.source, nextText: 'Continuation.', label: testCase.label, level: testCase.level },
        suggestion: { ...saved.proposals[0].suggestion, operation: testCase.operation, value: testCase.value, reason: `Display case ${index}` } };
      await page.route('**/api/docling-review?*', route => route.fulfill({ json: { ...saved, proposals: [item] } }));
      await expect(panel.locator('.docling-review-list button')).toHaveCount(1);
      await expect(panel.locator('.docling-review-source')).toHaveText(testCase.source);
      await panel.locator('.docling-review-list button').click();
      await expect(panel.locator('.docling-review-proposal')).toContainText(item.suggestion.reason);
      await expect(panel.locator('.docling-review-values')).toHaveText(testCase.expected[language === 'ko' ? 1 : 0]);
      await page.unroute('**/api/docling-review?*');
    }
  }
  // Fault/staleness presentation uses a fake job-service read; no real AI is called.
  const longList = Array.from({ length: 40 }, (_, index) => ({ ...saved.proposals[0], id: `synthetic-list-${index}`, suggestion: { ...saved.proposals[0].suggestion, reason: `Long list detail ${index}` } }));
  await page.route('**/api/docling-review?*', route => route.fulfill({ json: { ...saved, proposals: longList } }));
  await expect(panel.locator('.docling-review-list button')).toHaveCount(longList.length);
  await panel.locator('.docling-review-list button').last().click();
  await expect(panel.getByText(longList.at(-1).suggestion.reason, { exact: true })).toBeInViewport();
  expect(await panel.locator('.docling-review-proposal').evaluate(element => element.scrollTop)).toBe(0);
  await page.unroute('**/api/docling-review?*');

  for (const status of ['error', 'uncertain']) {
    await page.route('**/api/docling-review?*', route => route.fulfill({ json: { ...saved, task: { ...saved.task, status, error: 'Synthetic task failure' }, proposals: saved.proposals.map(p => ({ ...p, stale: true })) } }));
    await expect(panel).toContainText(status === 'error' ? '검수 실패' : '검수 결과가 불확실합니다.');
    await proposal(1).click();
    await expect(proposal(1)).toContainText('낡음');
    await expect(panel.locator('.docling-review-status')).toHaveText('낡음');
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
