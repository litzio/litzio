async (page, { expect, openPath, reloadDocument, pluginFixture, screenshots, brand }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const sourceManifest = pluginFixture.document.replace(/[/\\]tmp[/\\]plugin-ui[/\\]document\.md$/, '/tmp/ai-agent-worker/manifest.json');
  expect((await page.request.post(origin + '/api/worker-plugins', { data: { manifest: sourceManifest } })).ok()).toBe(true);
  await page.reload();
  // Regression: activate in Korean, then switch to English without reactivation.
  await page.evaluate(prefix => localStorage.setItem(prefix + '.uiLanguage', 'ko'), brand.storagePrefix);
  await page.reload();
  // No model or account is used by browser tests; Host lifecycle is covered headlessly.
  let settings = { provider: 'codex', enabled: true, writeAccess: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'medium' };
  const models = [{ id: 'sol', model: 'gpt-6.1-sol', displayName: 'GPT Sol', description: 'General model', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium', 'high'].map(reasoningEffort => ({ reasoningEffort })) },
    { id: 'luna', model: 'gpt-6-luna', displayName: 'GPT Luna', description: 'Fast model', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }];
  let refreshes = 0, connectionAvailable = true;
  const settingsWrites = [];
  let settingsGate;
  await page.route('**/api/ai-agent-settings*', async route => {
    if (route.request().method() === 'GET') await settingsGate;
    if (route.request().method() === 'PUT') {
      const next = route.request().postDataJSON(); settingsWrites.push(next);
      if (!connectionAvailable && (next.model !== settings.model || next.reasoningEffort !== settings.reasoningEffort)) return route.fulfill({ status: 503, json: { error: 'Codex is disconnected.' } });
      settings = next;
    }
    return route.fulfill({ json: settings });
  });
  await page.route('**/api/ai-agent-models*', route => { refreshes++; return route.fulfill({ json: { provider: 'codex', models, updatedAt: 1793590000000 } }); });
  await page.route('**/api/ai-agent-environment*', route => route.fulfill({ json: { cwd: 'C:\\Users\\example\\AppData\\Roaming\\litzio\\assistant', instructions: 'C:\\Users\\example\\AppData\\Roaming\\litzio\\assistant\\AGENTS.md', skills: [] } }));
  await page.route('**/api/ai-agent-diagnostics*', route => route.fulfill({ json: { provider: 'codex', checkedAt: 1793590000000, path: 'C:\\Codex\\codex.exe', version: 'codex-cli 0.166.0', connected: true,
    account: { type: 'chatgpt', email: 'example@example.invalid', planType: 'plus' }, rateLimits: [{ name: 'Codex', windows: [{ usedPercent: 28, windowDurationMins: 300, resetsAt: 1793600000 }] }], mcp: [{ name: 'docs', status: 'connected', authStatus: 'oAuth' }] } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^(Settings|설정)$/ }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.getByTestId('settings-back').click();
  await openPath(page, pluginFixture.document);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const categories = page.getByRole('navigation', { name: 'Settings categories' });
  await categories.getByRole('button', { name: 'AI agent', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI agent', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Codex models', exact: true })).toContainText('Available');
  await page.getByRole('button', { name: 'Codex models', exact: true }).click();
  const modelDialog = page.getByRole('dialog', { name: 'Codex models', exact: true });
  await modelDialog.getByLabel('Search models', { exact: true }).fill('luna');
  await expect(modelDialog.getByText('GPT Luna', { exact: true })).toBeVisible();
  await expect(modelDialog.getByText('GPT Sol', { exact: true })).toHaveCount(0);
  await modelDialog.getByLabel('Search models', { exact: true }).fill('no-such-model');
  await expect(modelDialog.getByText('No matching models.', { exact: true })).toBeVisible();
  await modelDialog.getByLabel('Search models', { exact: true }).fill('');
  const beforeRefresh = refreshes;
  await modelDialog.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(modelDialog.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(refreshes).toBeGreaterThan(beforeRefresh);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/models-1440-light-en.png' });
  await page.keyboard.press('Escape');
  await expect(modelDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Codex models', exact: true })).toBeFocused();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByText('example@example.invalid · plus')).toBeVisible();
  await expect(page.getByText('docs · connected · oAuth', { exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/diagnostics-1440-light-en.png' });
  await page.getByRole('button', { name: '← AI agent', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Response language', exact: true })).toHaveValue('en');
  await page.getByRole('combobox', { name: 'Response language', exact: true }).selectOption('ja');
  await page.getByLabel('Model', { exact: true }).selectOption('gpt-6-luna');
  await expect(page.getByLabel('Reasoning effort', { exact: true })).toHaveValue('low');
  connectionAvailable = false;
  await page.getByRole('switch', { name: 'Use Codex', exact: true }).click();
  await expect.poll(() => settingsWrites.length).toBe(1);
  expect(settingsWrites[0]).toEqual({ provider: 'codex', enabled: false, writeAccess: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'medium' });
  await expect(page.getByRole('switch', { name: 'Use Codex', exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('gpt-6-luna');
  await expect(page.getByRole('button', { name: 'Save AI settings', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Codex models', exact: true })).toContainText('Off');
  connectionAvailable = true;
  await page.getByRole('switch', { name: 'Use Codex', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Codex models', exact: true })).toContainText('Available');
  expect(settingsWrites[1]).toEqual({ provider: 'codex', enabled: true, writeAccess: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'medium' });
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('gpt-6-luna');
  await expect(page.getByLabel('Reasoning effort', { exact: true })).toHaveValue('low');
  const measure = () => page.locator('.settings-content-inner').evaluate(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width }));
  await page.getByLabel('Model', { exact: true }).selectOption('gpt-6-luna');
  await expect(page.getByLabel('Reasoning effort', { exact: true })).toHaveValue('low');
  await expect(page.getByLabel('Reasoning effort', { exact: true }).locator('option')).toHaveText(['low']);
  await page.getByLabel('Model', { exact: true }).selectOption('gpt-6.1-sol');
  await page.getByLabel('Reasoning effort', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Save AI settings', exact: true }).click();
  await expect(page.getByText('AI settings saved.', { exact: true })).toBeVisible();
  expect(settings).toEqual({ provider: 'codex', enabled: true, writeAccess: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'high', responseLanguage: 'ja' });
  const aiGeometry = await measure();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/ai-1440-light-en.png' });
  await categories.getByRole('button', { name: 'Docling', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Docling server', exact: true })).toBeVisible();
  expect(await measure()).toEqual(aiGeometry);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/docling-1440-light-en.png' });
  await categories.getByRole('button', { name: 'Appearance & language', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
  await page.setViewportSize({ width: 640, height: 1000 });
  await page.getByRole('button', { name: 'AI 에이전트', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Codex 모델', exact: true })).toContainText('사용 가능');
  await expect(page.getByLabel('모델', { exact: true })).toHaveValue('gpt-6.1-sol');
  await expect(page.getByLabel('추론 강도', { exact: true })).toHaveValue('high');
  await expect(page.getByLabel('추론 강도', { exact: true }).locator('option')).toHaveText(['보통', '높음']);
  expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/ai-640-dark-ko.png' });
  await page.getByRole('button', { name: 'Codex 모델', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Codex 모델', exact: true })).toBeVisible();
  expect(await page.getByRole('dialog', { name: 'Codex 모델', exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/models-640-dark-ko.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Codex 모델', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Codex 모델', exact: true })).toBeFocused();
  await page.getByTestId('settings-dialog').getByRole('button', { name: '진단', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Codex 진단', exact: true })).toBeVisible();
  await expect(page.getByText('docs · 연결됨 · OAuth', { exact: true })).toBeVisible();
  expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/diagnostics-640-dark-ko.png' });
  await page.getByRole('button', { name: '← AI 에이전트', exact: true }).click();
  await page.getByRole('button', { name: 'Docling', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Docling 서버', exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/docling-640-dark-ko.png' });
  await page.getByTestId('settings-back').click();
  const editor = page.locator('.document-scroll[data-active=true] .ProseMirror');
  await editor.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' preserved AI-off draft');
  await editor.evaluate(element => { globalThis.__aiOrdinaryDocument = element; });
  const list = await (await page.request.get(origin + '/api/worker-plugins')).json();
  const ai = list.find(item => item.id === 'ai-agent');
  try {
    const disabled = await page.request.delete(origin + '/api/worker-plugins', { data: { id: ai.id } }); expect(disabled.ok(), await disabled.text()).toBe(true);
    await expect.poll(async () => (await (await page.request.get(origin + '/api/ai-task-service')).json()).available).toBe(false);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('button', { name: 'AI 에이전트', exact: true })).toHaveCount(0);
    await page.getByTestId('settings-back').click();
    expect(await editor.evaluate(element => element === globalThis.__aiOrdinaryDocument)).toBe(true);
    await expect(editor).toContainText('preserved AI-off draft');
    await editor.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' still editable');
    await expect(editor).toContainText('still editable');
  } finally {
    // The existing installed directory has no source manifest. Re-registration uses
    // the source bundle supplied by the same local development Host composition.
    const sourceManifest = pluginFixture.document.replace(/[/\\]tmp[/\\]plugin-ui[/\\]document\.md$/, '/tmp/ai-agent-worker/manifest.json');
    const restored = await page.request.post(origin + '/api/worker-plugins', { data: { manifest: sourceManifest } }); expect(restored.ok(), await restored.text()).toBe(true);
    // These preferences survive page teardown; the next scenario starts in English Light.
    await page.evaluate(prefix => {
      localStorage.setItem(prefix + '.uiLanguage', 'en');
      localStorage.setItem(prefix + '.theme', 'light');
    }, brand.storagePrefix);
  }
  // Panel integration uses the same installed plugin and ordinary unsaved document.
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '표시·언어', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.getByTestId('settings-back').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId('save').click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation', 'saved');
  await page.reload();
  await expect(editor).toContainText('still editable');
  await editor.locator('p').first().click(); await page.keyboard.press('End');
  await page.keyboard.type(' fresh assistant draft');
  const sent = [], conversations = new Map();
  let selected, sequence = 0, setupMode = 'ready', snapshots = 0, snapshotGate;
  await page.unroute('**/api/ai-agent-diagnostics*');
  await page.route('**/api/ai-agent-diagnostics*', route => route.fulfill({ json: { provider: 'codex', connected: setupMode !== 'missing',
    error: setupMode === 'missing' ? 'Codex CLI is unavailable on the Host.' : undefined,
    account: setupMode === 'login' ? null : { type: 'chatgpt' } } }));
  await page.route('**/api/ai-agent-conversations*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'resume') selected = conversations.get(body.id);
      if (body.action === 'send') {
        sent.push(body);
        if (!body.id) { selected = { id: 'thread-' + (++sequence), title: body.message, folders: body.folders, createdAt: 1793590000000,
          updatedAt: 1793590000000, model: body.model, reasoningEffort: body.reasoningEffort, responseLanguage: body.responseLanguage, turns: [] }; conversations.set(selected.id, selected); }
        else selected = conversations.get(body.id);
        let turn = selected.turns.find(turn => turn.status === 'inProgress');
        if (!turn) { turn = { id: 'turn-' + sent.length, status: 'inProgress', items: [] }; selected.turns.push(turn); }
        turn.items.push({ id: 'user-' + sent.length, kind: 'user', text: body.message });
        if (turn.items.length === 1) turn.items.push({ id: 'summary-' + sent.length, kind: 'reasoning', text: 'Checking the document and opened folders.' },
          { id: 'tool-' + sent.length, kind: 'tool', text: 'create_document', status: 'completed', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ path: pluginFixture.document, revision: 'fixture-created-revision' }) }] } },
          { id: 'answer-' + sent.length, kind: 'assistant', text: 'Partial answer' });
        else turn.items.push({ id: 'steer-' + sent.length, kind: 'plan', text: 'Direction updated: focus on the unsaved paragraph.' });
        selected.responseLanguage = body.responseLanguage;
        selected.tokenUsage = { used: 810, limit: 1000 };
      }
      if (body.action === 'interrupt') selected.turns.at(-1).status = 'interrupted';
      return route.fulfill({ json: selected });
    }
    const id = route.request().url().split('?id=')[1];
    if (id) { snapshots++; await snapshotGate; }
    return route.fulfill({ json: id ? conversations.get(decodeURIComponent(id)) : [...conversations.values()].map(({ turns, tokenUsage, ...info }) => info) });
  });
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/closed-1440-light-en.png' });
  await editor.locator('p').first().click(); await page.keyboard.press('End');
  await editor.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Process', code: 'KeyY', keyCode: 229, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
  expect(await page.getByTestId('assistant-panel').isVisible()).toBe(false);
  let releaseSettings;
  settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  await page.keyboard.press('Control+Shift+Y');
  const panel = page.getByTestId('assistant-panel');
  await expect(panel).toBeVisible();
  const message = panel.getByRole('textbox', { name: 'Message assistant' });
  await expect(message).toBeDisabled();
  releaseSettings(); settingsGate = undefined;
  await expect(message).toBeEnabled();
  expect(await message.evaluate(element => document.activeElement === element), 'First open focuses the enabled assistant input').toBe(true);
  await page.keyboard.type('Assistant keyboard input');
  expect(await message.inputValue(), 'Typing after opening goes to the assistant').toBe('Assistant keyboard input');
  expect(await editor.textContent()).not.toContain('Assistant keyboard input');
  await message.fill('');
  // At intermediate widths the assistant remains modal; closing restores the center.
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
    await expect(page.locator('.notification-center')).toBeVisible();
    if (screenshots) await page.screenshot({ path: `tmp/970-assistant-${width}-closed.png` });
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(message).toBeEnabled();
    if (width === 1024) await expect(page.locator('.notification-center')).toBeHidden();
    if (screenshots) await page.screenshot({ path: `tmp/970-assistant-${width}-open.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(panel.getByRole('button', { name: 'Conversation model and language' })).toContainText('gpt-6.1-sol');
  await expect(panel.getByRole('button', { name: 'Response language', exact: true })).toHaveText('日本語');
  await panel.getByRole('button', { name: 'Response language', exact: true }).click();
  await page.getByRole('combobox', { name: 'Response language', exact: true }).selectOption('en');
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Conversation model and language' })).toBeFocused();
  expect(settings.responseLanguage).toBe('ja');
  const initialWidth = await panel.evaluate(element => element.getBoundingClientRect().width);
  const resize = panel.getByRole('separator'); await resize.focus(); await page.keyboard.press('ArrowLeft');
  await expect(resize).toHaveAttribute('aria-valuenow', String(Math.min(560, initialWidth + 20)));
  const wide = await panel.evaluate(element => element.getBoundingClientRect().width);
  expect(wide).toBe(Math.min(560, initialWidth + 20));
  const notification = page.locator('.notification-center');
  for (const expanded of [false, true]) {
    const bell = notification.locator(':scope > button');
    if (await bell.getAttribute('aria-expanded') !== String(expanded)) await bell.click();
    if (screenshots) await page.screenshot({ path: `tmp/970-assistant-1440-${expanded ? 'list' : 'bell'}.png` });
    const bounds = await notification.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual((await panel.boundingBox()).x - 16);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
  }
  await notification.locator(':scope > button').click();
  await message.fill('What changed in the current document?'); await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByText('Partial answer', { exact: true })).toBeVisible();
  await expect(panel.locator('[data-kind=tool]').filter({ hasText: 'create_document' })).toContainText('Completed');
  expect(sent[0].document.source).toContain('preserved AI-off draft');
  expect(sent[0].document.source).toContain('still editable');
  expect(sent[0].document.path).toBe(pluginFixture.document);
  expect(sent[0].responseLanguage).toBe('en');
  await expect(panel.getByRole('button', { name: 'Conversation model and language' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Response language', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Reasoning effort', exact: true })).toBeDisabled();
  // Escape can arrive while focus is still on the language chip, before popup autofocus.
  await panel.getByRole('button', { name: 'Response language', exact: true }).focus();
  await page.keyboard.press('Escape');
  expect(await panel.isVisible(), 'Escape dismisses choices before the assistant').toBe(true);
  await expect(page.getByRole('combobox', { name: 'Reasoning effort', exact: true })).toBeHidden();
  selected.turns[0].items.find(item => item.kind === 'assistant').text = 'The unsaved paragraph adds a clear qualification. Check the stated conditions before using the conclusion.';
  await expect(panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false })).toBeVisible();
  await message.fill('Focus on the unsaved paragraph.'); await panel.getByRole('button', { name: 'Steer conversation' }).click();
  await expect(panel.getByText('Direction updated: focus on the unsaved paragraph.', { exact: true })).toBeVisible();
  expect(sent[1].id).toBe('thread-1');
  await expect(panel.getByText('Context is nearly full. Start a new conversation soon.', { exact: true })).toBeVisible();
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText('810 / 1,000 tokens · 81%');
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/running-1440-light-en.png' });
  await panel.getByRole('button', { name: 'Stop response' }).click();
  await expect(panel.getByRole('button', { name: 'Conversation model and language' })).toBeEnabled();
  // Assert direct completion state, without a reload or a polling assertion masking it.
  expect(await panel.locator('details').evaluate(element => element.open)).toBe(false);
  expect(await panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false }).isVisible()).toBe(true);
  const originalItems = selected.turns[0].items;
  const emptyItems = [{ id: 'empty-summary', kind: 'reasoning', text: ' \n ' },
    { id: 'empty-answer', kind: 'assistant', text: 'Completed without a reasoning summary.' }];
  selected.turns[0].items = emptyItems;
  await expect(panel.getByText('Completed without a reasoning summary.', { exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/976-evidence/empty-1440.png' });
  const emptyDisclosureCount = await panel.locator('details').count();
  selected.turns[0].items = originalItems;
  await expect(panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false })).toBeVisible();
  // Inject visibility explicitly: headless tab activation does not reliably hide a page.
  const visibility = async value => page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
  await visibility('hidden');
  // Let any already admitted snapshot settle, then observe two polling intervals.
  await page.waitForTimeout(700);
  const hiddenSnapshots = snapshots;
  await page.waitForTimeout(1300);
  expect(snapshots, 'Hidden tabs stop snapshot requests').toBe(hiddenSnapshots);
  let releaseSnapshot;
  snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; });
  await visibility('visible');
  await expect.poll(() => snapshots).toBeGreaterThan(hiddenSnapshots);
  const resumedSnapshots = snapshots;
  await visibility('hidden'); await visibility('visible'); await visibility('visible');
  await page.waitForTimeout(1300);
  expect(snapshots, 'Visibility changes do not overlap an in-flight snapshot').toBe(resumedSnapshots);
  releaseSnapshot(); snapshotGate = undefined;
  await expect.poll(() => snapshots).toBeGreaterThan(resumedSnapshots);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  settings.enabled = false;
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(panel.getByText('Codex is disabled.', { exact: true })).toBeVisible();
  const offSnapshots = snapshots;
  await page.waitForTimeout(1300);
  expect(snapshots, 'Disabled Codex stops snapshot requests').toBe(offSnapshots);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  settings.enabled = true; setupMode = 'login';
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(panel.getByText('Sign in to Codex to start a conversation.', { exact: true })).toBeVisible();
  const setupSnapshots = snapshots;
  await page.waitForTimeout(1300);
  expect(snapshots, 'Setup failure stops snapshot requests').toBe(setupSnapshots);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  setupMode = 'ready';
  settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(message).toBeDisabled();
  await resize.focus();
  releaseSettings(); settingsGate = undefined;
  await expect(message).toBeEnabled();
  expect(await resize.evaluate(element => document.activeElement === element), 'Setup completion preserves a later focus move').toBe(true);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  await page.keyboard.press('Control+Shift+Y');
  await expect(message).toBeDisabled();
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await expect(editor).toBeFocused();
  releaseSettings(); settingsGate = undefined;
  // A new opening gets its own setup; the earlier response cannot focus a closed panel.
  await page.keyboard.press('Control+Shift+Y');
  await expect(message).toBeEnabled();
  expect(await message.evaluate(element => document.activeElement === element)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/stopped-1440-light-en.png' });
  await panel.getByRole('button', { name: 'New conversation' }).click();
  await expect(panel.getByRole('button', { name: 'Response language', exact: true })).toHaveText('日本語');
  await panel.getByRole('button', { name: 'Conversation history' }).click();
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/history-1440-light-en.png' });
  await panel.getByRole('button', { name: /What changed in the current document/ }).click();
  await expect(panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Response language', exact: true })).toHaveText('English');
  const markdownSource = '# 답변 요약\n\n**중요한 조건**과 $x^2$를 확인합니다.[^n]\n\n- 첫 번째 항목\n- 두 번째 항목\n\n```js\nconst answer = "' + 'long-code-'.repeat(30) + '";\n```\n\n| 항목 | 설명 |\n| --- | --- |\n| 표 | ' + '긴내용'.repeat(70) + ' |\n\n$$\na+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z\n$$\n\n[공식 안내](https://example.com/docs)\n\n[^n]: 답변 각주';
  selected.turns[0].status = 'inProgress';
  const streamingAnswer = selected.turns[0].items.find(item => item.kind === 'assistant');
  streamingAnswer.text = '```js\nconst partial = 1';
  await expect(panel.locator('.assistant-answer pre code')).toHaveText('const partial = 1');
  streamingAnswer.text += ';\n```\n\n$x';
  await expect(panel.locator('.assistant-answer')).toContainText('$x');
  streamingAnswer.text += '^2$';
  await expect(panel.locator('.assistant-answer .katex')).toBeVisible();
  selected.turns[0].status = 'completed';
  selected.turns[0].items.find(item => item.kind === 'assistant').text = markdownSource;
  const answer = panel.locator('.assistant-answer');
  await expect(answer.getByRole('heading', { name: '답변 요약' })).toBeVisible();
  await expect(answer.locator('.katex').first()).toBeVisible();
  // Windows clipboard normalizes LF to CRLF; compare logical text after OS readback.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await answer.getByRole('button', { name: 'Copy answer', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n')))).toBe(markdownSource);
  await expect(answer.getByRole('button', { name: 'Copy answer', exact: true })).toHaveText('Copied');
  await answer.getByRole('button', { name: 'Copy code', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n')))).toBe('const answer = "' + 'long-code-'.repeat(30) + '";\n');
  await page.evaluate(() => {
    globalThis.__assistantOpened = [];
    globalThis.__assistantOpen = window.open;
    window.open = (...args) => { globalThis.__assistantOpened.push(args); return null; };
  });
  try {
    await answer.getByRole('link', { name: '공식 안내' }).click();
    expect(await page.evaluate(() => globalThis.__assistantOpened)).toEqual([['https://example.com/docs', '_blank', 'noopener']]);
  } finally { await page.evaluate(() => { window.open = globalThis.__assistantOpen; }); }
  const renderedText = await answer.locator('.assistant-markdown').innerText();
  await panel.getByRole('button', { name: 'New conversation' }).click();
  await panel.getByRole('button', { name: 'Conversation history' }).click();
  await panel.getByRole('button', { name: /What changed in the current document/ }).click();
  await expect(answer.getByRole('heading', { name: '답변 요약' })).toBeVisible();
  expect(await answer.locator('.assistant-markdown').innerText()).toBe(renderedText.replace(/Copied/g, 'Copy code'));
  await answer.getByRole('button', { name: 'Copy answer', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n')))).toBe(markdownSource);

  if (screenshots) {
    for (const theme of ['light', 'dark']) {
      await panel.getByRole('button', { name: 'Close assistant' }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByTestId('theme').selectOption(theme);
      await page.getByTestId('ui-language').selectOption('ko');
      await page.getByTestId('settings-back').click();
      await page.keyboard.press('Control+Shift+Y');
      for (const width of [1440, 640]) {
        await page.setViewportSize({ width, height: 1000 });
        await panel.locator('.assistant-transcript').evaluate(element => { element.scrollTop = 0; });
        expect(await panel.locator('.assistant-transcript').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: `tmp/982-evidence/${width}-${theme}.png` });
        await answer.getByRole('button', { name: '답변 복사', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `tmp/982-evidence/${width}-${theme}-bottom.png` });
      }
      await panel.getByRole('button', { name: '비서 닫기' }).click();
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await page.getByTestId('ui-language').selectOption('en');
      await page.getByTestId('settings-back').click();
      await page.keyboard.press('Control+Shift+Y');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await panel.getByRole('button', { name: 'Close assistant' }).click();
    await editor.click();
    await page.keyboard.press('Control+Shift+Y');
  }
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.type(' after assistant'); await expect(editor).toContainText('after assistant');
  await page.keyboard.press('Control+Shift+Y'); await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => element.getBoundingClientRect().width)).toBe(wide);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: 'Find documents and commands', exact: true }).click();
  await page.getByRole('combobox').fill('> Assistant');
  await page.getByRole('option', { name: /Assistant/ }).click(); await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  // A closed narrow-window assistant stays mounted to retain its conversation.
  // Reload must observe the real discard prompt, not that hidden dialog.
  await page.setViewportSize({ width: 640, height: 1000 });
  const expandExplorer = page.getByRole('button', { name: 'Expand Explorer', exact: true });
  if (await expandExplorer.isVisible()) await expandExplorer.click();
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('.top-bar').getBoundingClientRect();
    const search = document.querySelector('.command-center-trigger').getBoundingClientRect();
    const assistant = document.querySelector('.assistant-trigger').getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth && assistant.right <= innerWidth &&
      search.right <= assistant.left && Math.abs(search.left + search.width / 2 - header.left - header.width / 2) < 1;
  }), { message: 'Search stays centered and Assistant fits with Explorer expanded at 640px' }).toBe(true);
  await reloadDocument(page);
  await expect(page.getByRole('dialog', { name: 'Discard local changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard local changes?' })).toHaveCount(0);
  await expect(editor).toContainText('after assistant');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation', 'saved');
  await reloadDocument(page);
  await expect(page.getByRole('button', { name: 'File actions', exact: true })).toBeFocused();
  await expect(editor).toContainText('after assistant');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Appearance & language', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
  await page.getByTestId('settings-back').click();
  await page.setViewportSize({ width: 640, height: 1000 });
  await editor.locator('p').first().click();
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await panel.getByRole('textbox').evaluate(element => document.activeElement === element)).toBe(true);
  expect(await panel.evaluate(element => ({ width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth }))).toEqual({ width: 640, overflow: false });
  expect(await page.locator('.app-main').evaluate(element => element.inert)).toBe(true);
  await expect(panel.getByRole('button', { name: '대화 모델과 언어' })).toContainText('높음');
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/assistant-640-dark-ko.png' });
  selected.turns[0].items = emptyItems;
  await expect(panel.getByText('Completed without a reasoning summary.', { exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/976-evidence/empty-640.png' });
  expect(emptyDisclosureCount, 'Empty reasoning must not offer a disclosure at 1440px').toBe(0);
  expect(await panel.locator('details').count(), 'Empty reasoning must not offer a disclosure in restored history at 640px').toBe(0);
  selected.turns[0].items = originalItems;

  await panel.getByRole('button', { name: '비서 닫기' }).click(); await expect(editor).toBeFocused();
  expect(await page.locator('.app-main').evaluate(element => element.inert)).toBe(false);
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/closed-640-dark-ko.png' });
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await panel.getByRole('button', { name: '새 대화' }).click();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  setupMode = 'login'; await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByText('대화를 시작하려면 Codex에 로그인하세요.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox')).toBeDisabled();
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/setup-640-dark-ko.png' });
  await panel.getByRole('button', { name: 'AI 설정 열기' }).click();
  await expect(page.getByRole('heading', { name: 'AI 에이전트', exact: true }).last()).toBeVisible();
  await page.getByTestId('settings-back').click();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  setupMode = 'missing'; await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByText('이 컴퓨터에서 Codex CLI를 찾을 수 없습니다. 설치 후 설정에서 진단을 실행하세요.', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  // Restore preferences for the other stable scenarios.
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'en'); localStorage.setItem(prefix + '.theme', 'light'); localStorage.removeItem(prefix + '.assistantWidth'); }, brand.storagePrefix);
  return { settings: true, minimumViewport: true, nativeDocumentPreserved: true, conversations: true };
}
