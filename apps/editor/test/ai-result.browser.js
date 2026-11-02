async (page, { expect, openFolderPicker, pluginFixture, fileActionsRoot, screenshots, brand, activeDocument }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const manifest = pluginFixture.document.replace(/[/\\]tmp[/\\]plugin-ui[/\\]document\.md$/, '/tmp/ai-agent-worker/manifest.json');
  expect((await page.request.post(origin + '/api/worker-plugins', { data: { manifest } })).ok()).toBe(true);
  await page.reload();
  const root = fileActionsRoot, sep = root.includes('\\') ? '\\' : '/';
  const paths = ['a.md', 'b.md', 'race-delete.md'].map(name => root + sep + name);
  const settings = { provider: 'codex', enabled: true, writeAccess: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'medium', responseLanguage: 'en' };
  await page.route('**/api/ai-agent-settings*', route => route.fulfill({ json: settings }));
  await page.route('**/api/ai-agent-models*', route => route.fulfill({ json: { provider: 'codex', models: [{ id: 'sol', model: settings.model, displayName: 'GPT Sol', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] }] } }));
  await page.route('**/api/ai-agent-diagnostics*', route => route.fulfill({ json: { provider: 'codex', connected: true, account: { type: 'chatgpt' } } }));
  const files = await Promise.all(paths.map(async path => (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(path))).json()));
  const conversation = { id: 'created-thread', title: 'Create a document', folders: [root], createdAt: Date.now(), updatedAt: Date.now(), ...settings,
    turns: [{ id: 'created-turn', status: 'completed', items: [{ id: 'answer', kind: 'assistant', text: 'Created documents. A suggestion mentioning /untrusted.md is only text.' },
      ...files.map((file, i) => ({ id: 'created-' + i, kind: 'tool', text: 'create_document', status: 'completed', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ path: file.path, revision: i === 2 ? '0'.repeat(64) : file.revision }) }] } }))] }] };
  let resumes = 0;
  await page.route('**/api/ai-agent-conversations*', route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'resume') resumes++;
    return route.fulfill({ json: route.request().method() === 'GET' && !route.request().url().includes('?id=') ? [conversation] : conversation });
  });
  await openFolderPicker(page); await page.getByTestId('folder-path').fill(root + sep); await page.getByTestId('folder-open').click();
  await page.getByRole('treeitem', { name: 'a.md', exact: true }).click(); await expect(activeDocument(page)).toContainText('Alpha.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  const panel = page.getByTestId('assistant-panel');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('textbox').fill('Create a document'); await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  const cards = panel.getByTestId('assistant-result');
  await expect(cards).toHaveCount(3);
  const card = name => cards.filter({ has: page.locator('span', { hasText: name }) });
  await card('a.md').getByRole('button', { name: 'Open', exact: true }).click();
  await expect(activeDocument(page)).toContainText('Alpha.');
  if (screenshots) await page.screenshot({ path: 'tmp/931-result-evidence/result-1440-light-en.png' });
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled(); expect(resumes).toBeGreaterThan(0); await expect(cards).toHaveCount(3);
  await card('a.md').getByRole('button', { name: 'Undo creation' }).click();
  await expect(card('a.md')).toContainText('Created file deleted');
  expect(await page.getByRole('dialog', { name: 'Undo document creation?' }).count()).toBe(0);
  expect((await page.request.get(origin + '/api/document?path=' + encodeURIComponent(paths[0]))).ok()).toBe(false);
  await card('b.md').getByRole('button', { name: 'Open', exact: true }).click();
  const editor = activeDocument(page); await expect(editor).toContainText('Beta.');
  await editor.locator('.tiptap p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' unsaved change');
  await card('b.md').getByRole('button', { name: 'Undo creation' }).click();
  const confirm = page.getByRole('dialog', { name: 'Undo document creation?' });
  await expect(confirm).toBeVisible(); await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).toBeHidden(); await expect(editor).toContainText('unsaved change');
  await card('b.md').getByRole('button', { name: 'Undo creation' }).click(); await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete and discard changes' }).click();
  await expect(card('b.md')).toContainText('Created file deleted');
  // Changed disk needs confirmation even with no open tab.
  await card('race-delete.md').getByRole('button', { name: 'Undo creation' }).click(); await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(confirm).toBeHidden();
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark'); await page.getByTestId('settings-back').click();
  await page.getByRole('button', { name: '비서', exact: true }).click(); await expect(panel.getByRole('textbox')).toBeEnabled();
  if (screenshots) await page.screenshot({ path: 'tmp/931-result-evidence/result-1440-dark-ko.png' });
  await page.setViewportSize({ width: 640, height: 1000 });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/931-result-evidence/result-640-dark-ko.png' });
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'en'); localStorage.setItem(prefix + '.theme', 'light'); }, brand.storagePrefix);
  return { receiptCards: true, resumed: true, cleanUndo: true, dirtyConfirmation: true, diskConfirmation: true };
}
