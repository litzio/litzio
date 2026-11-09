async (page, { expect, screenshots }) => {
  const fields = { key: { type: 'string', label: 'Key' }, title: { type: 'string', label: 'Title' }, status: { type: 'string', label: 'Status' }, priority: { type: 'string', label: 'Priority', hidden: true } };
  const view = { kind: 'litzio-view', schemaVersion: 2, catalog: 'litzio-v2', profile: 'query', owner: 'fixture.columns', title: 'Issue table', refresh: 'manual', sources: { stats: { kind: 'operation', operation: 'fixture.columns.read', version: 1, args: {} } }, layout: { component: 'Panel', direction: 'vertical', children: [{ component: 'Table', title: 'Issues', source: 'stats', data: '/rows', columns: ['key', 'title', 'status', 'priority'] }] } };
  let total = 1234;
  await page.route('**/api/views', route => {
    const { action } = route.request().postDataJSON();
    const receipt = { operation: `view.${action}`, version: 1, requestId: 'fixture', outcome: 'success', scope: 'host', timestamp: '2026-11-09T00:00:00Z' };
    const screen = { plugin: 'fixture.columns', id: 'issues', title: 'Issue table', icon: 'Table', defaultViewIds: ['issues'], primary: true };
    const result = action === 'catalog' ? { catalog: { operations: [{ operation: 'fixture.columns.read', version: 1, plugin: 'fixture.columns', rowSchema: fields, inputSchema: { type: 'object', additionalProperties: false } }] }, screens: [screen], views: [{ plugin: 'fixture.columns', id: 'issues', title: 'Issue table', definition: view }] } : action === 'run' ? { rows: [{ key: 'DEMO-1', title: '조회 결과의 표시 열 선택', status: '진행 중', priority: '높음' }], fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.label])), coverage: { truncated: true, returned: 1, ...(total === undefined ? {} : { total }) } } : { favourites: [] };
    return route.fulfill({ json: { ...result, receipt } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Issue table', exact: true }).click();
  const query = page.getByTestId('generated-view');
  await query.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(query.getByRole('cell', { name: 'DEMO-1', exact: true })).toBeVisible();
  await expect(query.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Priority', exact: true }) })).toHaveCount(0);
  await expect(query.getByRole('button', { name: 'Shown: 1 · Total: 1,234', exact: true })).toBeVisible();
  await query.getByRole('button', { name: 'Columns', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Priority', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Status', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(query.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Priority', exact: true }) })).toBeVisible();
  await expect(query.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Status', exact: true }) })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Issue table', exact: true }).click();
  await page.getByTestId('generated-view').getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Priority', exact: true }) })).toBeVisible();
  await expect(page.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Status', exact: true }) })).toHaveCount(0);
  total = undefined;
  await page.getByTestId('generated-view').getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Partial results', exact: true })).toBeVisible();
  total = 1234;
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.evaluate(({ width }) => { localStorage.setItem('litzio.theme', width === 640 ? 'dark' : 'light'); localStorage.setItem('litzio.uiLanguage', width === 640 ? 'ko' : 'en'); }, { width });
      await page.setViewportSize({ width, height: 900 }); await page.reload();
      await page.getByRole('button', { name: 'Issue table', exact: true }).click();
      await page.getByTestId('generated-view').getByRole('button', { name: width === 640 ? '데이터 새로고침' : 'Refresh data', exact: true }).click();
      await expect(page.getByRole('cell', { name: 'DEMO-1', exact: true })).toBeVisible();
      await page.screenshot({ path: `tmp/plugin-columns/after-${width}.png`, maskColor: '#777777', mask: [page.getByTestId('sidebar'), page.locator('.views-page > header > p')] });
      await page.getByTestId('generated-view').getByRole('button', { name: width === 640 ? '열 선택' : 'Columns', exact: true }).click();
      await expect(page.getByRole('menuitemcheckbox', { name: 'Priority', exact: true })).toBeVisible();
      await page.screenshot({ path: `tmp/plugin-columns/menu-${width}.png`, maskColor: '#777777', mask: [page.getByTestId('sidebar'), page.locator('.views-page > header > p')] });
      await page.keyboard.press('Escape');
    }
  }
}
