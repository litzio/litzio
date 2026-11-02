// Real shared Host receipts and synthetic Docling HTTP; the interrupted receipt is explicitly seeded.
async (page, { expect, doclingFixture: fixture, screenshots }) => {
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.reload();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const request = async (endpoint, method = 'GET', body) => {
    const response = await page.request.fetch(`${origin}/api/docling-${endpoint}`, { method, ...(body === undefined ? {} : { data: body }) });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  await request('features', 'PUT', { conversion: true, comparison: true });
  await request('settings', 'PUT', { server: fixture.url });
  const dashboard = page.getByTestId('docling-dashboard');
  const show = async () => { await page.getByTestId('sidebar').getByRole('button', { name: 'Docling', exact: true }).click(); await expect(dashboard).toBeVisible(); };
  await show();
  await expect(page.getByRole('tab', { selected: true })).toHaveAccessibleName('Docling dashboard');
  await expect(dashboard.getByText('Connected', { exact: true })).toBeVisible();
  await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Server address' })).toHaveValue(fixture.url);
  await page.getByTestId('settings-dialog').press('Escape');
  const settings = page.getByTestId('settings-dialog');
  const feature = async (name, enabled) => {
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(settings.getByRole('checkbox', { name, exact: true })).toBeEnabled();
    const saved = page.waitForResponse(r => r.url().endsWith('/api/docling-features') && r.request().method() === 'PUT');
    await settings.getByRole('checkbox', { name, exact: true }).setChecked(enabled);
    expect((await saved).ok()).toBe(true);
    await expect(settings.getByRole('checkbox', { name, exact: true })).toBeChecked({ checked: enabled });
    await settings.press('Escape');
  };
  const menu = async row => {
    const notifications = page.locator('.notification-center > button[aria-expanded=true]');
    if (await notifications.isVisible()) await notifications.click();
    if (!(await row.locator('details').evaluate(e => e.open))) await row.locator('summary').click();
  };
  const emptyCapture = async (width, theme, language) => {
    await page.evaluate(({ theme, language }) => { localStorage.setItem('litzio.theme', theme); localStorage.setItem('litzio.uiLanguage', language); }, { theme, language });
    await page.setViewportSize({ width, height: 1100 }); await page.reload(); await show();
    await expect(dashboard.locator('.docling-dashboard-empty button')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    if (screenshots) await page.screenshot({ path: `${fixture.captures}/empty-${width}-${theme}-${language}.png` });
  };
  await emptyCapture(1440, 'light', 'en'); await emptyCapture(640, 'light', 'ko'); await emptyCapture(640, 'dark', 'ko');
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.reload(); await show();
  // A second Editor can turn a feature off while this Editor owns its picker.
  // Assert both detach paths before cleanup so either failure remains reported.
  for (const { feature, action, title, input } of [
    { feature: 'comparison', action: 'Open conversion folder…', title: 'Docling comparison', input: fixture.input.replace('completed.pdf', '') },
    { feature: 'conversion', action: 'Convert PDF…', title: 'Convert with Docling', input: fixture.input },
  ]) {
    await dashboard.locator('header').getByRole('button', { name: action, exact: true }).click();
    const picker = page.getByRole('dialog', { name: title, exact: true });
    await expect(picker).toBeVisible();
    await picker.getByTestId('folder-path').fill(input);
    const submissions = fixture.submissions();
    await request('features', 'PUT', { [feature]: false });
    await expect(dashboard.locator('header').getByRole('button', { name: action, exact: true, includeHidden: true })).toHaveCount(0);
    await expect.soft(picker, `${feature}: an open picker must detach with its activation`).toBeHidden();
    // Cleanup after a soft failure permits the other independent path to run.
    if (await picker.isVisible()) await picker.press('Escape');
    await expect(page.getByTestId('sidebar').getByRole('button', { name: 'Collapse Explorer', exact: true })).toBeFocused();
    expect(fixture.submissions()).toBe(submissions);
    await expect(page.getByTestId('docling-conversion')).toHaveCount(0);
    await request('features', 'PUT', { [feature]: true });
    await expect(dashboard.locator('header').getByRole('button', { name: action, exact: true })).toBeVisible();
  }
  const start = async (name, mode) => { fixture.mode(mode); return request('conversion', 'POST', { path: fixture.input.replace('completed.pdf', `${name}.pdf`) }); };
  const finished = async (job, state) => {
    await expect.poll(async () => (await request(`conversion?id=${job.id}`)).state).toBe(state);
  };
  const completed = await start('completed', 'success'); await finished(completed, 'success');
  const failed = await start('failed', 'model-missing'); await finished(failed, 'error');
  const running = await start('running', 'pending');
  await expect(dashboard.locator(`[data-request-id="${running.id}"]`)).toContainText('In progress');
  await expect(dashboard.locator(`[data-record-id="${completed.id}"]`)).toContainText('Completed');
  await expect(dashboard.locator(`[data-record-id="${failed.id}"]`)).toContainText('required model is missing');
  await menu(dashboard.locator(`[data-record-id="${failed.id}"]`));
  await expect(dashboard.locator(`[data-record-id="${failed.id}"]`).getByRole('button', { name: 'Retry…' })).toBeDisabled();
  await dashboard.locator(`[data-record-id="${failed.id}"] summary`).click();
  const result = dashboard.locator(`[data-result-id="${completed.id}"]`);
  await expect(result).toContainText('completed.pdf'); await expect(result.locator('td').first()).toHaveText('1');
  await expect(dashboard.locator(`[data-result-id="${completed.id}"]`)).toHaveCount(1);
  for (const [label, state] of [['In progress', 'running'], ['Failed', 'error'], ['Completed', 'success']]) {
    const counter = dashboard.locator('.docling-dashboard-count').filter({ hasText: label });
    await expect(counter).toContainText('1'); await counter.click();
    await expect(dashboard.locator('tbody tr')).toHaveCount(1);
    await expect(dashboard.locator('tbody tr')).toHaveAttribute('data-state', state); await counter.click();
  }
  await expect(result).toContainText('Correspondence map is current');
  const capture = async (width, theme, language) => {
    await page.evaluate(({ theme, language }) => { localStorage.setItem('litzio.theme', theme); localStorage.setItem('litzio.uiLanguage', language); }, { theme, language });
    await page.setViewportSize({ width, height: 1100 }); await page.reload(); await show();
    await expect(dashboard.locator(`[data-record-id="${failed.id}"]`)).toContainText(language === 'ko' ? '실패' : 'Failed');
    await expect(result.locator('td').first()).toHaveText('1');
    expect(await dashboard.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const panel = page.locator('.docling-dashboard-tab[data-active=true]');
    expect(await panel.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
    await page.evaluate(() => document.fonts.ready);
    if (screenshots) await page.screenshot({ path: `${fixture.captures}/after-${width}-${theme}-${language}.png` });
  };
  await capture(1440, 'light', 'en'); await capture(640, 'light', 'ko'); await capture(640, 'dark', 'ko');
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.reload(); await show();
  await dashboard.locator(`[data-request-id="${running.id}"]`).getByRole('button', { name: 'Stop waiting' }).click();
  await expect(dashboard.locator(`[data-record-id="${running.id}"]`)).toContainText('Waiting stopped');
  await menu(dashboard.locator(`[data-record-id="${failed.id}"]`));
  fixture.mode('success');
  await dashboard.locator(`[data-record-id="${failed.id}"]`).getByRole('button', { name: 'Retry…' }).click();
  const dialog = page.getByTestId('docling-conversion'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^(Start conversion|Convert again)$/ }).click();
  await expect(page.locator('.docling-tab[data-active=true] .ProseMirror')).toBeVisible();
  const comparisonTab = page.getByRole('tab', { name: /failed.docling.*Docling comparison/ });
  const tabId = await comparisonTab.getAttribute('id');
  await show();
  await feature('Docling comparison', false);
  await expect(dashboard.getByRole('button', { name: 'Open conversion folder…' })).toHaveCount(0);
  await comparisonTab.click(); await expect(page.locator(`[aria-labelledby="${tabId}"]`).getByText('Plugin is disabled.', { exact: true })).toBeVisible();
  await show();
  await feature('Docling comparison', true);
  await expect(dashboard.getByRole('button', { name: 'Open conversion folder…' })).toBeVisible();
  await comparisonTab.click(); await expect(page.locator('.docling-tab[data-active=true] .ProseMirror')).toBeVisible();
  expect(await comparisonTab.getAttribute('id')).toBe(tabId);
  await show();
  await feature('PDF conversion', false);
  await expect(dashboard.locator('header').getByRole('button', { name: 'Convert PDF…' })).toHaveCount(0);
  await expect(page.getByTestId('docling-conversion')).toHaveCount(0);
  await page.keyboard.press('Control+Slash');
  await expect(page.getByRole('option', { name: 'Convert with Docling', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Docling dashboard', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('settings-dialog').getByRole('button', { name: 'Docling', exact: true })).toBeVisible();
  await page.getByTestId('settings-dialog').press('Escape');
  await feature('Docling comparison', false);
  await expect(dashboard.getByRole('button', { name: 'Open conversion folder…' })).toHaveCount(0);
  await page.reload(); await show();
  await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(settings.getByRole('checkbox', { name: 'PDF conversion', exact: true })).not.toBeChecked();
  await expect(settings.getByRole('checkbox', { name: 'Docling comparison', exact: true })).not.toBeChecked();
  await settings.press('Escape');
  await feature('Docling comparison', true);
  await expect(dashboard.getByRole('button', { name: 'Open conversion folder…' })).toBeVisible();
  await feature('PDF conversion', true);
  await expect(dashboard.locator('header').getByRole('button', { name: 'Convert PDF…' })).toBeVisible();
  const uncertainId = fixture.uncertain(), before = fixture.submissions();
  const uncertain = dashboard.locator(`[data-record-id="${uncertainId}"]`);
  await expect(uncertain).toContainText('Uncertain');
  expect(fixture.submissions()).toBe(before);
  await menu(uncertain);
  await uncertain.getByRole('button', { name: 'Start again…' }).click(); await expect(dialog).toBeVisible();
  expect(fixture.submissions()).toBe(before); // Explicit confirmation is required; opening never submits.
  await dialog.getByRole('button', { name: 'Start conversion' }).click();
  await expect(page.locator('.docling-tab[data-active=true] .ProseMirror')).toBeVisible();
  expect(fixture.submissions()).toBe(before + 1);
  await show(); await menu(uncertain); await uncertain.getByRole('button', { name: 'Clear record' }).click(); await expect(uncertain).toHaveCount(0);
  fixture.changeResult(completed.output, false); await expect(result).toContainText('Correspondence map is stale');
  const attention = dashboard.locator('.docling-dashboard-count').filter({ hasText: 'Needs attention' });
  await attention.click(); await expect(result).toBeVisible();
  await attention.click();
  await result.getByRole('button', { name: 'Open comparison', exact: true }).click();
  await expect(page.locator('.docling-tab[data-active=true]').getByRole('checkbox', { name: 'Sync scrolling' })).toBeDisabled();
  await show(); await menu(result); await result.getByRole('button', { name: 'Open document', exact: true }).click();
  await expect(page.locator('.document-scroll[data-active=true] .ProseMirror')).toContainText('Externally changed fixture.');
  await show(); if (!(await result.locator('details').evaluate(e => e.open))) await menu(result); await result.getByRole('button', { name: 'Open folder', exact: true }).click();
  await expect(page.getByTestId('sidebar')).toContainText('completed.docling');
  fixture.changeResult(completed.output, true); await expect(result).toContainText('The result folder no longer exists.');
  await expect(result.getByRole('button', { name: 'Open comparison' })).toBeDisabled();
  if (!(await result.locator('details').evaluate(e => e.open))) await menu(result);
  await expect(result.getByRole('button', { name: 'Open document' })).toBeDisabled();
  await expect(result.getByRole('button', { name: 'Open folder' })).toBeDisabled();
  const seeded = Array.from({ length: 12 }, () => fixture.uncertain());
  const stored = (await request('dashboard')).requests.length;
  await expect(dashboard.getByRole('button', { name: 'Show more', exact: true })).toBeVisible();
  const initial = await dashboard.locator('tbody tr').count();
  await dashboard.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(dashboard.locator('tbody tr')).toHaveCount(stored);
  expect(stored).toBeGreaterThan(initial);
  expect((await request('dashboard')).requests.length).toBe(stored);
  for (const id of seeded) await request('history', 'DELETE', { id });
}
