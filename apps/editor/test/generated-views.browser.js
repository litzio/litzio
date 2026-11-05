async (page, { expect, pluginFixture, openFolderPicker, screenshots }) => {
  const root = pluginFixture.folder, favorite = 'Folder document totals';
  const proposal = { kind: 'litzio-view', schemaVersion: 1, catalog: 'litzio-v1', title: 'Folder document totals', refresh: 'manual', sources: { stats: { operation: 'folder.statistics', version: 1, args: {}, groupBy: { field: 'folder' }, aggregate: { op: 'sum', field: 'documents' }, sort: { field: 'value', direction: 'desc' }, limit: 10 } }, layout: { component: 'VerticalPanel', children: [{ component: 'Table', title: 'Document totals', source: 'stats', data: '/rows', columns: ['group', 'value'] }, { component: 'BarChart', title: 'Document totals chart', source: 'stats', data: '/rows', x: 'group', y: 'value' }] } };
  let conversation, sends = [], queries = 0, validates = 0, latestRows, latestReceipt, delayPoll = false;
  const settings = { provider: 'codex', model: 'gpt-6-luna', reasoningEffort: 'low', permissionMode: 'read-only', responseLanguage: 'en' };
  await page.route('**/api/assistant/settings*', route => route.fulfill({ json: settings }));
  await page.route('**/api/assistant/diagnostics*', route => route.fulfill({ json: { provider: 'codex', connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/models*', route => { const provider = route.request().url().includes('copilot') ? 'copilot' : 'codex'; const model = provider === 'copilot' ? 'copilot-selected' : 'gpt-6-luna'; return route.fulfill({ json: { provider, models: [{ id: model, model, displayName: model, description: '', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }], updatedAt: 0 } }); });
  await page.route('**/api/assistant/conversations*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: route.request().url().includes('?id=') ? conversation : [] });
    const body = route.request().postDataJSON();
    if (body.action === 'prepare-view-generation') return route.fulfill({ json: { requestId: 'prepared' } });
    if (body.action === 'cancel-view-generation') return route.fulfill({ json: { acknowledged: true } });
    if (body.action === 'send') {
      sends.push(body);
      if (!body.id) conversation = { id: `thread-${body.provider}`, provider: body.provider, model: body.model, reasoningEffort: body.reasoningEffort, folders: [], title: 'View proposal', createdAt: 0, updatedAt: 0, turns: [] };
      const spec = JSON.parse(JSON.stringify(proposal));
      if (sends.length === 1) spec.layout.children[0].columns = ['authorEmail'];
      conversation.turns.push({ id: `turn-${sends.length}`, status: delayPoll ? 'inProgress' : 'completed', items: [{ id: `user-${sends.length}`, kind: 'user', text: body.message }, { id: `answer-${sends.length}`, kind: 'assistant', text: JSON.stringify(spec) }] });
    }
    return route.fulfill({ json: conversation });
  });
  await page.route('**/api/views', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'run') queries++; if (body.action === 'validate') validates++;
    const response = await route.fetch(), value = await response.json();
    if (body.action === 'run' && value.receipt.outcome === 'success') { latestRows = value.rows; latestReceipt = value.receipt; }
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
  await expect(basic.getByRole('cell', { name: '(Root)', exact: true })).toBeVisible();
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
  await expect(generated().getByRole('cell', { name: '(Root)', exact: true })).toBeVisible();
  await expect(generated().getByRole('meter', { name: '(Root)', exact: true })).toBeVisible();
  const receipt = generated().getByLabel('View receipt', { exact: true });
  await expect(receipt).toHaveText(/^Queried: \d{2}:\d{2}$/);
  await expect(generated().getByText(latestReceipt.requestId, { exact: false })).not.toBeVisible();
  await receipt.hover();
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText(latestReceipt.requestId);
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText(root);
  await page.mouse.move(0, 0); await expect(page.locator('[data-slot=tooltip-content]')).not.toBeVisible();
  const save = async () => { await generated().getByRole('button', { name: '★ Add to favorites', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '★ Add to favorites', exact: true }); await expect(dialog.getByRole('textbox', { name: 'New favorite name' })).toHaveValue(proposal.title); await dialog.getByRole('textbox', { name: 'New favorite name' }).fill(favorite); await dialog.getByRole('button', { name: 'Add favorite', exact: true }).click(); return dialog; };
  await expect(await save()).not.toBeVisible();
  const duplicate = await save(); await expect(duplicate.getByRole('alert')).toBeVisible(); await duplicate.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: 'Document statistics', exact: true }).click();
  await expect(basic.getByRole('button', { name: favorite, exact: true })).toBeVisible();
  const queryCount = queries;
  await basic.getByRole('button', { name: 'Refresh favorites', exact: true }).click();
  await expect(basic.getByRole('button', { name: favorite, exact: true })).toBeVisible();
  expect(queries).toBe(queryCount);
  await basic.getByRole('combobox', { name: 'Statistics folder' }).selectOption('');
  const before = { queries, sends: sends.length };
  await basic.getByRole('button', { name: favorite, exact: true }).click();
  await expect(generated().getByText('Data has not been queried. Refresh manually.').first()).toBeVisible();
  expect(queries).toBe(before.queries); expect(sends.length).toBe(before.sends);
  await expect(generated().getByRole('button', { name: 'Refresh data', exact: true })).toBeDisabled();
  await generated().getByRole('combobox', { name: 'Statistics folder' }).selectOption(root);
  expect(queries).toBe(before.queries);
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().locator('tbody tr')).not.toHaveCount(0); expect(latestRows).toEqual(rows);
  const cli = pluginFixture.cli(['view', 'run', '--name', favorite, '--root', root]);
  expect(cli.rows).toEqual(latestRows); expect(cli.receipt.operation).toBe('view.run'); expect(cli.receipt.outcome).toBe('success');
  expect(cli.rows.some(row => row.group === '.')).toBe(true);
  if (screenshots) for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 }); await expect(generated()).toBeVisible();
    await expect(generated().locator('tbody tr')).not.toHaveCount(0);
    expect(await generated().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `tmp/1210-evidence/captures/generated-${width}.png` });
    await page.getByRole('tab', { name: 'Document statistics', exact: true }).click();
    await page.screenshot({ path: `tmp/1210-evidence/captures/favorites-${width}.png` });
    await basic.getByRole('button', { name: favorite, exact: true }).click();
    await generated().getByRole('combobox', { name: 'Statistics folder' }).selectOption(root);
    await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  }
  // Closing the owning basic tab aborts a held open request; a late response cannot recreate tabs.
  await page.getByRole('tab', { name: 'Document statistics', exact: true }).click();
  let releaseOpen, openStarted = false, openDelivered = false;
  const openGate = new Promise(resolve => { releaseOpen = resolve; });
  await page.route('**/api/views', async route => {
    if (route.request().postDataJSON().action !== 'open') return route.fallback();
    const response = await route.fetch(); openStarted = true; await openGate;
    try { await route.fulfill({ response }); } finally { openDelivered = true; }
  });
  await basic.getByRole('button', { name: favorite, exact: true }).click();
  await expect.poll(() => openStarted).toBe(true);
  const abortedOpen = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/views') && request.postDataJSON()?.action === 'open');
  await page.locator('[data-tab-id="statistics-local"] .document-tab-close').click();
  await abortedOpen;
  const tabsAfterClose = await page.locator('.document-tabs [role="tab"]').count();
  releaseOpen(); await expect.poll(() => openDelivered).toBe(true);
  await expect(page.getByRole('tab', { name: 'Document statistics', exact: true })).toHaveCount(0);
  await expect(page.locator('.document-tabs [role="tab"]')).toHaveCount(tabsAfterClose);
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
  // Stop must free the composer/model/new-conversation controls while a GET remains held.
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'New conversation', exact: true })).toBeEnabled();
  let releasePoll, pollStarted = false, pollDelivered = false;
  const pollGate = new Promise(resolve => { releasePoll = resolve; });
  await page.route('**/api/assistant/conversations*', async route => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('?id=')) return route.fallback();
    pollStarted = true; const late = JSON.parse(JSON.stringify(conversation)); await pollGate;
    late.turns.at(-1).status = 'completed';
    try { await route.fulfill({ json: late }); } finally { pollDelivered = true; }
  });
  delayPoll = true;
  await panel.getByRole('textbox', { name: 'Message assistant' }).fill('Hold this proposal');
  await panel.getByRole('button', { name: 'Generate view', exact: true }).click();
  await expect.poll(() => pollStarted).toBe(true);
  const abortedPoll = page.waitForEvent('requestfailed', request => request.url().includes('/api/assistant/conversations?id='));
  await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  await abortedPoll;
  await expect(panel.getByRole('textbox', { name: 'Message assistant' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Model settings', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'New conversation', exact: true })).toBeEnabled();
  const tabsAfterStop = await page.locator('.document-tabs [role="tab"]').count();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  releasePoll(); await expect.poll(() => pollDelivered).toBe(true);
  await expect(page.locator('.document-tabs [role="tab"]')).toHaveCount(tabsAfterStop);
  return { favorite, root, rows, providers: sends.map(send => send.provider) };
}
