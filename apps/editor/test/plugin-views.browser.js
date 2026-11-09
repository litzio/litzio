async (page, { expect, screenshots, openFolderPicker, openPath }) => {
  let queries = 0, latestRows, hostCommonRefusal = false;
  let hostInputRefusal = false, unavailableView = false;
  let fault, empty = false, hold, started = false;
  const columns = ['key', 'summary', 'status', 'assignee', 'updated', 'project', 'priority', 'type', 'reporter', 'created', 'points', 'link'];
  const formView = { kind: 'litzio-view', schemaVersion: 2, catalog: 'litzio-v2', profile: 'query', owner: 'fixture.issues', title: 'Issue search', refresh: 'manual', sources: { stats: { kind: "operation", operation: 'fixture.issues.read', version: 1, args: { preset: 'assigned-open' } } }, form: { component: 'InputForm', source: 'stats', fields: [{ component: 'Select', field: 'preset' }, { component: 'TextInput', field: 'text' }, { component: 'DateInput', field: 'since' }, { component: 'NumberInput', field: 'limit' }, { component: 'Checkbox', field: 'closed' }], submit: { component: 'SubmitButton', label: 'Search' } }, layout: { component: "Panel", direction: "vertical", children: [{ component: 'Table', title: 'Issues', source: 'stats', data: '/rows', columns: columns.slice(0, 5) }] } };
  const catalog = { operations: [{ operation: 'fixture.issues.read', version: 1, plugin: 'fixture.issues', rowSchema: Object.fromEntries(columns.map(c => [c, { type: 'string', label: c }])), inputSchema: { type: 'object', additionalProperties: false, required: ['preset'], properties: { preset: { type: 'string', title: 'Preset', description: 'Choose which issues to include.', enum: ['assigned-open', 'reported-open', 'assigned-all', 'reported-all', 'recent', 'all'] }, text: { type: 'string', title: 'Text', minLength: 3, pattern: '^[A-Za-z ]+$', maxLength: 20 }, since: { type: 'string', format: 'date', title: 'Since' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, closed: { type: 'boolean', title: 'Closed' }, form: { type: 'string', title: 'Form value', minLength: 3 } } } }] };

  await page.route('**/api/views', async route => {
    const body = route.request().postDataJSON();
    const receipt = { operation: `view.${body.action}`, version: 1, requestId: 'fixture-request', outcome: 'success', scope: 'host', timestamp: '2026-11-06T00:00:00Z' };
    const value = {receipt};
    if (body.action === 'catalog') { value.catalog = catalog; value.screens = [{plugin:'fixture.issues',id:'issues',title:'Fixture issues',icon:'Table',defaultViewIds:['issues'],primary:true}]; value.views = [{plugin:'fixture.issues',id:'issues',title:'Issue search',definition:formView}]; }
    if (body.action === 'run') {
      queries++; started = true; if (hold) await hold;
      if (unavailableView) return route.fulfill({ status: 400, json: { code: 'unavailable', errorKind: 'failed', error: 'SECRET removed column detail', receipt: { ...receipt, outcome: 'failure' } } });
      if (hostCommonRefusal) return route.fulfill({ status: 400, json: { code: 'invalid-input', inputIssues: [{ keyword: 'type' }], receipt: { ...receipt, outcome: 'failure' } } });
      if (hostInputRefusal) return route.fulfill({ status: 400, json: { code: 'invalid-input', inputIssues: [{ field: '/text', keyword: 'pattern' }], error: 'SECRET upstream rejected input', receipt: { ...receipt, outcome: 'failure' } } });
      if (fault) return route.fulfill({ status: 400, json: { errorKind: fault, error: 'SECRET token password upstream-body', receipt: { ...receipt, outcome: fault === 'uncertain' ? 'uncertain' : 'failure' } } });
      value.rows = empty ? [] : body.view.form ? [Object.fromEntries(columns.map(c => [c, c === 'summary' ? 'Review shared query controls' : c === 'key' ? 'ISSUE-42' : c === 'status' ? 'Open' : c === 'assignee' || c === 'reporter' ? 'Alex Kim' : c === 'updated' || c === 'created' ? '2026-11-06' : c === 'points' ? 5 : c === 'priority' ? 'High' : c === 'project' ? 'Editor' : c === 'type' ? 'Task' : 'ISSUE-42']))] : [];
      if (body.view.form) value.fields = { key: 'Issue key', summary: 'Summary', status: 'Status', assignee: 'Assignee', updated: 'Updated on', project: 'Project', priority: 'Priority', type: 'Type', reporter: 'Reporter', created: 'Created on', points: 'Points', link: 'Link' };
      latestRows = value.rows;
    }

    await route.fulfill({json:value});
  });
  await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  const initial = await (await page.request.get(new URL('/api/document',page.url()).href)).json();
  const root = initial.allowedRoots[0];
  await openFolderPicker(page); await page.getByTestId('folder-path').fill(root); await page.getByTestId('folder-open').click();
  await page.getByRole('dialog', {name:'Open folder',exact:true}).waitFor({state:'detached'});
  await openPath(page, root + '/fixture/a.md');
  const outline = page.getByRole('button',{name:'Outline',exact:true});
  if(await outline.getAttribute('aria-pressed') !== 'true') await outline.click();
  await expect(page.getByRole('tab',{name:'Views',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Document statistics',exact:true})).toHaveCount(0);
  if(screenshots) await page.screenshot({path:'tmp/1341-evidence/removed-surfaces-1440.png',mask:[page.locator('.sidebar-host-account')]});
  await page.locator('.sidebar').getByRole('button',{name:'Fixture issues',exact:true}).click();
  const generated = () => page.locator('[data-testid="plugin-query-view"]:visible');
  await expect(generated()).toBeVisible();
  expect(queries).toBe(0);
  await expect(generated().getByRole('button',{name:'Add to favorites',exact:true})).toHaveCount(0);
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
  await expect(generated().getByText('This query is unavailable. Check plugin settings.')).toBeVisible();
  await expect(generated()).not.toContainText('SECRET');
  unavailableView = false;
  hold = new Promise(resolve => { release = resolve; }); started = false;
  await generated().getByRole('combobox', { name: 'Preset *', exact: true }).selectOption('2');
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(generated().getByText(/Previous query result/)).toBeVisible();
  await expect(generated().getByText('Loading data…')).toBeVisible();
  release(); hold = undefined;
  await expect(generated().getByText('Loading data…')).toHaveCount(0);
  for (const [kind, message] of [['auth', 'Authentication required.'], ['forbidden', 'Access denied.'], ['not_found', 'Target not found.'], ['unavailable', 'Service unavailable.'], ['timeout', 'Operation timed out.'], ['uncertain', 'The outcome is unknown.']]) {
    fault = kind;
    await generated().getByRole('button', { name: 'Search', exact: true }).click();
    await expect(generated().getByText(message, { exact: false })).toBeVisible();
    await expect(generated()).not.toContainText('SECRET');
    await expect(generated().getByText(/Previous query result/)).toBeVisible();
  }
  fault = undefined; empty = true;
  await generated().getByRole('button', { name: 'Search', exact: true }).click();
  await expect(generated().getByText('No matching rows.', { exact: true })).toHaveCount(1);

  if (screenshots) for(const width of [1440,640]) {
    await page.evaluate(({dark})=>{localStorage.setItem('litzio.uiLanguage',dark?'ko':'en');localStorage.setItem('litzio.theme',dark?'dark':'light');},{dark:width===640});
    await page.setViewportSize({width,height:1000}); await page.reload();
    await page.locator('.sidebar').getByRole('button',{name:'Fixture issues',exact:true}).click();
    await expect(page.getByTestId('view-workspace').filter({visible:true})).toBeVisible();
    await page.screenshot({path:`tmp/1341-evidence/plugin-screen-${width}.png`,mask:[page.locator('.sidebar-host-account')]});
  }
}
