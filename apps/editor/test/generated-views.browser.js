async (page, { expect, pluginFixture, openFolderPicker, openPath, screenshots }) => {
  pluginFixture.cli(['plugins', 'register', pluginFixture.directory]);
  const registered = pluginFixture.cli(['plugins', 'list']).plugins.find(p => p.id === 'fixture.issues');
  pluginFixture.cli(['plugins', 'trust', 'fixture.issues', '--digest', registered.digest]);
  pluginFixture.cli(['plugins', 'enable', 'fixture.issues']);
  expect(pluginFixture.cli(['plugins', 'reload', 'fixture.issues']).receipt.operation).toBe('plugins.reload');
  const invoked = pluginFixture.cli(['operation', 'invoke', 'fixture.issues.read', '--input', `${pluginFixture.directory}/input.json`]);
  expect(invoked.receipt.outcome).toBe('success'); expect(invoked.result.every(row => !('token' in row))).toBe(true);
  let refused;
  try { pluginFixture.cli(['operation', 'invoke', 'fixture.issues.read', '--input', `${pluginFixture.directory}/invalid-input.json`]); }
  catch (error) { refused = JSON.parse(error.stdout.toString()); }
  expect(refused.receipt.outcome).toBe('failure'); expect(refused.result).toBeUndefined();

  let captureEnvironment;
  const root = pluginFixture.folder, favorite = 'Folder document totals';
  const proposal = { kind: 'litzio-view', schemaVersion: 2, catalog: 'litzio-v2', profile: 'query', owner: 'fixture.issues', title: 'Folder document totals', refresh: 'manual', sources: { stats: { kind: "operation", operation: 'fixture.issues.read', version: 1, args: { preset: 'assigned-open' }, groupBy: { field: 'status' }, aggregate: { op: 'sum', field: 'points' }, sort: { field: 'value', direction: 'desc' }, limit: 10 } }, layout: { component: "Panel", direction: "vertical", children: [{ component: 'Table', title: 'Document totals', source: 'stats', data: '/rows', columns: ['group', 'value'] }, { component: "Chart", type: "bar", title: 'Document totals chart', source: 'stats', data: '/rows', x: 'group', y: 'value' }] } };
  const assistantSnapshot={kind:'litzio-view',schemaVersion:2,catalog:'litzio-v2',profile:'query',owner:'litzio.assistant',title:'예시: Saved assistant rows',refresh:'assistant',sources:{stats:{kind:'assistant',generatedAt:'2026-11-06T00:00:00.000Z',rowSchema:{label:{type:'string',label:'Label'},total:{type:'number',label:'Total'}},rows:[{label:'Saved result',total:42}],provenance:[{kind:'reference',label:'예시: Reference',refId:'reference-one'},{kind:'document',label:'예시: Unmapped source',hostId:'local',rootId:'fixture-root',path:'a.md',revision:'revision-one'}]}},layout:{component:'Panel',direction:'vertical',children:[{component:'Table',title:'예시: Snapshot rows',source:'stats',data:'/rows',columns:['label','total']}]}};
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
      if (!body.viewGeneration) spec.title = 'Chat proposed view';
      conversation.turns.push({ id: `turn-${sends.length}`, status: delayPoll ? 'inProgress' : 'completed', items: [{ id: `user-${sends.length}`, kind: 'user', text: body.message, ...(body.viewGeneration ? { viewGeneration: { correction: body.viewGenerationCorrection ?? 0 } } : {}) }, { id: `answer-${sends.length}`, ...(body.viewGeneration ? { kind: 'assistant', text: JSON.stringify(spec) } : { kind: 'tool', text: 'propose_view', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ view: spec, receipt: { operation: 'view.propose', outcome: 'success' } }) }] } }) }] });
    }
    if (body.action === 'send' && !body.viewGeneration) conversation.turns.at(-1).items.push({ id: `spec-${sends.length}`, kind: 'assistant', text: JSON.stringify(proposal) });
    return route.fulfill({ json: conversation });
  });
  // V3 uses a v2 Host fixture until V2 lands. This is renderer proof, not Host integration.
  const saved = new Map();
  let hostCommonRefusal = false;
  let hostInputRefusal = false, unavailableView = false;
  let fault, empty = false, hold, started = false;
  const columns = ['key', 'summary', 'status', 'assignee', 'updated', 'project', 'priority', 'type', 'reporter', 'created', 'points', 'link'];
  const formView = { kind: 'litzio-view', schemaVersion: 2, catalog: 'litzio-v2', profile: 'query', owner: 'fixture.issues', title: 'Issue search', refresh: 'manual', sources: { stats: { kind: "operation", operation: 'fixture.issues.read', version: 1, args: { preset: 'assigned-open' } } }, form: { component: 'InputForm', source: 'stats', fields: [{ component: 'Select', field: 'preset' }, { component: 'TextInput', field: 'text' }, { component: 'DateInput', field: 'since' }, { component: 'NumberInput', field: 'limit' }, { component: 'Checkbox', field: 'closed' }], submit: { component: 'SubmitButton', label: 'Search' } }, layout: { component: "Panel", direction: "vertical", children: [{ component: 'Table', title: 'Issues', source: 'stats', data: '/rows', columns: columns.slice(0, 5) }] } };
  const reviewView = { kind: 'litzio-view', schemaVersion: 2, catalog: 'litzio-v2', profile: 'review', title: 'Review entry', refresh: 'manual', sources: { review: { plugin: 'fixture.issues', review: 'sample', bundleRef: 'bundle' } }, layout: { component: "Panel", direction: "vertical", children: [{ component: 'ReviewList', title: 'Changes', source: 'review' }, { component: 'ReviewDetail', title: 'Details', source: 'review' }] } };
  saved.set('Review entry', reviewView);
  saved.set('Form name input', { ...formView, title: 'Form name input', sources: { stats: { ...formView.sources.stats, args: { preset: 'assigned-open', form: 'valid' } } }, form: { ...formView.form, fields: [{ component: 'TextInput', field: 'form' }] } });
  saved.set('Issue search', formView);
  saved.set('Twelve columns', { ...formView, title: 'Twelve columns', layout: { component: "Panel", direction: "vertical", children: [{ ...formView.layout.children[0], columns }] } });
  const catalog = { operations: [{ operation: 'fixture.issues.read', version: 1, plugin: 'fixture.issues', rowSchema: Object.fromEntries(columns.map(c => [c, { type: 'string', label: c }])), inputSchema: { type: 'object', additionalProperties: false, required: ['preset'], properties: { preset: { type: 'string', title: 'Preset', description: 'Choose which issues to include.', enum: ['assigned-open', 'reported-open', 'assigned-all', 'reported-all', 'recent', 'all'] }, text: { type: 'string', title: 'Text', minLength: 3, pattern: '^[A-Za-z ]+$', maxLength: 20 }, since: { type: 'string', format: 'date', title: 'Since' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, closed: { type: 'boolean', title: 'Closed' }, form: { type: 'string', title: 'Form value', minLength: 3 } } } }] };
  let reviewReads = 0, missingReviewMapping = false;
  const baseline = { documentRevision: 'r1', proposalRevision: 'p1', sourceRevision: 's1', mappingRevision: 'm1' };
  await page.route('**/api/reviews', route => {
    const body = route.request().postDataJSON();
    expect(body.plugin).toBe('fixture.issues'); expect(body.review).toBe('sample'); expect(body.bundleRef).toBe('bundle'); expect(body.root).toBe(root);
    expect(body.action).toBe('read'); reviewReads++;
    const snapshot = { baseline, bundle: { bundleRef: 'bundle', generation: 'g1', documentRef: 'doc', documentRevision: 'r1', documentHash: 'h1', sourceRevision: 's1', mappingRevision: 'm1' },
      document: pluginFixture.reviewDocument, documentRevision: 'r1', documentHash: 'h1', documentPath: `${root}/a.md`, pageCount: 1,
      page: { generation: 'g1', sourceRevision: 's1', pageNo: 1, width: 600, height: 800, origin: 'TOPLEFT', unit: 'px', regions: [] },
      mapping: { generation: 'g1', documentRevision: 'r1', documentHash: 'h1', sourceRevision: 's1', mappingRevision: 'm1', entries: [] },
      proposals: [{ id: 'change', kind: 'text.replace', targets: [{ path: pluginFixture.reviewDocument.blocks[0].path, documentRevision: 'r1', documentHash: 'h1' }], before: { type: 'plain', text: 'Original content' }, after: { type: 'plain', text: 'Reviewed content' }, evidence: ['Checked source'], baseline, state: 'pending', actions: [{ action: 'approve', allowed: true }, { action: 'reject', allowed: true }] }] };
    if (missingReviewMapping) delete snapshot.mapping;
    return route.fulfill({ json: { snapshot, receipt: { outcome: 'success' } } });
  });
  await page.route('**/api/views', async route => {
    const body = route.request().postDataJSON();
    const receipt = { operation: `view.${body.action}`, version: 1, requestId: 'fixture-request', outcome: 'success', scope: 'folder', timestamp: '2026-11-06T00:00:00Z' };
    let value = { receipt };
    if (body.action === "catalog") {value.catalog = catalog;value.screens=[{plugin:'fixture.issues',id:'issues',title:'Fixture issues',icon:'LayoutDashboard',defaultViewIds:['issues'],primary:true}];value.views=[{plugin:'fixture.issues',id:'issues',title:'Issue search',definition:formView}];}
    if (['validate', 'propose'].includes(body.action)) { validates++; if (body.view.layout.children[0].columns.includes('authorEmail')) return route.fulfill({ status: 400, json: { error: 'Invalid binding', receipt: { ...receipt, outcome: 'failure' } } }); value.view = body.view; }
    if (body.action === 'list') value.favourites = body.plugin === 'fixture.issues' ? [...saved.keys()] : body.plugin==='litzio.assistant'?['예시: Saved assistant rows']:[];
    if (body.action === 'open') { value.view = body.plugin==='litzio.assistant'?assistantSnapshot:saved.get(body.name); value.name = body.name; }
    if (body.action === 'save') {
      expect(body.plugin).toBe(body.view.profile === 'review' ? body.view.sources.review.plugin : 'fixture.issues');
      if (saved.has(body.name)) return route.fulfill({ status: 400, json: { error: 'SECRET duplicate detail', receipt: { ...receipt, outcome: 'failure' } } });
      saved.set(body.name, body.view);
    }
    if (body.action === 'run') {
      queries++; started = true; if (hold) await hold;
      if (unavailableView) return route.fulfill({ status: 400, json: { code: 'unavailable', errorKind: 'failed', error: 'SECRET removed column detail', receipt: { ...receipt, outcome: 'failure' } } });
      if (hostCommonRefusal) return route.fulfill({ status: 400, json: { code: 'invalid-input', inputIssues: [{ keyword: 'type' }], receipt: { ...receipt, outcome: 'failure' } } });
      if (hostInputRefusal) return route.fulfill({ status: 400, json: { code: 'invalid-input', inputIssues: [{ field: '/text', keyword: 'pattern' }], error: 'SECRET upstream rejected input', receipt: { ...receipt, outcome: 'failure' } } });
      if (fault) return route.fulfill({ status: 400, json: { errorKind: fault, error: 'SECRET token password upstream-body', receipt: { ...receipt, outcome: fault === 'uncertain' ? 'uncertain' : 'failure' } } });
      value.rows = empty ? [] : body.view.form ? [Object.fromEntries(columns.map(c => [c, c === 'summary' ? 'Review shared query controls' : c === 'key' ? 'ISSUE-42' : c === 'status' ? 'Open' : c === 'assignee' || c === 'reporter' ? 'Alex Kim' : c === 'updated' || c === 'created' ? '2026-11-06' : c === 'points' ? 5 : c === 'priority' ? 'High' : c === 'project' ? 'Editor' : c === 'type' ? 'Task' : 'ISSUE-42']))] : body.view.sources.stats.operation === 'folder.statistics' ? [{ folder: '.', documents: 1, headings: 2, modified: null }] : [{ group: 'open', value: 5 }, { group: 'idle', value: 0 }, { group: 'closed', value: -2 }];
      if (body.view.form) value.fields = { key: 'Issue key', summary: 'Summary', status: 'Status', assignee: 'Assignee', updated: 'Updated on', project: 'Project', priority: 'Priority', type: 'Type', reporter: 'Reporter', created: 'Created on', points: 'Points', link: 'Link' };
      latestRows = value.rows; latestReceipt = receipt; value.target = { root };
    }
    await route.fulfill({ json: value });
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
  const card = panel.getByTestId('assistant-view-result');
  await expect(card).toBeVisible(); expect(validates).toBe(2);
  await expect(panel.getByRole('group', { name: 'Your message' })).toHaveCount(1);
  await expect(panel.getByRole('group', { name: 'Your message' })).not.toContainText('Return a corrected');
  await expect(panel.locator('pre:visible')).toHaveCount(0);
  const definition = panel.locator('details').filter({ has: page.locator('summary', { hasText: 'View definition' }) }).last();
  await definition.locator('summary').click();
  await expect(definition.locator('pre')).toContainText('litzio-view');
  await definition.locator('summary').click();
  await expect(panel.getByTestId('assistant-view-result')).not.toContainText('Error:');
  const beforeCardOpen = queries;
  if (screenshots) { await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'tmp/1218-evidence/result-card-1440.png' }); }
  await card.getByRole('button', { name: 'Open view', exact: true }).click();
  await expect(generated()).toBeVisible(); expect(queries).toBe(beforeCardOpen);
  if (screenshots) await page.screenshot({ path: 'tmp/1218-evidence/result-tab-1440.png' }); expect(sends.length).toBe(2);
  expect(sends[0].model).toBe('gpt-6-luna'); expect(sends[1].id).toBe('thread-codex'); expect(sends[1].model).toBe(sends[0].model);
  await expect(panel.getByTestId('assistant-view-result')).toContainText('Corrections: 1/2');
  if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close assistant' }).click();
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().locator('tbody tr')).not.toHaveCount(0); const rows = latestRows;
  await expect(generated().getByRole('cell', { name: 'open', exact: true })).toBeVisible();
  await expect(generated().getByRole('meter', { name: 'open', exact: true })).toBeVisible();
  if (screenshots) {
    captureEnvironment = await page.evaluate(() => ({ dpr: devicePixelRatio, zoom: visualViewport.scale, userAgent: navigator.userAgent, font: getComputedStyle(document.querySelector('.views-page')).font, scrollTop: document.querySelector('.views-page').scrollTop }));
    for (const width of [1440, 640]) { await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: `tmp/1218-evidence/signed-bars-${width}.png` }); }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const baselines = [];
  for (const [name, value] of [['closed', -2], ['idle', 0], ['open', 5]]) {
    const meter = generated().getByRole('meter', { name, exact: true });
    await expect(meter).toHaveAttribute('aria-valuenow', String(value));
    const geometry = await meter.evaluate(el => {
      const bar = el.querySelector('.view-bar-value').getBoundingClientRect(), zero = el.querySelector('.view-bar-zero').getBoundingClientRect();
      return { left: bar.left, right: bar.right, width: bar.width, zero: zero.left };
    });
    baselines.push(geometry.zero);
    if (value < 0) { expect(geometry.width).toBeGreaterThan(0); expect(Math.abs(geometry.right - geometry.zero)).toBeLessThan(1); }
    else if (value > 0) { expect(geometry.width).toBeGreaterThan(0); expect(Math.abs(geometry.left - geometry.zero)).toBeLessThan(1); }
    else expect(geometry.width).toBe(0);
  }

  expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThan(1);
  const receipt = generated().getByLabel('View receipt', { exact: true });
  await expect(receipt).toHaveText(/^Queried: \d{2}:\d{2}$/);
  await expect(generated().getByText(latestReceipt.requestId, { exact: false })).not.toBeVisible();
  await receipt.hover();
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText(latestReceipt.requestId);
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText(root);
  await page.mouse.move(0, 0); await expect(page.locator('[data-slot=tooltip-content]')).not.toBeVisible();
  // Fixed-args queries have no form, but Host input refusals must remain visible.
  hostInputRefusal = true;
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().getByRole('alert')).toHaveText('Use the required format.');
  hostInputRefusal = false;
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().getByRole('alert')).toHaveCount(0);
  const save = async () => { await generated().getByRole('button', { name: 'Add to favorites', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Add to favorites', exact: true }); await expect(dialog.getByRole('textbox', { name: 'New favorite name' })).toHaveValue(proposal.title); await dialog.getByRole('textbox', { name: 'New favorite name' }).fill(favorite); await dialog.getByRole('button', { name: 'Add favorite', exact: true }).click(); return dialog; };
  await expect(await save()).not.toBeVisible();
  const duplicate = await save(); await expect(duplicate.getByRole('alert')).toBeVisible(); await duplicate.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button',{name:'Fixture issues',exact:true}).click();
  const hub = page.getByTestId('view-workspace').filter({visible:true}).getByRole('region',{name:'Favorites',exact:true});
  await expect(hub.getByRole('button', { name: favorite, exact: true })).toBeVisible();
  const queryCount = queries;
  await hub.getByRole('button', { name: 'Refresh favorites', exact: true }).click();
  await expect(hub.getByRole('button', { name: favorite, exact: true })).toBeVisible();
  expect(queries).toBe(queryCount);
  await hub.getByRole('combobox', { name: 'Statistics folder' }).selectOption('');
  const before = { queries, sends: sends.length };
  await hub.getByRole('button', { name: favorite, exact: true }).click();
  await expect(generated().getByText('Data has not been queried. Refresh manually.').first()).toBeVisible();
  expect(queries).toBe(before.queries); expect(sends.length).toBe(before.sends);
  await expect(generated().getByRole('button', { name: 'Refresh data', exact: true })).toBeDisabled();
  await generated().getByRole('combobox', { name: 'Statistics folder' }).selectOption(root);
  expect(queries).toBe(before.queries);
  await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(generated().locator('tbody tr')).not.toHaveCount(0); expect(latestRows).toEqual(rows);
  if (screenshots) for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 }); await expect(generated()).toBeVisible();
    await expect(generated().locator('tbody tr')).not.toHaveCount(0);
    expect(await generated().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `tmp/1210-evidence/captures/generated-${width}.png` });
    await page.getByRole('tab', { name: 'Fixture issues', exact: true }).click();
    await page.screenshot({ path: `tmp/1210-evidence/captures/favorites-${width}.png` });
    await hub.getByRole('button', { name: favorite, exact: true }).click();
    await generated().getByRole('combobox', { name: 'Statistics folder' }).selectOption(root);
    await generated().getByRole('button', { name: 'Refresh data', exact: true }).click();
  }
  // Closing the owning basic tab aborts a held open request; a late response cannot recreate tabs.
  await page.getByRole('tab', { name: 'Fixture issues', exact: true }).click();
  let releaseOpen, openStarted = false, openDelivered = false;
  const openGate = new Promise(resolve => { releaseOpen = resolve; });
  await page.route('**/api/views', async route => {
    if (route.request().postDataJSON().action !== 'open' || route.request().postDataJSON().name !== favorite) return route.fallback();
    const response = await route.fetch(); openStarted = true; await openGate;
    try { await route.fulfill({ response }); } finally { openDelivered = true; }
  });
  await hub.getByRole('button', { name: favorite, exact: true }).click();
  await expect.poll(() => openStarted).toBe(true);
  const abortedOpen = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/views') && request.postDataJSON()?.action === 'open');
  await page.locator('[data-tab-id="screen-fixture.issues-issues"] .document-tab-close').click();
  await abortedOpen;
  const tabsAfterClose = await page.locator('.document-tabs [role="tab"]').count();
  releaseOpen(); await expect.poll(() => openDelivered).toBe(true);
  await expect(page.getByRole('tab', { name: 'Fixture issues', exact: true })).toHaveCount(0);
  await expect(page.locator('.document-tabs [role="tab"]')).toHaveCount(tabsAfterClose);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await panel.getByRole('button', { name: 'AI provider settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'GitHub Copilot', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Message assistant' }).fill('Show folder document totals');
  await panel.getByRole('button', { name: 'Generate view', exact: true }).click();
  await expect.poll(() => sends.at(-1)?.provider).toBe('copilot');
  await expect(panel.getByTestId('assistant-view-result')).toContainText('View validated');
  expect(sends.at(-1).model).toBe('copilot-selected');
  if (screenshots) { await panel.getByTestId('assistant-view-result').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'tmp/1218-evidence/result-card-no-correction-1440.png' }); }
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await panel.getByRole('button', { name: 'AI provider settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Codex', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Message assistant' }).fill('Make a common view in ordinary chat.');
  const chatQueryCount = queries;
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByTestId('assistant-view-result')).toContainText('Chat proposed view');
  await expect(panel.locator('pre:visible')).toHaveCount(0);
  await panel.getByTestId('assistant-view-result').getByRole('button', { name: 'Open view', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Chat proposed view', exact: true })).toBeVisible();
  expect(queries).toBe(chatQueryCount);
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
  // User interaction coverage for the shared query renderer.
  if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.keyboard.press('Control+Slash'); await page.getByRole('combobox').fill('> fixture.issues: Fixture issues Open view');
  await page.getByRole('option', { name: 'fixture.issues: Fixture issues Open view', exact: true }).click();
  const statistics = page.getByTestId('view-workspace').filter({visible:true}).getByRole('region',{name:'Favorites',exact:true});
  await statistics.getByRole('combobox', { name: 'Statistics folder' }).selectOption(root);
  await statistics.getByRole('button', { name: 'Issue search', exact: true }).click();
  await expect(generated().getByRole('combobox', { name: 'Preset *', exact: true })).toHaveValue('0');
  await expect(generated().getByRole('combobox', { name: 'Preset *', exact: true }).locator('option:checked')).toHaveText('Assigned open');
  await expect(generated().getByText('Unset', { exact: true })).toHaveCount(0);
  await expect(generated().getByRole('button', { name: 'Clear Text', exact: true })).toHaveCount(0);
  const countBeforeInput = queries;
  await generated().getByRole('combobox', { name: 'Preset *', exact: true }).selectOption('1');
  await generated().getByLabel('Text', { exact: true }).fill('');
  await expect(generated().getByRole('button', { name: 'Clear Text', exact: true })).toHaveCount(0);
  await generated().getByLabel('Text', { exact: true }).fill('needle');
  await generated().getByRole('button', { name: 'Clear Text', exact: true }).click();
  await expect(generated().getByLabel('Text', { exact: true })).toBeEmpty();
  await expect(generated().getByLabel('Text', { exact: true })).toBeFocused();
  await expect(generated().getByRole('button', { name: 'Clear Text', exact: true })).toHaveCount(0);
  await generated().getByLabel('Text', { exact: true }).fill('needle');
  await generated().getByLabel('Text', { exact: true }).fill('x1');
  await generated().getByLabel('Since', { exact: true }).fill('2026-02-31');
  await generated().getByLabel('Limit', { exact: true }).fill('0');
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  for (const field of ['Text', 'Since', 'Limit']) await expect(generated().getByLabel(field, { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(queries).toBe(countBeforeInput);
  for (const message of ['Use at least 3 characters.', 'Enter a valid date (YYYY-MM-DD).', 'Enter a value of at least 1.']) await expect(generated().getByRole('alert').filter({ hasText: message })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/v3-review/input-errors-1440.png' });
  await generated().getByLabel('Text', { exact: true }).fill('needle');
  await generated().getByLabel('Limit', { exact: true }).fill('12');
  await generated().getByLabel('Since', { exact: true }).fill('2026-11-01');
  await expect(generated().getByLabel('Closed', { exact: true })).toHaveValue('any');
  await generated().getByLabel('Closed', { exact: true }).selectOption('false');
  await expect(generated().getByLabel('Closed', { exact: true })).toHaveValue('false');
  await generated().getByLabel('Closed', { exact: true }).selectOption('true');
  let release;
  hold = new Promise(resolve => { release = resolve; }); started = false;
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(generated().getByText('Loading data…')).toBeVisible();
  await expect(generated().getByText('Data has not been queried. Refresh manually.')).toHaveCount(0);
  await generated().getByLabel('Text', { exact: true }).fill('changed');
  release(); hold = undefined;
  await expect(generated().locator('th')).toHaveCount(5);
  await expect(generated().getByText(/Search conditions changed/)).toBeVisible();
  for (const width of [640, 960, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await generated().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (screenshots) await page.screenshot({ path: `tmp/v3-evidence/form-${width}.png` });
  }
  hostInputRefusal = true;
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().getByLabel('Text', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(generated()).not.toContainText('SECRET');
  await expect(generated().getByText('View operation failed.', { exact: false })).toHaveCount(0);
  await expect(generated().getByRole('alert').filter({ hasText: 'Use the required format.' })).toBeVisible();
  hostInputRefusal = false;
  unavailableView = true;
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().getByText('This view is no longer available. Create a new view.')).toBeVisible();
  await expect(generated()).not.toContainText('SECRET');
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: 'tmp/v3-review/unavailable-1440.png' }); }
  unavailableView = false;
  hold = new Promise(resolve => { release = resolve; }); started = false;
  await generated().getByRole('combobox', { name: 'Preset *', exact: true }).selectOption('2');
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(generated().getByText(/Previous query result/)).toBeVisible();
  await expect(generated().getByText('Loading data…')).toBeVisible();
  release(); hold = undefined;
  await expect(generated().getByText('Loading data…')).toHaveCount(0);
  const captureStates = async state => {
    if (!screenshots) return;
    for (const width of [1440, 960, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await generated().getByRole('heading', { level: 2 }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/v3-review/${state}-${width}.png` });
    }
  };
  for (const [kind, message] of [['auth', 'Authentication required.'], ['forbidden', 'Access denied.'], ['not_found', 'Target not found.'], ['unavailable', 'Service unavailable.'], ['timeout', 'Operation timed out.'], ['uncertain', 'The outcome is unknown.']]) {
    fault = kind;
    await generated().getByRole('button', { name: 'Search', exact: true }).click();
    await expect(generated().getByText(message, { exact: false })).toBeVisible();
    if (kind === 'auth') await captureStates('error');
    await expect(generated()).not.toContainText('SECRET');
    await expect(generated().getByText(/Previous query result/)).toBeVisible();
  }
  fault = undefined; empty = true;
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().getByText('No matching rows.', { exact: true })).toHaveCount(1);
  empty = false;
  await generated().getByRole('button', { name: 'Add to favorites', exact: true }).click();
  const inputSave = page.getByRole('dialog', { name: 'Add to favorites', exact: true });
  await inputSave.getByRole('textbox', { name: 'New favorite name' }).fill('Saved inputs');
  await inputSave.getByRole('button', { name: 'Add favorite', exact: true }).click();
  await expect(inputSave).not.toBeVisible();
  expect(saved.get('Saved inputs').sources.stats.args.closed).toBe(true);
  expect(saved.get('Saved inputs').sources.stats.args.limit).toBe(12);
  await page.getByRole('tab', { name: 'Fixture issues', exact: true }).click();
  const beforeOpen = queries;
  await statistics.getByRole('button', { name: 'Saved inputs', exact: true }).click();
  await expect(generated().getByLabel('Text', { exact: true })).toHaveValue('changed'); expect(queries).toBe(beforeOpen);
  await generated().getByLabel('Text', { exact: true }).fill('');
  await generated().getByRole('button', { name: 'Add to favorites', exact: true }).click();
  const emptySave = page.getByRole('dialog', { name: 'Add to favorites', exact: true });
  await emptySave.getByRole('textbox', { name: 'New favorite name' }).fill('Without text');
  await emptySave.getByRole('button', { name: 'Add favorite', exact: true }).click();
  await expect(emptySave).not.toBeVisible();
  expect(Object.hasOwn(saved.get('Without text').sources.stats.args, 'text')).toBe(false);
  await generated().getByLabel('Text', { exact: true }).fill('changed');
  await expect(generated().getByRole('combobox', { name: 'Preset *', exact: true })).toHaveValue('2');
  await expect(generated().getByLabel('Since', { exact: true })).toHaveValue('2026-11-01');
  await expect(generated().getByLabel('Closed', { exact: true })).toHaveValue('true');
  await expect(generated().getByText('Data has not been queried. Refresh manually.')).toBeVisible();
  await captureStates('reopened');
  await page.getByRole('tab', { name: 'Fixture issues', exact: true }).click();
  await statistics.getByRole('button', { name: 'Twelve columns', exact: true }).click();
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().locator('th')).toHaveCount(12);
  await expect(generated().locator('th').first().getByRole('button',{name:'Issue key',exact:true})).toBeVisible();
  await expect(generated().locator('th').last().getByRole('button',{name:'Link',exact:true})).toBeVisible();
  for (const width of [640, 960, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await generated().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const scroller = generated().locator('.view-table-scroll');
    await scroller.scrollIntoViewIfNeeded(); await scroller.hover(); await page.mouse.wheel(2500, 0);
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft > 0)).toBe(true);
    await expect.poll(() => generated().locator('th').last().evaluate(el => el.getBoundingClientRect().right <= el.closest('.view-table-scroll').getBoundingClientRect().right)).toBe(true);
    if (screenshots) await page.screenshot({ path: `tmp/v3-review/table12-${width}-end.png` });
    await page.mouse.wheel(-2500, 0);
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBe(0);
    if (screenshots) await page.screenshot({ path: `tmp/v3-review/table12-${width}-start.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('tab', { name: 'Fixture issues', exact: true }).click();
  await statistics.getByRole('button', { name: 'Form name input', exact: true }).click();
  await generated().getByLabel('Form value', { exact: true }).fill('x');
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().getByLabel('Form value', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(generated().getByRole('alert')).toHaveCount(1);
  await expect(generated().getByRole('alert')).toHaveText('Use at least 3 characters.');
  await generated().getByLabel('Form value', { exact: true }).fill('valid');
  hostCommonRefusal = true;
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().getByRole('alert')).toHaveCount(1);
  await expect(generated().getByRole('alert')).toHaveText('Check this value against the operation requirements.');
  await expect(generated().getByLabel('Form value', { exact: true })).toHaveAttribute('aria-invalid', 'false');
  await expect(generated().getByLabel('Form value', { exact: true })).not.toHaveAttribute('aria-describedby');
  hostCommonRefusal = false;
  await page.getByRole('tab', { name: 'Fixture issues', exact: true }).click();
  let releaseLateFavorite,lateFavoriteStarted=false,lateFavoriteDelivered=false;
  const lateFavoriteGate=new Promise(resolve=>{releaseLateFavorite=resolve;});
  await page.route('**/api/views',async route=>{
    const body=route.request().postDataJSON();if(body.action!=='open'||body.name!=='Saved inputs')return route.fallback();
    const response=await route.fetch();lateFavoriteStarted=true;await lateFavoriteGate;
    try{await route.fulfill({response});}finally{lateFavoriteDelivered=true;}
  });
  await statistics.getByRole('button',{name:'Saved inputs',exact:true}).click();
  await expect.poll(()=>lateFavoriteStarted).toBe(true);
  await page.getByRole('region',{name:'Default views',exact:true}).getByRole('button',{name:'Issue search',exact:true}).click();
  await expect(generated().getByLabel('Text',{exact:true})).toHaveValue('');
  releaseLateFavorite();await expect.poll(()=>lateFavoriteDelivered).toBe(true);
  await expect(generated().getByLabel('Text',{exact:true})).toHaveValue('');
  const queriesBeforeReview = queries;
  await statistics.getByRole('button', { name: 'Review entry', exact: true }).click();
  const review = page.getByTestId('review-view');
  await expect(review.getByRole('heading', { name: 'Review entry', exact: true })).toBeVisible();
  await expect.poll(() => reviewReads).toBeGreaterThan(0);
  expect(queries).toBe(queriesBeforeReview);
  await page.getByRole('button', { name: 'Collapse Explorer', exact: true }).click();
  await expect(review.getByRole('region', { name: 'Changes', exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Change 1', exact: false }).click();
  await expect(review.getByText('Reviewed content', { exact: true })).toBeVisible();
  missingReviewMapping = true;
  const readsBeforeMissingMapping = reviewReads;
  await review.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect.poll(() => reviewReads).toBeGreaterThan(readsBeforeMissingMapping);
  await expect(review.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await expect(review.getByText('Reviewed content', { exact: true })).toBeVisible();
  if (screenshots) for (const width of [1440, 960, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `tmp/v3-review/review-entry-${width}.png` });
  }
  // Document-owned favorites use their own namespace and preserve snapshot rows without querying.
  await openPath(page,[root,'a.md'].join(root.includes('\\')?'\\':'/'));
  const outlineToggle=page.getByRole('button',{name:'Outline',exact:true});
  if(await outlineToggle.getAttribute('aria-pressed')!=='true') await outlineToggle.click();
  const documentPanel=page.getByTestId('document-panel');
  await documentPanel.getByRole('tab',{name:'Views',exact:true}).click();
  const beforeSnapshot=queries;
  await documentPanel.getByRole('button',{name:'예시: Saved assistant rows',exact:true}).click();
  await expect(documentPanel.getByRole('cell',{name:'42',exact:true})).toBeVisible();
  await expect(documentPanel).toContainText('Assistant content may be inaccurate.');
  expect(queries).toBe(beforeSnapshot);
  const snapshotTable=documentPanel.getByRole('region',{name:'예시: Snapshot rows',exact:true}).first();
  await snapshotTable.getByRole('button',{name:'Total',exact:true}).click();
  await documentPanel.getByRole('tab',{name:'Outline',exact:true}).click();
  await documentPanel.getByRole('tab',{name:'Views',exact:true}).click();
  await expect(snapshotTable.locator('th').last()).toHaveAttribute('aria-sort','ascending');
  const documentTabId=await page.locator('.document-tabs [role="tab"][aria-selected="true"]').evaluate(el=>el.closest('[data-tab-id]').dataset.tabId);
  await openPath(page,[pluginFixture.otherFolder,'b.md'].join(root.includes('\\')?'\\':'/'));
  await expect(documentPanel.getByRole('cell',{name:'42',exact:true})).toHaveCount(0);
  await page.locator(`.document-tabs [data-tab-id="${documentTabId}"] [role="tab"]`).click();
  await expect(snapshotTable.locator('th').last()).toHaveAttribute('aria-sort','ascending');
  await page.getByRole('button',{name:'Assistant',exact:true}).click();
  await expect(documentPanel).toBeHidden();
  await page.getByTestId('assistant-panel').getByRole('button',{name:'Close assistant',exact:true}).click();
  await expect(snapshotTable.locator('th').last()).toHaveAttribute('aria-sort','ascending');
  await documentPanel.getByText('Sources (2)',{exact:true}).click();
  await expect(documentPanel.getByRole('button',{name:'예시: Unmapped source',exact:true})).toBeDisabled();
  expect(queries).toBe(beforeSnapshot);
  if(screenshots){
    for(const width of [1440,640]){
      await page.setViewportSize({width,height:1000});
      if(width===640){
        await page.getByRole('button',{name:'Settings',exact:true}).click();
        await page.getByTestId('ui-language').selectOption('ko');
        await page.getByTestId('theme').selectOption('dark');
        await page.locator('[data-tab-id="settings"] .document-tab-close').click();
        await page.locator(`.document-tabs [data-tab-id="${documentTabId}"] [role="tab"]`).click();
      }
      if(!await documentPanel.isVisible())await page.getByRole('button',{name:width===640?'개요':'Outline',exact:true}).click();
      await expect(snapshotTable).toBeVisible();
      await page.mouse.move(0,0);
      await page.screenshot({path:`tmp/d3-reviewed-${width}.png`,mask:[page.getByTestId('sidebar'),documentPanel.locator('select')]});
    }
  }
  pluginFixture.cli(['plugins', 'disable', 'fixture.issues']);
  return { favorite, root, rows, captureEnvironment, providers: sends.map(send => send.provider) };
}
