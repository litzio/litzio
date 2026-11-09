async (page, { expect, openPath, openDocument, reloadDocument, assistantFixture, screenshots, brand }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  await page.reload();
  // Regression: activate in Korean, then switch to English without reactivation.
  await page.evaluate(prefix => localStorage.setItem(prefix + '.uiLanguage', 'ko'), brand.storagePrefix);
  await page.reload();
  // No model or account is used by browser tests; Host lifecycle is covered headlessly.
  let settings = { provider: 'codex', permissionMode: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'medium' };
  const models = [{ id: 'sol', model: 'gpt-6.1-sol', displayName: 'GPT Sol', description: 'General model', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium', 'high'].map(reasoningEffort => ({ reasoningEffort })) },
    { id: 'luna', model: 'gpt-6-luna', displayName: 'GPT Luna', description: 'Fast model', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }];
  let skillsFail = false, longSkills = false, skillLookups = 0;
  const skill = { name: 'litzio-guide', path: 'C:/assistant/.agents/skills/litzio-guide/SKILL.md', description: 'Explain Litzio documents and assistant tools' };
  await page.route('**/api/assistant/skills*', route => { skillLookups++; return route.fulfill(skillsFail ? { status: 503, json: { error: 'Skills unavailable' } } : { json: { skills: longSkills ? Array.from({ length: 24 }, (_, index) => ({ ...skill, name: `scroll-skill-${index}`, path: skill.path + index })) : [skill], errors: [] } }); });
  const copilotOptions = { reasoningEffortSource: 'cli', currentMode: 'agent', modes: [{ id: 'agent', name: 'Agent', description: '' }, { id: 'plan', name: 'Plan', description: '' }] };
  const copilotModels = ['auto', 'copilot-model'].map(id => ({ id, model: id, displayName: id === 'auto' ? 'Auto' : 'Copilot fixture model', description: '', supportedReasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(reasoningEffort => ({ reasoningEffort })), defaultReasoningEffort: 'medium' }));
  let refreshes = 0, connectionAvailable = true;
  const settingsWrites = [];
  let settingsGate, writeGate, failSave = false;
  await page.route('**/api/assistant/settings*', async route => {
    if (route.request().method() === 'GET') await settingsGate;
    if (route.request().method() === 'PUT') {
      const next = route.request().postDataJSON(); settingsWrites.push(next);
      await writeGate;
      if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { error: 'Fixture save failure' } }); }
      if (!connectionAvailable && (next.model !== settings.model || next.reasoningEffort !== settings.reasoningEffort)) return route.fulfill({ status: 503, json: { error: 'Codex is disconnected.' } });
      settings = next;
    }
    return route.fulfill({ json: settings });
  });
  await page.route('**/api/assistant/models*', route => { refreshes++; const copilot = route.request().url().includes('provider=copilot') || !route.request().url().includes('provider=') && settings.provider === 'copilot'; return route.fulfill({ json: { provider: copilot ? 'copilot' : 'codex', ...(copilot ? { copilot: copilotOptions } : {}), models: copilot ? copilotModels : models, updatedAt: 1793590000000 } }); });
  await page.route('**/api/assistant/environment*', route => route.fulfill({ json: { cwd: 'C:\\Users\\example\\AppData\\Roaming\\litzio\\assistant', instructions: 'C:\\Users\\example\\AppData\\Roaming\\litzio\\assistant\\AGENTS.md', skills: [] } }));
  await page.route('**/api/assistant/diagnostics*', route => route.fulfill({ json: { provider: 'codex', checkedAt: 1793590000000, path: 'C:\\Codex\\codex.exe', version: 'codex-cli 0.166.0', connected: true,
    account: { type: 'chatgpt', email: 'example@example.invalid', planType: 'plus' }, rateLimits: [{ name: 'Codex', windows: [{ usedPercent: 28, windowDurationMins: 300, resetsAt: 1793600000 }] }], mcp: [{ name: 'docs', status: 'connected', authStatus: 'oAuth' }] } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^(Settings|설정)$/ }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await openPath(page, assistantFixture.document);
  // #1025: one shell integration case complements the Assistant separator check below.
  // Real drag/keyboard input catches edge direction, bounds and independent remembered widths.
  const sidebarResize = page.getByRole('separator', { name: 'Explorer width', exact: true });
  const documentResize = page.getByRole('separator', { name: 'Document panel width', exact: true });
  const drag = async (handle, delta) => {
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  };
  await drag(sidebarResize, 20);
  await expect(sidebarResize).toHaveAttribute('aria-valuenow', '260');
  await documentResize.focus(); await page.keyboard.press('ArrowLeft');
  await expect(documentResize).toHaveAttribute('aria-valuenow', '276');
  await drag(documentResize, -100);
  await expect(documentResize).toHaveAttribute('aria-valuenow', '280');
  await page.reload();
  await expect(sidebarResize).toHaveAttribute('aria-valuenow', '260');
  await expect(documentResize).toHaveAttribute('aria-valuenow', '280');
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(sidebarResize).toHaveAttribute('aria-valuenow', '200');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(sidebarResize).toHaveAttribute('aria-valuenow', '260');
  await page.evaluate(prefix => { localStorage.removeItem(prefix + '.sidebarWidth'); localStorage.removeItem(prefix + '.document-panelWidth'); }, brand.storagePrefix);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const categories = page.getByRole('navigation', { name: /^(Settings categories|설정 분류)$/ });
  await categories.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assistant', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Codex models', exact: true })).toContainText('Available');
  await expect(page.getByRole('button', { name: 'Copilot models', exact: true })).toContainText('Available');
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
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Diagnostics', exact: true }).first().click();
  await expect(page.getByText('example@example.invalid · plus')).toBeVisible();
  await expect(page.getByText('docs · connected · oAuth', { exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/diagnostics-1440-light-en.png' });
  await page.getByRole('button', { name: '← Assistant', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'AI default language', exact: true })).toHaveValue('en');
  // Delayed storage is the regression input: ordinary edits stay usable and queue.
  let releaseWrite;
  writeGate = new Promise(resolve => { releaseWrite = resolve; });
  const beforeQueue = settingsWrites.length;
  await page.getByRole('combobox', { name: 'AI default language', exact: true }).selectOption('ja');
  await page.getByLabel('Model', { exact: true }).selectOption('gpt-6-luna');
  await expect(page.getByLabel('Reasoning effort', { exact: true })).toHaveValue('low');
  await expect(page.getByRole('button', { name: 'Copilot models', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Assistant settings', exact: true })).toHaveCount(0);
  expect(settingsWrites.length).toBe(beforeQueue + 1);
  failSave = true; // An older failed snapshot must not leave an error after the queued latest save succeeds.
  writeGate = undefined; releaseWrite();
  await expect.poll(() => settings.model).toBe('gpt-6-luna');
  expect(settings.responseLanguage).toBe('ja');
  await expect(page.getByRole('alert')).toHaveCount(0);
  failSave = true;
  await page.getByLabel('Permission mode', { exact: true }).selectOption('read-only');
  await expect(page.getByRole('alert')).toHaveText('Could not save Assistant settings.');
  expect(settings.permissionMode).toBe('opened-folders');
  failSave = false;
  await page.getByLabel('Permission mode', { exact: true }).selectOption('opened-folders');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const measure = () => page.locator('.settings-content-inner').evaluate(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width }));
  await page.getByLabel('Model', { exact: true }).selectOption('gpt-6-luna');
  await expect(page.getByLabel('Reasoning effort', { exact: true })).toHaveValue('low');
  await expect(page.getByLabel('Reasoning effort', { exact: true }).locator('option')).toHaveText(['low']);
  await page.getByLabel('Model', { exact: true }).selectOption('gpt-6.1-sol');
  await page.getByLabel('Reasoning effort', { exact: true }).selectOption('high');
  await expect.poll(() => settings.reasoningEffort).toBe('high');
  const writesBeforeSwitch = settingsWrites.length;
  const documentTab = page.getByRole('tab').filter({hasNotText:'Settings'}).first();
  await documentTab.click();
  await page.getByRole('tab',{name:'Settings',exact:true}).click();
  await expect(page.getByLabel('Reasoning effort',{exact:true})).toHaveValue('high');
  expect(settingsWrites.length).toBe(writesBeforeSwitch);

  await expect.poll(() => settings.reasoningEffort).toBe('high');
  expect(settings).toEqual({ provider: 'codex', permissionMode: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'high', responseLanguage: 'ja' });
  const aiGeometry = await measure();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/ai-1440-light-en.png' });
  await categories.getByRole('button', { name: 'Appearance & language', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
  await page.setViewportSize({ width: 640, height: 1000 });
  await categories.getByRole('button', { name: '비서', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Codex 모델', exact: true })).toContainText('사용 가능');
  await expect(page.getByRole('button', { name: 'Copilot 모델', exact: true })).toContainText('사용 가능');
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
  await page.getByTestId('settings-dialog').getByRole('button', { name: '진단', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Codex 진단', exact: true })).toBeVisible();
  await expect(page.getByText('docs · 연결됨 · OAuth', { exact: true })).toBeVisible();
  expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/diagnostics-640-dark-ko.png' });
  await page.getByRole('button', { name: '← 비서', exact: true }).click();
  // Official assistant and ordinary unsaved document share the shell.
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  const editor = page.locator('.document-scroll[data-active=true] .ProseMirror');
  await editor.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' preserved AI draft still editable');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '표시·언어', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A committed dirty recovery record can outlive Save's asynchronous cleanup.
  // Hold only this session's deletion through reload: Saved must be sufficient
  // to reopen the disk document without presenting its obsolete recovery work.
  await expect.poll(() => page.evaluate(async path => {
    const { recoveryStorage } = await import('/src/recovery-storage.ts');
    return (await recoveryStorage.list()).some(record => record.path === path && record.recoveryText.includes('still editable'));
  }, assistantFixture.document)).toBe(true);
  await page.evaluate(async path => {
    const { recoveryStorage } = await import('/src/recovery-storage.ts');
    const record = (await recoveryStorage.list()).find(record => record.path === path);
    const remove = recoveryStorage.delete;
    recoveryStorage.delete = id => id === record.id ? new Promise(() => {}) : remove(id);
  }, assistantFixture.document);
  await page.getByTestId('save').click();
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation', 'saved');
  const savedDocument = await (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(assistantFixture.document), { headers: { Connection: "close" } })).json();
  expect(savedDocument.source).toContain('still editable');
  await page.reload();
  await expect(editor).toContainText('still editable');
  await expect(page.getByTestId('recovery-prompt')).toHaveCount(0);
  await editor.locator('p').first().click(); await page.keyboard.press('End');
  await page.keyboard.type(' fresh assistant draft');
  // #1107/#1106: leave a real trailing hard break in the unsaved editor.
  // Assistant context remains path-only, independently of Core Save normalization.
  await page.keyboard.press('Shift+Enter');
  expect(await editor.evaluate(el => el.editor.getJSON().content.find(node => node.type === 'paragraph').content.at(-1).type)).toBe('hardBreak');
  const submittedAnswers = [];
  const sent = [], conversations = new Map();
  let displayRequest, displayReply, displayResolve, displayReceipt, displaySequence = 0;
  let resumeFailure = false;
  let selected, sequence = 0, setupMode = 'ready', snapshots = 0, snapshotGate, answerGate;
  await page.unroute('**/api/assistant/diagnostics*');
  await page.route('**/api/assistant/diagnostics*', route => route.fulfill({ json: { provider: 'codex', connected: setupMode !== 'missing',
    error: setupMode === 'missing' ? 'Codex CLI is unavailable on the Host.' : undefined,
    account: setupMode === 'login' ? null : { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'display-result') {
        displayReply = body.reply; displayRequest = undefined;
        if (displayResolve) { displayResolve(body.reply); displayResolve = undefined; }
        return route.fulfill({ json: { acknowledged: true } });
      }
      if (body.action === 'display-undo') {
        displayRequest = { id: 'undo-display-' + (++displaySequence), validForMs: 10000, changes: displayReceipt.before, expected: displayReceipt.after };
        const reply = await new Promise(resolve => { displayResolve = resolve; });
        return route.fulfill(reply.error ? { status: 400, json: { error: reply.error } } : { json: { undone: true } });
      }
      if (body.action === 'resume') {
        if (resumeFailure || !conversations.has(body.id)) return route.fulfill({ status: 404, json: { error: 'Conversation was not found.' } });
        selected = conversations.get(body.id);
      }
      if (body.action === 'send') {
        sent.push(body);
        if (!body.id) { selected = { provider: body.provider ?? settings.provider, permissionMode: body.permissionMode ?? settings.permissionMode, id: 'thread-' + (++sequence), title: body.message, folders: body.folders, createdAt: 1793590000000,
          updatedAt: 1793590000000, model: body.model, reasoningEffort: body.reasoningEffort, turns: [] }; conversations.set(selected.id, selected); }
        else { selected = conversations.get(body.id); if (!selected.turns.some(turn => turn.status === 'inProgress')) selected.permissionMode = body.permissionMode ?? selected.permissionMode; }
        if (body.message === 'After provider switch') selected.copilot = { ...copilotOptions, reasoningEffortSource: 'config', reasoningEfforts: [] };
        if (body.message === 'Recover supported model') {
          selected.model = body.model; selected.reasoningEffort = 'max';
          selected.copilot = { ...copilotOptions, reasoningEffortSource: 'config', reasoningEfforts: [{ reasoningEffort: 'max' }] };
          if (body.reasoningEffort !== 'max') return route.fulfill({ status: 400, json: { error: 'Invalid Copilot reasoning effort for this session.' } });
        }
        let turn = selected.turns.find(turn => turn.status === 'inProgress');
        if (!turn) { turn = { id: 'turn-' + sent.length, status: 'inProgress', items: [] }; selected.turns.push(turn); }
        turn.items.push({ id: 'user-' + sent.length, kind: 'user', text: body.message, references: [...(body.references ?? []).map(path => ({ path, name: path.split(/[\\/]/).pop(), kind: 'file' })), ...(body.skills ?? []).map(skill => ({ ...skill, kind: 'skill' }))] });
        if (turn.items.length === 1) turn.items.push({ id: 'summary-' + sent.length, kind: 'reasoning', text: 'Checking the document and opened folders.' },
          { id: 'tool-' + sent.length, kind: 'tool', text: 'create_document', status: 'completed', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ path: assistantFixture.document, revision: 'fixture-created-revision' }) }] } },
          { id: 'answer-' + sent.length, kind: 'assistant', text: 'Partial answer' });
        else turn.items.push({ id: 'steer-' + sent.length, kind: 'plan', text: body.message ? 'Direction updated: focus on the unsaved paragraph.' : 'File reference received.' });
        selected.tokenUsage = { used: 810, limit: 1000 };
      }
      if (body.action === 'answer') { submittedAnswers.push(body); await answerGate; delete selected.userInput; }
      if (body.action === 'interrupt') selected.turns.at(-1).status = 'interrupted';
      return route.fulfill({ json: selected });
    }
    const id = decodeURIComponent((route.request().url().split('?id=')[1] ?? '').split('&')[0]);
    if (id) { snapshots++; await snapshotGate; }
    return route.fulfill({ json: id ? { ...conversations.get(id), displayRequest } : [...conversations.values()].map(({ turns, tokenUsage, ...info }) => info) });
  });
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/closed-1440-light-en.png' });
  await editor.locator('p').first().click(); await page.keyboard.press('End');
  await editor.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Process', code: 'KeyY', keyCode: 229, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
  })));
  expect(await page.getByTestId('assistant-panel').isVisible()).toBe(false);
  let releaseSettings;
  settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  await editor.focus();
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
  await expect(panel.getByRole('button', { name: 'Model settings', exact: true })).toContainText('GPT Sol');
  // Real browser paint is the primary layer for #1124: preflight previously erased
  // the field boundary and transparent native selects produced white-on-white lists.
  const assertChoiceContrast = async () => {
    const values = await page.locator('.assistant-controls button:not(:disabled), .assistant-choices, .assistant-choices [role=menuitem]').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      let surface = node;
      while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)' && surface.parentElement) surface = surface.parentElement;
      const background = getComputedStyle(surface).backgroundColor;
      const rgb = value => value.match(/[\d.]+/g).map(Number);
      const lum = value => rgb(value).slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
      return { control: node.getAttribute("role") !== "menuitem", node: node.outerHTML, boundary: ratio(style.borderColor, background), text: ratio(style.color, background), border: parseFloat(style.borderWidth), alpha: rgb(background)[3] ?? 1 };
    }));
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) { if (value.control) { expect(value.border).toBeGreaterThanOrEqual(1); expect(value.boundary, JSON.stringify(value)).toBeGreaterThanOrEqual(3); } expect(value.alpha).toBe(1); expect(value.text).toBeGreaterThanOrEqual(4.5); }
  };
  await panel.getByRole('button', {name: 'AI provider settings', exact: true}).click();
  await expect(page.getByRole('menu', {name: 'AI provider settings', exact: true}).getByRole('menuitem')).toHaveText(['Codex', 'GitHub Copilot']);
  await page.keyboard.press('Escape');
  await panel.getByRole('button', {name: 'Close assistant', exact: true}).click();
  await page.getByRole('button', {name: 'Settings', exact: true}).click();
  await page.getByRole('navigation', {name: 'Settings categories'}).getByRole('button', {name: 'Assistant', exact: true}).click();
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await page.getByRole('button', {name: 'Assistant', exact: true}).click();
  await expect(message).toBeEnabled();
  const defaultWrites = settingsWrites.length;
  await panel.getByRole('button', {name: 'AI provider settings', exact: true}).click();
  await page.getByRole('menuitem', {name: 'GitHub Copilot', exact: true}).click();
  await expect(panel.getByRole('button', {name: 'Model settings', exact: true})).toHaveText('Auto');
  await expect(panel.getByRole('button', {name: 'AI provider settings', exact: true})).toBeEnabled();
  await panel.getByRole('button', {name: 'New conversation', exact: true}).click();
  await expect(panel.getByRole('button', {name: 'AI provider settings', exact: true})).toHaveText('Codex');
  await expect(panel.getByRole('button', {name: 'Model settings', exact: true})).toHaveText('GPT Sol');

  await panel.getByRole('button', {name: 'Permission mode settings', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Read-only', exact: true}).click();
  await expect(panel.getByRole('button', {name: 'Permission mode settings', exact: true})).toHaveText('Read-only');
  expect(settingsWrites.length).toBe(defaultWrites);

  await expect(panel.getByRole('button', { name: 'Response language', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Model settings', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', {name: /^(Model settings|모델 설정)$/})).toBeVisible();
  await expect(page.getByRole('menuitem', {name: 'GPT Sol', exact: true})).toHaveAttribute('aria-current', 'true');
  await assertChoiceContrast();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Model settings', exact: true })).toBeFocused();
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
    await expect(bell).toHaveAttribute('aria-expanded', String(expanded));
    await expect(notification.locator('ul')).toBeVisible({ visible: expanded });
  }
  await notification.locator(':scope > button').click();
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await openDocument(page, assistantFixture.document);
  const referenceRow = page.getByTestId('sidebar').getByRole('treeitem').filter({ hasText: 'document.md' });
  await referenceRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  const draftChips = panel.locator('.assistant-composer .assistant-reference');
  await expect(draftChips).toHaveCount(1);
  let fileLookups = 0;
  const noFileSearch = route => { fileLookups++; return route.fulfill({ json: { entries: [] } }); };
  await page.route('**/api/folder?*', noFileSearch);
  await message.click(); await page.keyboard.type('@document', { delay: 60 });
  await expect(panel.getByRole('listbox')).toHaveCount(0);
  await expect(message).toHaveValue('@document');
  await message.fill('');
  expect(fileLookups).toBe(0);
  await page.unroute('**/api/folder?*', noFileSearch);
  await referenceRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await expect(draftChips).toHaveCount(1);
  await draftChips.getByRole('button').click();
  await expect(draftChips).toHaveCount(0);
  await referenceRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(referenceRow).toBeFocused();
  await editor.locator('p').first().click();
  await page.keyboard.press('Control+Shift+Y');
  await expect(message).toBeEnabled();

  await message.click(); await page.keyboard.type('/lit', { delay: 60 });
  const skillOptions = panel.getByRole('listbox', { name: 'Codex skills' });
  await expect(skillOptions.getByRole('option')).toContainText(skill.description);
  if (screenshots) await page.screenshot({ path: 'docs/design/assets/assistant-skills-1047/list-1440-light-en.png' });
  await skillOptions.getByRole('option').click();
  await expect(message).toHaveValue('$litzio-guide ');
  await expect(draftChips).toHaveCount(2);
  if (screenshots) await page.screenshot({ path: 'docs/design/assets/assistant-skills-1047/chip-1440-light-en.png' });
  await draftChips.filter({ hasText: '$litzio-guide' }).getByRole('button').click();
  await expect(draftChips).toHaveCount(1);
  await expect(message).not.toHaveValue(/\$litzio-guide/);
  await message.click(); await message.press('ControlOrMeta+A'); await message.press('Backspace'); skillsFail = true;
  await page.keyboard.type('/');
  await expect(skillOptions.getByRole('alert')).toContainText('Skills unavailable');
  await message.press('Escape'); skillsFail = false;
  await message.fill(''); await page.keyboard.type('/lit', { delay: 60 });
  await expect(skillOptions.getByRole('option')).toBeVisible();
  await skillOptions.getByRole('option').click();
  await message.click(); await message.press('ControlOrMeta+A'); await message.press('Backspace');
  await page.keyboard.type('What changed in the current document?', { delay: 30 });
  await expect(draftChips).toHaveCount(1);
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByText('Partial answer', { exact: true })).toBeVisible();
  await expect(panel.locator('[data-kind=tool]').filter({ hasText: 'create_document' })).toContainText('Completed');
  expect(sent[0].skills).toEqual([]);
  expect(sent[0].message).toBe('What changed in the current document?');
  expect(sent[0].document).toEqual({ path: assistantFixture.document });
  await expect(panel.getByRole('status').filter({ hasText: 'Using saved version' })).toBeVisible();
  await expect(panel).not.toContainText('paragraph edit cannot round-trip');
  // Undo the trailing-break input before later Save checks; native End/Backspace differs by browser.
  await editor.focus(); await page.keyboard.press('ControlOrMeta+z');
  await message.focus();
  expect(sent[0].responseLanguage).toBeUndefined();
  expect(sent[0].references).toEqual([assistantFixture.document]);
  await expect(panel.locator('.assistant-user .assistant-reference')).toHaveCount(1);
  await expect(draftChips).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Model settings', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', {name: 'AI provider settings', exact: true})).toBeDisabled();
  expect(sent.at(-1).provider).toBe('codex'); expect(sent.at(-1).permissionMode).toBe('read-only');
  expect(settings.permissionMode).toBe('opened-folders');
  selected.turns[0].items.find(item => item.kind === 'assistant').text = 'The unsaved paragraph adds a clear qualification. Check the stated conditions before using the conclusion.';
  await expect(panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false })).toBeVisible();
  // #1108: long lists expose scroll loss across unrelated shell renders/snapshots.
  const checkPickerScroll = async (trigger, list) => {
    await message.click(); await page.keyboard.type(trigger, { delay: 60 });
    await expect(list.getByRole('option')).toHaveCount(24);
    for (let index = 0; index < 8; index++) await message.press('ArrowDown', { delay: 60 });
    const activeOption = await message.getAttribute('aria-activedescendant');
    await list.hover();
    const beforeWheel = await list.evaluate(element => element.scrollTop);
    await page.mouse.wheel(0, 180);
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(beforeWheel);
    const scrollTop = await list.evaluate(element => element.scrollTop);
    const lookups = skillLookups, before = snapshots;
    // A real dock resize causes an unrelated parent render while the query stays unchanged.
    await resize.press('ArrowLeft', { delay: 60 });
    await expect.poll(() => snapshots).toBeGreaterThan(before + 2);
    expect(await list.evaluate(element => element.scrollTop)).toBe(scrollTop);
    expect(await message.getAttribute('aria-activedescendant')).toBe(activeOption);
    if (trigger === '/') expect(skillLookups).toBe(lookups);
    await message.focus(); await message.press('Escape');
    await expect(list).toBeHidden();
    await resize.press('ArrowRight', { delay: 60 });
    await message.fill('');
  };
  longSkills = true;
  await checkPickerScroll('/', skillOptions);
  longSkills = false;
  await referenceRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await message.click(); await page.keyboard.type('/lit', { delay: 60 });
  await expect(skillOptions.getByRole('option')).toBeVisible();
  await skillOptions.getByRole('option').click();
  await message.click(); await message.press('ControlOrMeta+A'); await message.press('Backspace');
  await expect(draftChips).toHaveCount(1);
  await panel.getByRole('button', { name: 'Steer conversation', exact: true }).click();
  await expect(draftChips).toHaveCount(0);
  expect(sent.at(-1).message).toBe('');
  expect(sent.at(-1).skills).toEqual([]);
  expect(sent.at(-1).references).toEqual([assistantFixture.document]);
  await message.click(); await page.keyboard.type('/lit', { delay: 60 });
  await expect(skillOptions.getByRole('option')).toBeVisible();
  await skillOptions.getByRole('option').click();
  await expect(draftChips).toHaveCount(1);
  await message.press('End'); await page.keyboard.type('Focus on the unsaved paragraph.', { delay: 30 });
  await panel.getByRole('button', { name: 'Steer conversation' }).click();
  await expect(message).toHaveValue('');
  await expect(panel.getByText('Direction updated: focus on the unsaved paragraph.', { exact: true }).last()).toBeVisible();
  expect(sent.at(-1).skills).toEqual([{ name: skill.name, path: skill.path }]);
  expect(sent.at(-1).message).toBe('$litzio-guide Focus on the unsaved paragraph.');
  await expect(draftChips).toHaveCount(0);
  expect(sent[1].id).toBe('thread-1');
  await expect(panel.getByText('Context is nearly full. Start a new conversation soon.', { exact: true })).toBeVisible();
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(page.locator('[data-slot=tooltip-content]')).toContainText('810 / 1,000 tokens · 81%');
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/running-1440-light-en.png' });
  if (screenshots) await page.screenshot({ path: 'tmp/983-before-1440.png' });
  selected.userInput = { requestId: 'question-983', turnId: selected.turns[0].id, questions: [
    { id: 'constructor', header: 'Scope', question: 'Which part should I explain?', isOther: true, isSecret: false, options: [{ label: 'Summary', description: 'Explain the main points.' }, { label: 'Details', description: 'Explain each step.' }] },
    { id: '__proto__', header: 'Private input', question: 'Enter a private example.', isOther: false, isSecret: true, options: null }
  ] };
  const questionCard = panel.getByTestId('assistant-question');
  await expect(questionCard).toBeVisible();
  await questionCard.scrollIntoViewIfNeeded();
  if (screenshots) await page.screenshot({ path: 'tmp/983-after-1440.png' });
  await questionCard.getByRole('radio', { name: /Summary/ }).check();
  await questionCard.getByLabel('Your answer').fill('private example');
  await expect(questionCard.getByLabel('Your answer')).toHaveAttribute('type', 'password');
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(questionCard.getByRole('radio', { name: /Summary/ })).toBeChecked();
  await expect(questionCard.getByLabel('Your answer')).toHaveValue('private example');
  let releaseAnswer;
  answerGate = new Promise(resolve => { releaseAnswer = resolve; });
  await questionCard.getByRole('button', { name: 'Submit answers' }).click();
  await expect(questionCard.getByRole('button', { name: 'Submit answers' })).toBeDisabled();
  await expect.poll(() => submittedAnswers.length).toBe(1);
  releaseAnswer(); answerGate = undefined;
  await expect(questionCard).toHaveCount(0);
  expect(submittedAnswers).toEqual([{ action: 'answer', id: selected.id, turnId: selected.turns[0].id, requestId: 'question-983', answers: { constructor: { answers: ['Summary'] }, ['__proto__']: { answers: ['private example'] } } }]);
  selected.userInput = { requestId: 'other-983', turnId: selected.turns[0].id, questions: [{ id: 'constructor', header: 'Scope', question: 'Choose or describe.', isOther: true, isSecret: false, options: [{ label: 'Summary', description: 'Main points' }] }] };
  await expect(questionCard).toBeVisible();
  await questionCard.getByRole('radio', { name: 'Write another answer' }).check();
  await questionCard.getByLabel('Your answer').fill('Explain the assumptions');
  await questionCard.getByRole('button', { name: 'Submit answers' }).click();
  await expect(questionCard).toHaveCount(0);
  expect(submittedAnswers.at(-1).answers).toEqual({ constructor: { answers: ['Explain the assumptions'] } });
  selected.userInput = { requestId: 'expired-983', turnId: selected.turns[0].id, questions: [{ id: 'expired', header: 'Expiry', question: 'Pending question', isOther: false, isSecret: false, options: null }] };
  await expect(questionCard).toBeVisible();
  delete selected.userInput;
  await expect(questionCard).toHaveCount(0);
  expect(submittedAnswers.length).toBe(2);

  await panel.getByRole('button', { name: 'Stop response' }).click();
  await expect(panel.getByRole('button', { name: 'Model settings', exact: true })).toBeEnabled();
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
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  setupMode = 'login';
  await panel.getByRole('button', { name: 'Close assistant' }).click();
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
  await editor.focus();
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
  await panel.getByRole('button', { name: 'Conversation history' }).click();
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/history-1440-light-en.png' });
  await panel.getByRole('button', { name: /What changed in the current document/ }).click();
  await expect(panel.getByRole('button', {name: 'Permission mode settings', exact: true})).toHaveText('Read-only');
  await expect(panel.getByRole('button', {name: 'AI provider settings', exact: true})).toBeDisabled();
  await expect(panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false })).toBeVisible();
  await expect(panel.locator('.assistant-user .assistant-reference').filter({ hasText: '$litzio-guide' })).toHaveCount(1);
  // #1270: the history surface renders the API's original utterance and chips only.
  await expect(panel.locator('.assistant-user').first()).toContainText('What changed in the current document');
  await expect(panel).not.toContainText('# Litzio plugin authoring skill');
  await expect(panel).not.toContainText('Litzio read-only context (JSON):');
  const markdownSource = '# 답변 요약\n\n**중요한 조건**과 $x^2$, \\(x^2\\)를 확인합니다.[^n]\n\n- 첫 번째 항목\n- 두 번째 항목\n\n```js\nconst answer = "' + 'long-code-'.repeat(30) + '";\n```\n\n| 항목 | 설명 |\n| --- | --- |\n| 표 | ' + '긴내용'.repeat(70) + ' |\n\n\\[\na+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z\n\\]\n\n[공식 안내](https://example.com/docs)\n\n[^n]: 답변 각주';
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
  await expect(answer.locator('.math.inline .katex')).toHaveCount(2);
  await expect(answer.locator('.math.block .katex-display')).toHaveCount(1);
  // Windows clipboard normalizes LF to CRLF; compare logical text after OS readback.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: 'Copy answer', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n')))).toBe(markdownSource);
  await expect(panel.locator('.assistant-turn-actions [role=status]')).toHaveText('Copied');
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
  await panel.getByRole('button', { name: 'Copy answer', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n')))).toBe(markdownSource);

  // One turn can contain commentary followed by a separate final answer.
  const finalSource = '**마지막 답변**\n\n조건을 확인하세요.';
  selected.turns[0].items.push({ id: 'final-1051', kind: 'assistant', text: finalSource });
  await expect(panel.getByText('마지막 답변', { exact: true })).toBeVisible();
  const turn = panel.locator('.assistant-turn').first();
  await expect(turn.getByRole('group', { name: 'Your message', exact: true }).first()).toContainText('What changed');
  await expect(turn.getByRole('group', { name: 'Assistant response', exact: true })).toContainText('마지막 답변');
  const copyAnswer = turn.getByRole('button', { name: 'Copy answer', exact: true });
  expect(await copyAnswer.count(), 'One answer action per turn').toBe(1);
  expect(await turn.evaluate(element => element.lastElementChild.contains(element.querySelector('button[aria-label="Copy answer"]'))), 'Answer action follows all turn content').toBe(true);
  await copyAnswer.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(copyAnswer).toBeFocused();
  await expect(page.locator('[data-slot=tooltip-content]')).toHaveText('Copy answer');
  expect(await copyAnswer.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, '\n')))).toBe(markdownSource + '\n\n' + finalSource);
  selected.turns[0].items.pop();
  await expect(panel.getByText('마지막 답변', { exact: true })).toHaveCount(0);

  if (screenshots) {
    for (const theme of ['light', 'dark']) {
      await panel.getByRole('button', { name: 'Close assistant' }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByTestId('theme').selectOption(theme);
      await page.getByTestId('ui-language').selectOption('ko');
      await page.locator('[data-tab-id="settings"] .document-tab-close').click();
      await page.keyboard.press('Control+Shift+Y');
      for (const width of [1440, 640]) {
        await page.setViewportSize({ width, height: 1000 });
        await panel.locator('.assistant-transcript').evaluate(element => { element.scrollTop = 0; });
        expect(await panel.locator('.assistant-transcript').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: `tmp/982-evidence/${width}-${theme}.png` });
        await panel.getByRole('button', { name: '답변 복사', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `tmp/982-evidence/${width}-${theme}-bottom.png` });
      }
      await panel.getByRole('button', { name: '비서 닫기' }).click();
      await page.getByRole('button', { name: '설정', exact: true }).click();
      await page.getByTestId('ui-language').selectOption('en');
      await page.locator('[data-tab-id="settings"] .document-tab-close').click();
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
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await page.setViewportSize({ width: 640, height: 1000 });
  await editor.locator('p').first().click();
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await panel.getByRole('textbox').evaluate(element => document.activeElement === element)).toBe(true);
  expect(await panel.evaluate(element => ({ width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth }))).toEqual({ width: 640, overflow: false });
  expect(await page.locator('.app-main').evaluate(element => element.inert)).toBe(true);
  await expect(panel.getByRole('button', { name: '추론 강도 설정', exact: true })).toContainText('높음');
  await panel.getByRole('button', {name: '모델 설정', exact: true}).click();
  await expect(page.getByRole('menu', {name: /^(Model settings|모델 설정)$/})).toBeVisible();
  await assertChoiceContrast();
  await page.keyboard.press('Escape');

  if (screenshots) {
  await panel.getByRole('textbox').click(); await page.keyboard.type('/lit', { delay: 60 });
  await expect(panel.getByRole('listbox', { name: 'Codex 스킬' }).getByRole('option')).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'docs/design/assets/assistant-skills-1047/list-640-dark-ko.png' });
  await panel.getByRole('listbox', { name: 'Codex 스킬' }).getByRole('option').click();
  if (screenshots) await page.screenshot({ path: 'docs/design/assets/assistant-skills-1047/chip-640-dark-ko.png' });
  await panel.locator('.assistant-composer .assistant-reference').getByRole('button').click(); await panel.getByRole('textbox').fill('');
  }
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/assistant-640-dark-ko.png' });
  if (screenshots) await page.screenshot({ path: 'tmp/983-before-640.png' });
  selected.userInput = { requestId: 'ko-983', turnId: selected.turns.at(-1).id, questions: [{ id: 'ko', header: '설명 범위', question: '문서에서 어떤 내용을 자세히 설명할까요?', isOther: true, isSecret: false, options: [{ label: '핵심 내용', description: '문서의 핵심 내용과 주요 조건을 함께 설명합니다.' }, { label: '단계별 설명', description: '각 단계의 근거와 가정을 자세히 설명합니다.' }] }] };
  await expect(questionCard).toBeVisible();
  await questionCard.scrollIntoViewIfNeeded();
  await questionCard.getByRole('radio', { name: '직접 입력' }).check();
  await questionCard.getByLabel('답변', { exact: true }).fill('주요 가정과 예외 조건을 설명해 주세요.');
  await questionCard.getByRole('button', { name: '답변 제출' }).scrollIntoViewIfNeeded();
  await expect(questionCard.getByRole('button', { name: '답변 제출' })).toBeInViewport();
  if (screenshots) await page.screenshot({ path: 'tmp/983-after-640.png' });
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  delete selected.userInput;
  await expect(questionCard).toHaveCount(0);
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
  await panel.getByRole('button', { name: '비서 설정 열기' }).click();
  await expect(page.getByRole('heading', { name: '비서', exact: true }).last()).toBeVisible();
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await expect(panel).toBeHidden();
  expect(await page.locator('.app-main').evaluate(element => element.inert)).toBe(false);
  setupMode = 'missing'; await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByText('이 컴퓨터에서 Codex CLI를 찾을 수 없습니다. 설치 후 설정에서 진단을 실행하세요.', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  setupMode = 'ready';
  const historyEntries = [
    { ...selected, id: 'history-older', title: '문서 구조와 검토 계획 정리', folders: ['C:\\Projects\\reports\\연구 보고서', '/home/example/work/검토 자료'], updatedAt: 1793590000000 },
    { ...selected, id: 'history-newer', title: '실험 결과 표와 다음 작업 확인', folders: ['C:\\Projects\\reports\\실험 결과'], updatedAt: 1793593600000 },
  ];
  for (const entry of historyEntries) conversations.set(entry.id, entry);
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('button', { name: '대화 기록' }).click();
  await expect(panel.getByRole('button', { name: /문서 구조와 검토 계획 정리/ })).toBeEnabled();
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `tmp/974-evidence/history-${width}.png` });
    }
  }
  const older = panel.getByRole('button', { name: /문서 구조와 검토 계획 정리/ });
  await expect(older.locator('small')).toHaveText('연구 보고서 · 검토 자료');
  await expect(older.locator('small')).toHaveAttribute('title', historyEntries[0].folders.join('\n'));
  await expect(older.locator('time')).toHaveAttribute('datetime', new Date(historyEntries[0].updatedAt).toISOString());
  await older.click();
  await expect(older).toBeHidden();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await page.evaluate(prefix => localStorage.getItem(prefix + '.assistantConversation:local'), brand.storagePrefix)).toBe('history-older');
  await panel.getByRole('button', { name: '대화 기록' }).click();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await panel.locator('.assistant-history').count(), 'Reopening returns to the conversation, not its history list').toBe(0);
  // A full page reload loses React state but preserves the selected older thread.
  await page.reload();
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(selected.id).toBe('history-older');
  await expect(panel.getByText('What changed in the current document?', { exact: true })).toBeVisible();
  await expect(panel.locator('.assistant-user .assistant-reference').first()).toHaveText('document.md');
  // A stored thread that cannot resume falls back quietly, with usable defaults.
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  resumeFailure = true;
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await panel.locator('.assistant-turn').count()).toBe(0);
  expect(await panel.getByRole('alert').count()).toBe(0);
  expect(await page.evaluate(prefix => localStorage.getItem(prefix + '.assistantConversation:local'), brand.storagePrefix)).toBe(null);
  resumeFailure = false;
  await panel.getByRole('button', { name: '대화 기록' }).click();
  await panel.getByRole('button', { name: /실험 결과 표와 다음 작업 확인/ }).click();
  await panel.getByRole('button', { name: '새 대화' }).click();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  await page.reload();
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await panel.locator('.assistant-turn').count(), 'Explicit New conversation survives reload').toBe(0);
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  // #1120: the existing poll carries a Host request; actual Settings writers and live UI reply.
  // Host allowlist/ownership/expiry are covered in the existing fake stdio test.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.getByTestId('page-background').selectOption('paper');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await editor.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' display settings draft');
  const documentBeforeDisplay = await editor.textContent();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('textbox').fill('다크 테마, 한국어, 넓은 문서와 평면 배경으로 바꿔 주세요.');
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.locator('.assistant-turn')).toHaveCount(1);
  selected.turns[0].status = 'completed';
  displayRequest = { id: 'display-read', validForMs: 10000 };
  await expect.poll(() => displayReply?.after?.theme).toBe('light');
  const displayBefore = displayReply.after;
  if (screenshots) for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `tmp/1120-evidence/before-${width}.png` });
  }
  const aiWritesBeforeDisplay = settingsWrites.length;
  displayReply = undefined;
  const displayAfter = { theme: 'dark', uiLanguage: 'ko', documentWidth: 'wide', pageBackground: 'flat' };
  displayRequest = { id: 'display-change', validForMs: 10000, changes: displayAfter };
  await expect.poll(() => displayReply?.after).toEqual(displayAfter);
  expect(displayReply.error).toBeUndefined();
  displayReceipt = { requestId: 'display-change', before: displayBefore, after: displayAfter, changed: Object.keys(displayAfter).filter(key => displayBefore[key] !== displayAfter[key]) };
  selected.turns[0].items.push({ id: 'display-card', kind: 'tool', text: 'change_display_settings', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(displayReceipt) }] } });
  const displayCard = panel.getByTestId('assistant-display-result');
  await expect(displayCard).toContainText('표시 설정 변경됨');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('html')).toHaveAttribute('data-page', 'flat');
  expect(await page.evaluate(prefix => localStorage.getItem(prefix + '.documentWidth'), brand.storagePrefix)).toBe('wide');
  expect(settingsWrites.length, 'Display tools must not save Assistant settings').toBe(aiWritesBeforeDisplay);
  if (screenshots) for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `tmp/1120-evidence/after-${width}.png` });
  }
  // A later manual change makes Undo refuse instead of overwriting it.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByTestId('page-background').selectOption('paper');
  await displayCard.getByRole('button', { name: '표시 설정 되돌리기' }).click();
  await expect(panel.getByRole('alert')).toHaveText('이 작업 이후 표시 설정이 바뀌어 되돌리지 않았습니다.');
  await expect(page.locator('html')).toHaveAttribute('data-page', 'paper');
  await page.getByTestId('page-background').selectOption('flat');
  await displayCard.getByRole('button', { name: '표시 설정 되돌리기' }).click();
  await expect(displayCard).toContainText('Display settings restored');
  await expect(page.getByTestId('theme')).toHaveValue('light');
  await expect(page.getByTestId('page-background')).toHaveValue('paper');
  await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await expect(editor).toHaveText(documentBeforeDisplay);
  await panel.getByRole('button', { name: '새 대화' }).click();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  // Global provider autosave retires the prior conversation; composer overrides above do not save settings.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '비서', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('textbox').fill('Before provider switch');
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.locator('.assistant-turn[data-status="inProgress"]')).toBeVisible();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Assistant', exact: true }).click();
  const writesBeforeProvider = settingsWrites.length;
  await page.getByLabel('Default AI provider', { exact: true }).selectOption('copilot');
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('auto');
  await expect(page.getByLabel('Reasoning effort', { exact: true })).toHaveValue('medium');
  await expect(page.getByText('Litzio skills', { exact: true })).toHaveCount(0);
  await expect.poll(() => settingsWrites.length).toBe(writesBeforeProvider + 1);
  // Official default changes preserve the current conversation and turn.
  await expect(panel.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await panel.getByRole('button', { name: 'Stop response' }).click();
  await panel.getByRole('button', { name: 'New conversation' }).click();
  await panel.getByRole('button', { name: 'Session mode settings', exact: true }).click();
  await page.getByRole('menuitem', {name: 'Plan', exact: true}).click();
  await panel.getByRole('button', { name: 'Reasoning effort settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'high', exact: true }).click();
  await panel.getByRole('textbox').fill('After provider switch');
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.getByText('After provider switch', { exact: true })).toBeVisible();
  expect(sent.at(-1).model).toBe('auto');
  expect(sent.at(-1).mode).toBe('plan');
  expect(sent.at(-1).reasoningEffort).toBe('high');
  expect(sent.at(-1).id).toBeUndefined();
  expect(sent.at(-1).skills).toEqual([]);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  if (screenshots) {
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance & language', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `tmp/1181/evidence/copilot-${width}-dark-ko.png` });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Assistant', exact: true }).click();
  }
  await expect(panel.getByRole('button', { name: 'Reasoning effort settings', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  await panel.getByRole('button', { name: 'Model settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copilot fixture model', exact: true }).click();
  await panel.getByRole('textbox').fill('Recover supported model');
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.getByRole('alert')).toHaveText('Invalid Copilot reasoning effort for this session.');
  await expect(panel.getByRole('textbox')).toHaveValue('Recover supported model');
  const recoveredEffort = panel.getByRole('button', { name: 'Reasoning effort settings', exact: true });
  await expect(recoveredEffort).toBeVisible();
  if (screenshots) {
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance & language', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await panel.screenshot({ path: `tmp/1181/review-capture/recovery-${width}-dark-ko.png` });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Assistant', exact: true }).click();
  }
  await expect(recoveredEffort).toHaveText('high');
  expect(sent.at(-1).reasoningEffort).toBe('high');
  await recoveredEffort.hover();
  await expect(page.getByText('Reasoning effort: Model, reasoning effort and mode changes apply to the next message. Current model reasoning effort: max.', { exact: true })).toBeVisible();
  await recoveredEffort.click();
  await page.getByRole('menuitem', { name: 'max', exact: true }).click();
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.getByRole('textbox')).toHaveValue('');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(sent.at(-1).reasoningEffort).toBe('max');
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();

  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/copilot-1440-light-en.png' });
  if (screenshots) {
    await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance & language', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
    await page.getByRole('navigation', { name: '설정 분류' }).getByRole('button', { name: '비서', exact: true }).click();
    await expect(page.getByLabel('기본 AI 공급자', { exact: true })).toHaveValue('copilot');
    await page.screenshot({ path: 'tmp/880-evidence/copilot-1440-dark-ko.png' });
    await page.setViewportSize({ width: 640, height: 1000 });
    await expect(page.getByLabel('모델', { exact: true })).toHaveValue('auto');
    expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/copilot-640-dark-ko.png' });
    await page.getByLabel('AI 기본 언어', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tmp/880-evidence/copilot-640-dark-ko-scrolled.png' });
    await page.locator('[data-tab-id="settings"] .document-tab-close').click();
    await page.getByRole('button', { name: '비서', exact: true }).click();
    await panel.getByRole('button', { name: '응답 중단' }).click();
    await panel.getByRole('button', { name: '새 대화', exact: true }).click();
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await panel.getByRole('button', { name: '모델 설정', exact: true }).click();
      await page.screenshot({ path: `tmp/880-evidence/copilot-options-${width}-dark-ko.png` });
      await page.keyboard.press('Escape');
    }
    await panel.getByRole('button', { name: '비서 닫기' }).click();
    await page.getByRole('button', { name: '설정', exact: true }).click();
  }
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  // Restore preferences for the other stable scenarios.
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'en'); localStorage.setItem(prefix + '.theme', 'light'); localStorage.removeItem(prefix + '.assistantWidth'); localStorage.removeItem(prefix + '.assistantConversation:local'); }, brand.storagePrefix);
  return { settings: true, minimumViewport: true, nativeDocumentPreserved: true, conversations: true };
}
