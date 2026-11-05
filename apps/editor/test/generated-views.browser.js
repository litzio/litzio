async (page, { expect, pluginFixture, openFolderPicker, screenshots }) => {
  const root = pluginFixture.folder, favourite = `Folder totals ${Date.now()}`;
  const proposal = { kind: 'litzio-view', schemaVersion: 1, catalog: 'litzio-v1', title: 'Folder document totals', refresh: 'manual', sources: { stats: { operation: 'folder.statistics', version: 1, args: {}, groupBy: { field: 'folder' }, aggregate: { op: 'sum', field: 'documents' }, sort: { field: 'value', direction: 'desc' }, limit: 10 } }, layout: { component: 'VerticalPanel', children: [{ component: 'Table', title: 'Document totals', source: 'stats', data: '/rows', columns: ['group', 'value'] }, { component: 'BarChart', title: 'Document totals chart', source: 'stats', data: '/rows', x: 'group', y: 'value' }] } };
  let conversation, sends = [], queries = 0, validates = 0, latestRows;
  const settings = { provider: 'codex', model: 'gpt-6-luna', reasoningEffort: 'low', permissionMode: 'read-only', responseLanguage: 'en' };
  await page.route('**/api/assistant/settings*', route => route.fulfill({ json: settings }));
  await page.route('**/api/assistant/diagnostics*', route => route.fulfill({ json: { provider: 'codex', connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/models*', route => { const provider = route.request().url().includes('copilot') ? 'copilot' : 'codex'; const model = provider === 'copilot' ? 'copilot-selected' : 'gpt-6-luna'; return route.fulfill({ json: { provider, models: [{ id: model, model, displayName: model, description: '', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }], updatedAt: 0 } }); });
  await page.route('**/api/assistant/conversations*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: route.request().url().includes('?id=') ? conversation : [] });
    const body = route.request().postDataJSON();
    if (body.action === 'send') {
      sends.push(body);
      if (!body.id) conversation = { id: `thread-${body.provider}`, provider: body.provider, model: body.model, reasoningEffort: body.reasoningEffort, folders: [], title: 'View proposal', createdAt: 0, updatedAt: 0, turns: [] };
      const spec = JSON.parse(JSON.stringify(proposal));
      if (sends.length === 1) spec.layout.children[0].columns = ['authorEmail'];
      conversation.turns.push({ id: `turn-${sends.length}`, status: 'completed', items: [{ id: `user-${sends.length}`, kind: 'user', text: body.message }, { id: `answer-${sends.length}`, kind: 'assistant', text: JSON.stringify(spec) }] });
    }
    return route.fulfill({ json: conversation });
  });
  await page.route('**/api/views', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'run') queries++; if (body.action === 'validate') validates++;
    const response = await route.fetch(), value = await response.json();
    if (body.action === 'run' && value.receipt.outcome === 'success') latestRows = value.rows;
    await route.fulfill({ response, json: value });
  });
  await page.reload(); await page.setViewportSize({ width: 1440, height: 1000 });
  await openFolderPicker(page); await page.getByTestId('folder-path').fill(root); await page.getByTestId('folder-open').click();
  await page.getByRole('dialog', { name: 'Open folder', exact: true }).waitFor({ state: 'detached' });
  await page.keyboard.press('Control+Slash'); await page.getByRole('combobox').fill('> Document statistics');
  await page.getByRole('option', { name: 'Document statistics', exact: true }).click();
  const basic = page.getByTestId('statistics-view');
  await expect(basic).toBeVisible(); await basic.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(basic.locator('tbody tr')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  const panel = page.getByTestId('assistant-panel');
  await panel.getByRole('textbox', { name: 'Message assistant' }).fill('Show document totals as a table and bar chart grouped by folder.');
  await panel.getByRole('button', { name: 'Generate view', exact: true }).click();
  const generated = () => page.locator('[data-testid="generated-view"]:visible');
  await expect(generated()).toBeVisible(); expect(validates).toBe(2); expect(sends.length).toBe(2);
  expect(sends[0].model).toBe('gpt-6-luna'); expect(sends[1].id).toBe('thread-codex'); expect(sends[1].model).toBe(sends[0].model);
  await expect(panel.getByRole('list', { name: 'View generation progress' })).toContainText('Correction 1/2');
  if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close assistant' }).click();
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().locator('tbody tr')).not.toHaveCount(0); const rows = latestRows;
  const save = async () => { await generated().getByRole('button', { name: '★ Add to favourites', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '★ Add to favourites', exact: true }); await dialog.getByRole('textbox', { name: 'New favourite name' }).fill(favourite); await dialog.getByRole('button', { name: 'Add favourite', exact: true }).click(); return dialog; };
  await expect(await save()).not.toBeVisible();
  const duplicate = await save(); await expect(duplicate.getByRole('alert')).toBeVisible(); await duplicate.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: 'Document statistics', exact: true }).click();
  await expect(basic.getByRole('button', { name: favourite, exact: true })).toBeVisible();
  const before = { queries, sends: sends.length };
  await basic.getByRole('button', { name: favourite, exact: true }).click();
  await expect(generated().getByText('Data has not been queried. Refresh manually.').first()).toBeVisible();
  expect(queries).toBe(before.queries); expect(sends.length).toBe(before.sends);
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().locator('tbody tr')).not.toHaveCount(0); expect(latestRows).toEqual(rows);
  const cli = pluginFixture.cli(['view', 'run', '--name', favourite, '--root', root]);
  expect(cli.rows).toEqual(latestRows); expect(cli.receipt.operation).toBe('view.run'); expect(cli.receipt.outcome).toBe('success');
  if (screenshots) for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 }); await expect(generated()).toBeVisible();
    await expect(generated().locator('tbody tr')).not.toHaveCount(0);
    expect(await generated().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `tmp/1210-evidence/captures/generated-${width}.png` });
    await page.getByRole('tab', { name: 'Document statistics', exact: true }).click();
    await page.screenshot({ path: `tmp/1210-evidence/captures/favourites-${width}.png` });
    await basic.getByRole('button', { name: favourite, exact: true }).click();
    await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await panel.getByRole('button', { name: 'AI provider settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'GitHub Copilot', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Message assistant' }).fill('Show folder document totals');
  await panel.getByRole('button', { name: 'Generate view', exact: true }).click();
  await expect.poll(() => sends.at(-1)?.provider).toBe('copilot');
  await expect(panel.getByRole('list', { name: 'View generation progress' })).toContainText('View validated');
  expect(sends.at(-1).model).toBe('copilot-selected');
  return { favourite, root, rows, providers: sends.map(send => send.provider) };
}
