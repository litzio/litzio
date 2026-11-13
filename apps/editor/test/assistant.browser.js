async (page, { expect, openPath, openDocument, reloadDocument, assistantFixture, screenshots, brand, waitForExplorerLayout }) => {
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
  const skill = { displayName: 'Docling · 검수', name: 'litzio-guide', path: 'C:/assistant/.agents/skills/litzio-guide/SKILL.md', description: 'Explain Litzio documents and assistant tools' };
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
  await page.route('**/api/assistant/models*', route => { refreshes++; const copilot = route.request().url().includes('provider=copilot') || !route.request().url().includes('provider=') && settings.provider === 'copilot'; return route.fulfill({ json: { provider: copilot ? 'copilot' : 'codex', ...(copilot ? { copilot: copilotOptions } : { fullAccessAllowed: false }), models: copilot ? copilotModels : models, updatedAt: 1793590000000 } }); });
  await page.route('**/api/assistant/environment*', route => route.fulfill({ json: { cwd: 'C:\\Users\\example\\AppData\\Roaming\\litzio\\assistant', instructions: 'C:\\Users\\example\\AppData\\Roaming\\litzio\\assistant\\AGENTS.md', skills: [] } }));
  let summaryFail = false, summaryAccount = { type: 'chatgpt', email: 'example@example.invalid', planType: 'plus' }, summaryReads = 0, summaryLimits;
  const diagnosticReply = route => {
    const summary = route.request().url().includes('summary=account-usage');
    if (summary) {
      summaryReads++;
      if (summaryFail) return route.fulfill({ status: 503, json: { error: 'private provider failure must not appear' } });
    }
    return route.fulfill({ json: { provider: 'codex', checkedAt: 1793590000000, path: 'C:\\Codex\\codex.exe', version: 'codex-cli 0.166.0', connected: true,
      account: summary ? summaryAccount : { type: 'chatgpt', email: 'example@example.invalid', planType: 'plus' }, rateLimits: summary && summaryLimits ? summaryLimits : [{ name: 'Codex', windows: [{ usedPercent: 28, windowDurationMins: 300, resetsAt: 1793600000 }, { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1794000000 }] }], mcp: [{ name: 'docs', status: 'connected', authStatus: 'oAuth' }] } });
  };
  await page.route('**/api/assistant/diagnostics*', diagnosticReply);
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
  await page.getByRole('button',{name:'Expand Explorer',exact:true}).click();
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
  let pasted = 0;
  const pastedPaths = [], pastedData = [];
  const uploadGates = new Map();
  const sent = [], conversations = new Map(), receipts = new Map();
  let screenRequest, screenReply, screenReplyGate;
  let displayRequest, displayReply, displayResolve, displayReceipt, displaySequence = 0;
  let resumeFailure = false, promptReject = true;
  let sendGate, releaseSend, sendReplyGate, releaseSendReply, lostResult;
  let forgottenSubmissions = false, allowNewSend = false;
  let revealLost = false, receiptGate, releaseReceipt, receiptReads = 0;
  let selected, sequence = 0, setupMode = 'ready', snapshots = 0, snapshotGate, snapshotGateEntered = 0, answerGate;
  await page.unroute('**/api/assistant/diagnostics*');
  await page.route('**/api/assistant/diagnostics*', route => route.request().url().includes('summary=account-usage') ? diagnosticReply(route) : route.fulfill({ json: { provider: 'codex', connected: setupMode !== 'missing',
    error: setupMode === 'missing' ? 'Codex CLI is unavailable on the Host.' : undefined,
    account: setupMode === 'login' ? null : { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'upload-image') { expect(body.mime).toBe('image/png'); expect(body.data.length).toBeGreaterThan(0); const path = `C:/assistant/attachments/clipboard-00000000-0000-4000-8000-${String(++pasted).padStart(12, "0")}.png`; pastedPaths.push(path); pastedData.push(body.data); await uploadGates.get(pasted); return route.fulfill({ json: { path, name: path.split('/').pop(), kind: 'image', pastedImage: true } }); }
      if (body.action?.endsWith('-ack')) return route.fulfill({ json: { acknowledged: true } });
      if (body.action === 'screen-result') { screenReply = body.reply; await screenReplyGate; screenRequest = undefined; return route.fulfill({ json: { acknowledged: true } }); }
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
        selected.turns = selected.turns.filter(turn => !turn.unrecordedPrompt);
      }
      if (body.action === 'send') {
        if (receipts.get(body.submissionId)?.submission.status === 'accepted' || lostResult?.submission.id === body.submissionId) {
          return route.fulfill({ json: lostResult?.submission.id === body.submissionId ? lostResult : receipts.get(body.submissionId) });
        }
        sent.push(body);
        await sendGate;
        if (body.skills?.length && body.message.endsWith('Keep this rejected skill request')) {
          const result = { submission: { id: body.submissionId, status: 'rejected', error: 'Fixture skill submission rejected' } };
          receipts.set(body.submissionId, result); return route.fulfill({ json: result });
        }
        if (!body.id) { selected = { provider: body.provider ?? settings.provider, permissionMode: body.permissionMode ?? settings.permissionMode, id: 'thread-' + (++sequence), title: body.message, folders: body.folders, createdAt: 1793590000000,
          updatedAt: 1793590000000, model: body.model, reasoningEffort: body.reasoningEffort, turns: [] }; conversations.set(selected.id, selected); }
        else { selected = conversations.get(body.id); if (!selected.turns.some(turn => turn.status === 'inProgress')) selected.permissionMode = body.permissionMode ?? selected.permissionMode; }
        if (body.message === 'After provider switch') { selected.tokenUsage = { used: 15000, limit: 200000 }; selected.copilotUsage = { cost: { amount: 0.25, currency: 'USD' }, prompt: { totalTokens: 14000, inputTokens: 13995, outputTokens: 5 } }; }
        if (body.message === 'After provider switch') selected.copilot = { ...copilotOptions, reasoningEffortSource: 'config', reasoningEfforts: [] };
        if (body.message === 'Recover supported model') {
          selected.model = body.model; selected.reasoningEffort = 'max';
          selected.copilot = { ...copilotOptions, reasoningEffortSource: 'config', reasoningEfforts: [{ reasoningEffort: 'max' }] };
          if (body.reasoningEffort !== 'max') {
            const result = { submission: { id: body.submissionId, status: 'rejected', conversationId: selected.id, error: 'Invalid Copilot reasoning effort for this session.' }, conversation: selected };
            receipts.set(body.submissionId, result); return route.fulfill({ status: 503, json: { error: 'Fixture rejection response lost' } });
          }
        }
        let turn = selected.turns.find(turn => turn.status === 'inProgress');
        if (!turn) { turn = { id: 'turn-' + sent.length, status: 'inProgress', items: [] }; selected.turns.push(turn); }
        turn.items.push({ id: 'user-' + sent.length, kind: 'user', userMessageSource: body.message === 'Prompt lost before provider record' && promptReject ? 'host' : 'provider-history', submissionId: body.submissionId, text: body.message, references: [...(body.references ?? []).map(path => ({ path, name: path.split(/[\\/]/).pop(), kind: 'file', ...(pastedPaths.includes(path) ? { pastedImage: true } : {}) })), ...(body.skills ?? []).map(skill => ({ ...skill, kind: 'skill' }))] });
        if (turn.items.length === 1) turn.items.push({ id: 'summary-' + sent.length, kind: 'reasoning', text: 'Checking the document and opened folders.' },
          { id: 'tool-' + sent.length, kind: 'tool', text: 'create_document', status: 'completed', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ path: assistantFixture.document, revision: 'fixture-created-revision' }) }] } },
          { id: 'answer-' + sent.length, kind: 'assistant', text: 'Partial answer' });
        else turn.items.push({ id: 'steer-' + sent.length, kind: 'plan', text: body.message ? 'Direction updated: focus on the unsaved paragraph.' : 'File reference received.' });
        if (body.message === 'Prompt lost before provider record' && promptReject) turn.unrecordedPrompt = true;
        selected.tokenUsage = selected.provider === "copilot" ? { used: 15000, limit: 200000 } : { used: 810, limit: 1000 };
      }
      if (body.action === 'answer') { submittedAnswers.push(body); await answerGate; delete selected.userInput; }
      if (body.action === 'interrupt') selected.turns.at(-1).status = 'interrupted';
      if (body.action === 'send') {
        const item = selected.turns.flatMap(turn => turn.items).find(item => item.submissionId === body.submissionId);
        const result = { submission: { id: body.submissionId, status: 'accepted', conversationId: selected.id, itemId: item.id }, conversation: selected };
        if (body.message === 'Accepted before observation') result.conversation = { ...selected, turns: selected.turns.map(turn => ({ ...turn, items: turn.items.filter(item => item.submissionId !== body.submissionId) })) };
        receipts.set(body.submissionId, result);
        if (body.message === 'Uncertain first' && !allowNewSend) {
          lostResult = result; receipts.set(body.submissionId, { submission: { id: body.submissionId, status: 'unknown' } });
          return route.fulfill({ status: 503, json: { error: 'Fixture response lost' } });
        }
        const reply = sendReplyGate ? JSON.parse(JSON.stringify(result)) : result;
        await sendReplyGate;
        return route.fulfill({ json: reply });
      }
      return route.fulfill({ json: selected });
    }
    const submissionId = decodeURIComponent((route.request().url().split('?submissionId=')[1] ?? '').split('&')[0]);
    if (submissionId && revealLost && lostResult?.submission.id === submissionId) receipts.set(submissionId, lostResult);
    if (submissionId) {
      const result = receipts.get(submissionId) ?? { submission: { id: submissionId, status: forgottenSubmissions ? 'unknown' : 'pending' } };
      receiptReads++; await receiptGate;
      return route.fulfill({ json: result });
    }
    const id = decodeURIComponent((route.request().url().split('?id=')[1] ?? '').split('&')[0]);
    if (id) { snapshots++; if (snapshotGate) { snapshotGateEntered++; await snapshotGate; } }
    return route.fulfill({ json: id ? { ...conversations.get(id), displayRequest, screenRequest } : [...conversations.values()].map(({ turns, tokenUsage, ...info }) => info) });
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
    await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
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
  await page.getByRole('button', {name: /^Assistant(?: — |$)/}).click();
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
  await expect(page.getByRole('menuitem', {name: 'Full access', exact: true})).toBeDisabled();
  await page.getByRole('menuitem', {name: 'Read-only', exact: true}).click();
  await expect(panel.getByRole('button', {name: 'Permission mode settings', exact: true})).toHaveText('Read-only');
  expect(settingsWrites.length).toBe(defaultWrites);
  const permissionButton = panel.getByRole('button', {name: 'Permission mode settings', exact: true});
  // Finish the menu's close/focus handoff before starting another keyboard interaction.
  // Linux CI reached the forced focus 14ms after selecting an item, then Tab 4ms later.
  await expect(page.getByRole('menu', {name: 'Permission mode', exact: true})).toHaveCount(0);
  await expect(permissionButton).toBeFocused();
  await panel.getByRole('button', { name: 'Reasoning effort settings', exact: true }).focus();
  await page.keyboard.press('Tab');
  try {
    await expect(permissionButton).toBeFocused();
    await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Opened folders allows folder edits and network access');
    await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Provider requests beyond these defaults ask for approval');
    await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Your organization does not allow Full access');
  } catch (error) {
    // Capture only on failure; keep the original assertion and its timeout.
    const state = await permissionButton.evaluate(button => {
      const describe = element => element && ({
        tag: element.tagName,
        attributes: Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value])),
        text: element.textContent,
      });
      return {
        activeElement: describe(document.activeElement),
        permissionButton: describe(button),
        popups: [...document.querySelectorAll('[data-slot=tooltip-content], [role=menu]')].map(describe),
      };
    }).catch(diagnosticError => ({ diagnosticError: String(diagnosticError) }));
    error.message += '\nPermission tooltip failure state: ' + JSON.stringify(state);
    throw error;
  }
  if (screenshots) await panel.screenshot({ path: 'tmp/1416-permission-tooltip.png' });
  await message.focus();


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

  await message.click(); await page.keyboard.type('/검수', { delay: 60 });
  const skillOptions = panel.getByRole('listbox', { name: 'Codex skills' });
  await expect(skillOptions.getByRole('option')).toContainText(skill.description);
  await expect(skillOptions.getByRole('option')).toContainText(skill.displayName);
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
  const pasteImages = async (count = 1, start = 0) => message.evaluate((element, { count, start }) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'screenshot companion text');
    for (let n = 0; n < count; n++) {
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = ['#315fd4', '#875717', '#315f38'][(n + start) % 3]; context.fillRect(0, 0, 120, 80);
      context.fillStyle = '#ffffff'; context.font = 'bold 48px sans-serif'; context.fillText(String(n + start + 1), 45, 58);
      const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
      data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    }
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { count, start });
  expect(await pasteImages()).toBe(true);
  await expect(draftChips).toHaveCount(2);
  await draftChips.filter({ hasText: 'Image 1' }).getByRole('button').click();
  await expect(draftChips).toHaveCount(1);
  // Hold each response explicitly: typing spaces the pastes like ordinary human input,
  // while response gates (rather than a fixed sleep) guarantee overlapping uploads.
  const beforeUploads = pasted;
  let releaseFirstUpload, releaseNextUpload;
  uploadGates.set(beforeUploads + 1, new Promise(resolve => { releaseFirstUpload = resolve; }));
  uploadGates.set(beforeUploads + 2, new Promise(resolve => { releaseNextUpload = resolve; }));
  expect(await pasteImages()).toBe(true);
  await expect.poll(() => pasted).toBe(beforeUploads + 1);
  await message.press('End'); await page.keyboard.type(' note', { delay: 160 });
  expect(await pasteImages(2, 1)).toBe(true);
  const sendDuringUpload = panel.getByRole('button', { name: 'Send message', exact: true });
  await expect(sendDuringUpload).toBeDisabled();
  await message.press('Enter');
  expect(sent).toHaveLength(0);
  releaseFirstUpload();
  await expect.poll(() => pasted, 'the later paste must be uploaded after the held first response').toBe(beforeUploads + 2);
  await expect(draftChips).toHaveCount(2);
  await expect(sendDuringUpload).toBeDisabled();
  await message.press('Enter');
  expect(sent).toHaveLength(0);
  await message.fill('What changed in the current document?');
  releaseNextUpload();
  await expect(draftChips).toHaveCount(4);
  await expect(sendDuringUpload).toBeEnabled();
  await expect(draftChips).toHaveText(['document.md', 'Image 1', 'Image 2', 'Image 3']);
  await expect(draftChips.locator('img')).toHaveCount(3);
  expect(await draftChips.locator('img').evaluateAll(images => images.map(image => image.getAttribute('src')))).toEqual(pastedData.slice(1).map(data => `data:image/png;base64,${data}`));
  await expect.poll(() => draftChips.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  const assertChipFlow = async () => {
    const geometry = await panel.locator('.assistant-composer .assistant-references').evaluate(list => ({
      right: list.getBoundingClientRect().right, gap: parseFloat(getComputedStyle(list).gap),
      chips: [...list.children].map(chip => { const box = chip.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, width: box.width }; }),
    }));
    for (let n = 1; n < geometry.chips.length; n++) {
      const previous = geometry.chips[n - 1], next = geometry.chips[n];
      expect(next.right).toBeLessThanOrEqual(geometry.right + 1);
      if (next.top > previous.top) expect(previous.right + geometry.gap + next.width).toBeGreaterThan(geometry.right);
      else expect(next.left).toBeGreaterThanOrEqual(previous.right);
    }
    expect(geometry.chips.some((chip, n, chips) => n > 0 && chip.top === chips[n - 1].top)).toBe(true);
  };
  await assertChipFlow();
  await expect(message).toHaveValue('What changed in the current document?');
  expect(await message.evaluate(element => {
    const data = new DataTransfer(); data.setData('text/plain', 'plain text');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    element.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
  if (screenshots) {
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: /^(Settings|설정)$/, exact: true }).click();
      await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption(theme);
      await page.locator('[data-tab-id="settings"] .document-tab-close').click();
      await panel.locator('textarea').focus();
      await expect(draftChips).toHaveText(['document.md', '이미지 1', '이미지 2', '이미지 3']);
      await assertChipFlow();
      await page.screenshot({ path: `tmp/1589-${theme}-1440-ko.png`, mask: [page.locator(".sidebar-host-account")] });
    }
    await page.setViewportSize({ width:640,height:900 });
    await assertChipFlow();
    await page.screenshot({ path:'tmp/1589-dark-640-ko.png' });
    await page.setViewportSize({ width:1440,height:1000 });
    await page.getByRole('button', { name:'설정',exact:true }).click();
    await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
    await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  }
  sendGate = new Promise(resolve => { releaseSend = resolve; });
  sendReplyGate = new Promise(resolve => { releaseSendReply = resolve; });
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByRole('group', { name: 'Your message', exact: true })).toContainText('What changed in the current document?');
  await expect(message).toHaveValue('');
  await expect(draftChips).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await message.fill('New draft during send');
  // #1424: a hidden first send is recovered by the same receipt observer, never resent.
  const statusTrigger = page.getByRole('button', { name: /^Assistant(?: — |$)/ });
  const beforeHiddenSend = snapshots;
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(statusTrigger).toHaveAccessibleName('Assistant — Working…');
  releaseSend(); sendGate = undefined;
  await expect.poll(() => snapshots).toBeGreaterThan(beforeHiddenSend);
  expect(sent.length).toBe(1);
  await statusTrigger.click();
  // Provider observation/query wins the race with the POST response, even on the first conversation.
  await expect(panel.getByText('Partial answer', { exact: true })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Your message', exact: true })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
  await expect(message).toBeEnabled();
  await expect(message).toHaveValue('New draft during send');
  selected.turns[0].items.find(item => item.kind === 'assistant').text += ' with newer output';
  await expect(panel.locator('.assistant-markdown')).toContainText('with newer output');
  await panel.evaluate(el => { window.postRewound = false; window.postObserver = new MutationObserver(() => {
    if (el.querySelector('.assistant-markdown')?.textContent.trim() === 'Partial answer') window.postRewound = true;
  }); window.postObserver.observe(el, {subtree:true,childList:true,characterData:true}); });
  const firstPostReply = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'send');
  releaseSendReply(); sendReplyGate = undefined;
  await (await firstPostReply).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.postRewound)).toBe(false);
  await page.evaluate(() => window.postObserver.disconnect());
  await expect(message).toHaveValue('New draft during send');
  await message.fill('');
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
  expect(sent[0].references).toEqual([assistantFixture.document, ...pastedPaths.slice(1)]);
  await expect(panel.locator('.assistant-user .assistant-reference')).toHaveCount(4);
  await expect(panel.locator('.assistant-user .assistant-reference')).toHaveText(['document.md', 'Image 1', 'Image 2', 'Image 3']);
  await expect(panel.locator('.assistant-user .assistant-reference img')).toHaveCount(3);
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
  sendGate = new Promise(resolve => { releaseSend = resolve; });
  await panel.getByRole('button', { name: 'Steer conversation', exact: true }).click();
  await expect(draftChips).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Your message', exact: true })).toHaveCount(2);
  await expect(panel.locator('.assistant-submission .assistant-reference')).toHaveCount(1);
  releaseSend(); sendGate = undefined;
  await expect(panel.locator('.assistant-steps').first()).not.toHaveAttribute('open');
  await panel.locator('.assistant-steps').filter({ hasText: 'File reference received.' }).locator('summary').click();
  await expect(panel.getByText('File reference received.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Your message', exact: true })).toHaveCount(2);
  expect(sent.at(-1).message).toBe('');
  expect(sent.at(-1).skills).toEqual([]);
  expect(sent.at(-1).references).toEqual([assistantFixture.document]);
  await message.click(); await page.keyboard.type('/lit', { delay: 60 });
  await expect(skillOptions.getByRole('option')).toBeVisible();
  await skillOptions.getByRole('option').click();
  await expect(draftChips).toHaveCount(1);
  await message.press('End'); await page.keyboard.type('Focus on the unsaved paragraph.', { delay: 30 });
  await expect(panel.locator('.assistant-footer button')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Stop response', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Steer conversation' }).click();
  await expect(message).toHaveValue('');
  await panel.locator('.assistant-steps').filter({ hasText: 'Direction updated: focus on the unsaved paragraph.' }).last().locator('summary').click();
  await expect(panel.getByText('Direction updated: focus on the unsaved paragraph.', { exact: true }).last()).toBeVisible();
  expect(sent.at(-1).skills).toEqual([{ name: skill.name, path: skill.path }]);
  expect(sent.at(-1).message).toBe('$litzio-guide Focus on the unsaved paragraph.');
  await expect(draftChips).toHaveCount(0);
  expect(sent[1].id).toBe('thread-1');
  await expect(panel.getByText('Context is nearly full. Start a new conversation soon.', { exact: true })).toBeVisible();
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('810 / 1,000 tokens · 81%');
  const contextTooltip = page.locator('[data-slot=tooltip-content][data-open]');
  await expect(contextTooltip).toContainText('ChatGPT login · example@example.invalid · plus');
  await expect(contextTooltip).toContainText('5 hours · 28% used');
  await expect(contextTooltip).toContainText('7 days · 12% used');
  await expect(contextTooltip).toContainText('Resets ');
  // Quota windows remain single readable rows inside the tooltip, not clipped.
  for (const row of await contextTooltip.locator('p').all()) {
    if (!(await row.textContent()).includes('% used')) continue;
    expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-slot=tooltip-content]')).toHaveCount(0);
  summaryAccount = { ...summaryAccount, planType: 'business' };
  summaryLimits = [{ name: 'Codex', windows: [], planType: 'business',
    individualLimit: { limit: 500, used: 208.24, remainingPercent: 58, resetsAt: 1795478400 },
    credits: { hasCredits: true, unlimited: false, balance: null }, spendControlReached: true }];
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(contextTooltip).toContainText('Individual limit · 208 / 500 · 42% used');
  await expect(contextTooltip).toContainText('58% remaining');
  await expect(contextTooltip).toContainText('Credits available');
  await expect(contextTooltip).toContainText('Spending limit reached.');
  for (const row of await contextTooltip.locator('p').all()) {
    expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.mouse.move(0, 0); await expect(page.locator('[data-slot=tooltip-content]')).toHaveCount(0);
  summaryLimits = undefined; summaryAccount = { ...summaryAccount, planType: 'plus' };
  summaryFail = true;
  await message.focus();
  const contextRing = panel.getByRole('img', { name: 'Context usage' });
  for (let tab = 0; tab < 12 && !await contextRing.evaluate(element => element === document.activeElement); tab++) await page.keyboard.press('Tab');
  await expect(contextRing).toBeFocused();
  await expect(contextTooltip).toContainText('Unavailable');
  await expect(contextTooltip).not.toContainText('private provider failure');
  await expect(panel.getByRole('button', { name: 'Stop response', exact: true })).toBeEnabled();
  await panel.getByRole('img', { name: 'Context usage' }).blur();
  await expect(page.locator('[data-slot=tooltip-content]')).toHaveCount(0);
  summaryFail = false; summaryAccount = { type: 'apiKey' };
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(contextTooltip).toContainText('API key login');
  await expect(contextTooltip).not.toContainText('Usage and limits');
  await page.mouse.move(0, 0); await expect(page.locator('[data-slot=tooltip-content]')).toHaveCount(0);
  summaryAccount = null;
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(contextTooltip).toContainText('Codex login is required on the Host.');
  await expect(contextTooltip).not.toContainText('Usage and limits');
  await page.mouse.move(0, 0); await expect(page.locator('[data-slot=tooltip-content]')).toHaveCount(0);
  summaryAccount = { type: 'chatgpt', email: 'example@example.invalid', planType: 'plus' };
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/running-1440-light-en.png' });
  if (screenshots) await page.screenshot({ path: 'tmp/983-before-1440.png' });
  // #1436/#1440: same observer and response, with a large single-poll growth.
  // Checking after layout used to lose bottom-follow and pull readers near the end.
  const progressTurn = selected.turns[0], progressItems = progressTurn.items;
  const steps = panel.locator('.assistant-steps').first();
  const transcript = panel.locator('.assistant-transcript');
  const distanceFromEnd = () => transcript.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
  const progressReasoning = { id: 'progress-reasoning', kind: 'reasoning', text: 'Checking the document.' };
  // Preserve provider-observed user/submission identities while streaming work.
  progressTurn.items = [...progressItems.filter(item => item.kind === 'user'), progressReasoning];
  await expect(steps.locator('summary')).toContainText('Thinking… Checking the document.');
  await expect(steps).not.toHaveAttribute('open');
  await steps.locator('summary').click();
  progressReasoning.text += ' More context arrived.';
  await expect(steps).toContainText('More context arrived.');
  await expect(steps).toHaveAttribute('open', '');
  const progressTool = { id: 'progress-tool', kind: 'tool', text: 'read_document · document.md', status: 'inProgress' };
  progressTurn.items.push(progressTool);
  const toolStep = panel.locator('.assistant-steps[data-kind=tool]').last();
  await expect(toolStep.locator('summary')).toContainText('read_document · document.md');
  await expect(toolStep).not.toHaveAttribute('open');
  await expect(steps.locator('summary strong')).toHaveText('Thinking');
  await expect(steps).toHaveAttribute('open', '');
  await steps.locator('summary').click();
  const existingJump = panel.getByRole('button', { name: /Jump to bottom$/ });
  if (await existingJump.isVisible()) await existingJump.click();
  await expect.poll(distanceFromEnd).toBeLessThanOrEqual(2);
  progressTool.status = 'completed';
  const shellStep = { id: 'shell-step', kind: 'tool', text: "rg -n 'timeline' apps/editor", status: 'inProgress', work: { kind: 'execute', detail: 'apps/editor: timeline output' } };
  progressTurn.items.push(shellStep);
  const shellRow = panel.locator('.assistant-steps').last();
  await expect(shellRow.locator('summary')).toContainText("Shell rg -n 'timeline'");
  await expect(shellRow).toHaveAttribute('data-status', 'inProgress');
  await shellRow.locator('summary').click();
  await expect(shellRow.locator('pre')).toContainText("$ rg -n 'timeline' apps/editor\napps/editor: timeline output");
  await expect(steps).not.toHaveAttribute('open');
  shellStep.status = 'failed';
  await expect(shellRow).toHaveAttribute('data-status', 'failed');
  await shellRow.locator('summary').click();
  await expect(shellRow).not.toHaveAttribute('open');

  const progressAnswer = { id: 'progress-answer', kind: 'assistant', text: 'First answer.\n\n' + 'More explanation. 👨‍👩‍👧‍👦\n\n'.repeat(65) };
  // Output must advance while a window acknowledgement is still in flight.
  let releaseScreenReply;
  screenReplyGate = new Promise(resolve => { releaseScreenReply = resolve; });
  screenRequest = { id: 'slow-screen-ack', validForMs: 10000 };
  await expect.poll(() => screenReply?.activeTab).toBeTruthy();
  await steps.evaluate(el => { window.smoothSteps = el; window.smoothText = []; window.smoothObserver = new MutationObserver(() => {
    const text = el.parentElement?.querySelector('.assistant-markdown')?.textContent ?? '';
    if (text && window.smoothText.at(-1) !== text) window.smoothText.push(text);
  }); window.smoothObserver.observe(el.parentElement, { childList: true, characterData: true, subtree: true }); });
  progressTurn.items.push(progressAnswer);
  await expect(panel.locator('.assistant-markdown').first()).toContainText('More explanation.');
  expect(await steps.evaluate(el => el === window.smoothSteps)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.smoothText.length)).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.smoothText.every(text => !/[👨👩👧👦\u200d]/u.test(text.replaceAll('👨‍👩‍👧‍👦', ''))))).toBe(true);
  await page.evaluate(() => window.smoothObserver.disconnect());
  releaseScreenReply(); screenReplyGate = undefined;
  await expect(panel.locator('.assistant-progress')).toHaveText('Writing answer…');
  await expect.poll(() => steps.evaluate(el => !!(el.compareDocumentPosition(el.parentElement.querySelector('.assistant-answer')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(steps).not.toHaveAttribute('open');
  await expect.poll(distanceFromEnd).toBeLessThanOrEqual(2);
  const transcriptBox = await transcript.boundingBox();
  // Target the transcript gutter; the center may hover a restored-message action
  // whose portalled tooltip becomes the native wheel target on Linux.
  await page.mouse.move(transcriptBox.x + 8, transcriptBox.y + transcriptBox.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(distanceFromEnd).toBeGreaterThan(30);
  const readingTop = await transcript.evaluate(el => el.scrollTop);
  progressAnswer.text += 'New material.\n\n'.repeat(35);
  const jump = panel.getByRole('button', { name: 'New content · Jump to bottom', exact: true });
  await expect(jump).toBeVisible();
  expect(await transcript.evaluate(el => el.scrollTop)).toBe(readingTop);
  await jump.click();
  await expect.poll(distanceFromEnd).toBeLessThanOrEqual(2);
  await expect(jump).toHaveCount(0);
  progressAnswer.text += 'Further material.\n\n'.repeat(35);
  await expect(panel.getByRole('group', { name: 'Assistant response' })).toContainText('Further material.');
  await expect.poll(distanceFromEnd).toBeLessThanOrEqual(2);
  progressTurn.items = progressItems;
  await expect(panel.getByText('The unsaved paragraph adds a clear qualification.', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(statusTrigger).toHaveAttribute('data-status', 'working');
  // Explicit display changes also run with the sending panel closed.
  displayRequest = { id: 'closed-panel-display', validForMs: 10000, changes: { theme: 'dark' } };
  selected.userInput = { requestId: 'question-983', turnId: selected.turns[0].id, questions: [
    { id: 'constructor', header: 'Scope', question: 'Which part should I explain?', isOther: true, isSecret: false, options: [{ label: 'Summary', description: 'Explain the main points.' }, { label: 'Details', description: 'Explain each step.' }] },
    { id: '__proto__', header: 'Private input', question: 'Enter a private example.', isOther: false, isSecret: true, options: null }
  ] };
  await expect(statusTrigger).toHaveAccessibleName('Assistant — Needs your attention');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => displayReply?.after?.theme).toBe('dark');
  displayRequest = undefined;
  await statusTrigger.focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(statusTrigger).toBeFocused();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Needs your attention');
  await statusTrigger.click();
  const questionCard = panel.getByTestId('assistant-question');
  await expect(questionCard).toBeVisible();
  expect(await questionCard.evaluate(el => !!el.closest('details'))).toBe(false);
  await questionCard.scrollIntoViewIfNeeded();
  expect(await questionCard.evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(steps).not.toHaveAttribute('open');
  await expect(panel.locator('.assistant-progress')).toHaveText('Needs your attention');
  if (screenshots) await page.screenshot({ path: 'tmp/983-after-1440.png' });
  await questionCard.getByRole('radio', { name: /Summary/ }).check();
  await questionCard.getByLabel('Your answer').fill('private example');
  await expect(questionCard.getByLabel('Your answer')).toHaveAttribute('type', 'password');
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
  await expect(questionCard.getByRole('radio', { name: /Summary/ })).toBeChecked();
  await expect(questionCard.getByLabel('Your answer')).toHaveValue('private example');
  let releaseAnswer;
  answerGate = new Promise(resolve => { releaseAnswer = resolve; });
  await questionCard.getByRole('button', { name: 'Submit answers' }).click();
  await expect(questionCard.getByRole('button', { name: 'Submit answers' })).toBeDisabled();
  await expect.poll(() => submittedAnswers.length).toBe(1);
  releaseAnswer(); answerGate = undefined;
  await expect(questionCard).toHaveCount(0);
  expect(submittedAnswers).toEqual([{ action: 'answer', id: selected.id, turnId: selected.turns[0].id, requestId: 'question-983', answers: { constructor: { answers: ['Summary'] }, ['__proto__']: { answers: ['private example'] } }, displayClient: sent.at(-1).displayClient }]);
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
  // Completion arrives while closed; opening acknowledges it and re-closing stays quiet.
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  // Closing an unfinished reopen/setup refresh retains the admitted turn observer.
  settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  await statusTrigger.click();
  await expect(message).toBeDisabled();
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  releaseSettings(); settingsGate = undefined;
  selected.turns[0].status = 'completed';
  await expect(statusTrigger).toHaveAccessibleName('Assistant — Completed (unread)');
  await statusTrigger.click();
  await expect(message).toBeEnabled();
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(statusTrigger).toHaveAccessibleName('Assistant');
  await expect(statusTrigger).not.toHaveAttribute('data-status');
  await statusTrigger.click();
  selected.turns[0].status = 'inProgress';
  await expect(panel.getByRole('button', { name: 'Stop response' })).toBeEnabled();

  const actionButton = panel.locator('.assistant-footer button');
  const buttonNode = await actionButton.elementHandle();
  await message.fill('Draft direction');
  await expect(actionButton).toHaveAccessibleName('Steer conversation');
  expect(await actionButton.evaluate((element, original) => element === original, buttonNode)).toBe(true);
  await actionButton.focus();
  selected.turns[0].status = 'completed';
  await expect(actionButton).toHaveAccessibleName('Send message');
  await expect(actionButton).toBeFocused();
  selected.turns[0].status = 'inProgress';
  await expect(actionButton).toHaveAccessibleName('Steer conversation');
  await expect(actionButton).toBeFocused();
  await message.fill('');
  await expect(actionButton).toHaveAccessibleName('Stop response');
  await expect(actionButton).toHaveCount(1);
  await actionButton.click();
  expect(selected.turns.at(-1).status).toBe('interrupted');
  await expect(panel.getByRole('button', { name: 'Model settings', exact: true })).toBeEnabled();
  // Assert direct completion state, without a reload or a polling assertion masking it.
  expect(await panel.locator('details').first().evaluate(element => element.open)).toBe(false);
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
  const hiddenSnapshots = snapshots;
  await expect.poll(() => snapshots, 'Open windows keep observing requests in background tabs').toBeGreaterThan(hiddenSnapshots);
  let releaseSnapshot;
  const blockedBefore = snapshotGateEntered;
  snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; });
  await visibility('visible');
  await expect.poll(() => snapshotGateEntered).toBeGreaterThan(blockedBefore);
  const resumedSnapshots = snapshots;
  await visibility('hidden'); await visibility('visible'); await visibility('visible');
  await page.waitForTimeout(1300);
  expect(snapshots, 'Visibility changes do not overlap an in-flight snapshot').toBe(resumedSnapshots);
  releaseSnapshot(); snapshotGate = undefined;
  await expect.poll(() => snapshots).toBeGreaterThan(resumedSnapshots);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
  setupMode = 'login';
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
  await expect(panel.getByText('Sign in to Codex to start a conversation.', { exact: true })).toBeVisible();
  const setupSnapshots = snapshots;
  await page.waitForTimeout(1300);
  expect(snapshots, 'Setup failure stops snapshot requests').toBe(setupSnapshots);
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  setupMode = 'ready';
  settingsGate = new Promise(resolve => { releaseSettings = resolve; });
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
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
  await expect(panel.locator('.assistant-user').first().locator('.assistant-reference')).toHaveText(['document.md', 'Image 1', 'Image 2', 'Image 3']);
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
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toHaveText('Copy answer');
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
        selected.turns[0].status = 'inProgress';
        await expect(panel.getByRole('button', { name: '응답 중단', exact: true })).toBeEnabled();
        await page.screenshot({ path: `tmp/1485-running-${width}-${theme}-ko.png` });
        await panel.locator('textarea').fill('진행 중인 작업에 추가');
        await page.screenshot({ path: `tmp/1485-steer-${width}-${theme}-ko.png` });
        await panel.locator('textarea').fill('');
        selected.turns[0].status = 'completed';
        await expect(panel.getByRole('button', { name: '메시지 보내기', exact: true })).toBeDisabled();
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
  await waitForExplorerLayout(page);
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
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
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
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
  await panel.getByRole('button', { name: '새 대화' }).click();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  setupMode = 'login'; await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
  await expect(panel.getByText('대화를 시작하려면 Codex에 로그인하세요.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox')).toBeDisabled();
  if (screenshots) await page.screenshot({ path: 'tmp/931-evidence/setup-640-dark-ko.png' });
  await panel.getByRole('button', { name: '비서 설정 열기' }).click();
  await expect(page.getByRole('heading', { name: '비서', exact: true }).last()).toBeVisible();
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await expect(panel).toBeHidden();
  expect(await page.locator('.app-main').evaluate(element => element.inert)).toBe(false);
  setupMode = 'missing'; await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
  await expect(panel.getByText('이 컴퓨터에서 Codex CLI를 찾을 수 없습니다. 설치 후 설정에서 진단을 실행하세요.', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  setupMode = 'ready';
  const historyEntries = [
    { ...selected, id: 'history-older', title: '문서 구조와 검토 계획 정리', folders: ['C:\\Projects\\reports\\연구 보고서', '/home/example/work/검토 자료'], updatedAt: 1793590000000 },
    { ...selected, id: 'history-newer', title: '실험 결과 표와 다음 작업 확인', folders: ['C:\\Projects\\reports\\실험 결과'], updatedAt: 1793593600000 },
  ];
  for (const entry of historyEntries) conversations.set(entry.id, entry);
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
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
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(await panel.locator('.assistant-history').count(), 'Reopening returns to the conversation, not its history list').toBe(0);
  // A full page reload loses React state but preserves the selected older thread.
  await page.reload();
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  expect(selected.id).toBe('history-older');
  await expect(panel.getByText('What changed in the current document?', { exact: true })).toBeVisible();
  await expect(panel.locator('.assistant-user .assistant-reference').first()).toHaveText('document.md');
  // A stored thread that cannot resume falls back quietly, with usable defaults.
  await panel.getByRole('button', { name: '비서 닫기' }).click();
  resumeFailure = true;
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
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
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
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
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('textbox').fill('다크 테마, 한국어, 넓은 문서와 평면 배경으로 바꿔 주세요.');
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.locator('.assistant-turn')).toHaveCount(1);
  selected.turns[0].status = 'completed';
  displayRequest = { id: 'display-read', validForMs: 10000 };
  await expect.poll(() => displayReply?.after?.theme).toBe('light');
  const displayBefore = displayReply.after;
  screenRequest = { id: 'screen-dirty-document', validForMs: 10000 };
  await expect.poll(() => screenReply?.activeTab?.unsaved).toBe(true);
  expect(screenReply.activeTab.kind).toBe('document');
  expect(screenReply.activeTab.path).toBe(sent.at(-1).document.path);
  expect(screenReply.tabs.find(tab => tab.id === screenReply.activeTab.id)).toEqual(screenReply.activeTab);
  expect(JSON.stringify(screenReply)).not.toContain('display settings draft');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  screenReply = undefined; screenRequest = { id: 'screen-settings', validForMs: 10000 };
  await expect.poll(() => screenReply?.activeTab?.kind).toBe('settings');
  expect(screenReply.activeTab.hostId).toBeNull();
  expect(screenReply.tabs.some(tab => tab.kind === 'document' && tab.unsaved)).toBe(true);
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
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
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
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
  await message.fill('Wait until completion');
  await expect(panel.locator('.assistant-footer button')).toHaveAccessibleName('Stop response');
  const copilotSendCount = sent.length;
  await message.press('Enter');
  expect(sent.length).toBe(copilotSendCount);
  await message.fill('');
  const readsBeforeCopilot = summaryReads;
  await panel.getByRole('img', { name: 'Context usage' }).hover();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toBeVisible();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).not.toContainText('Account');
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('15,000 / 200,000');
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Session cost: 0.25 USD');
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Latest reported usage: 14,000');
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Copilot does not provide account limit information.');
  expect(summaryReads).toBe(readsBeforeCopilot);
  await page.mouse.move(0, 0);
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
  await referenceRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to chat', exact: true }).click();
  await message.fill('Prompt lost before provider record');
  await message.press('Enter');
  await expect(panel.getByRole('group', { name: 'Your message', exact: true }).filter({ hasText: 'Prompt lost before provider record' })).toHaveCount(1);
  await expect(panel.locator('.assistant-turn .assistant-user').filter({ hasText: 'Prompt lost before provider record' })).toHaveCount(1);
  const failedPrompt = selected.turns.at(-1);
  failedPrompt.status = 'failed'; failedPrompt.error = 'Prompt transport failed before recording';
  const failedPromptId = sent.at(-1).submissionId;
  receipts.set(failedPromptId, { submission: { id: failedPromptId, status: 'unknown', conversationId: selected.id, error: failedPrompt.error }, conversation: selected });
  await expect(panel).toContainText('Prompt transport failed before recording');
  const sendsBeforeResume = sent.length;
  await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).first().click();
  await expect(panel.getByRole('group', { name: 'Your message', exact: true }).filter({ hasText: 'Prompt lost before provider record' })).toHaveCount(1);
  await expect(message).toBeEnabled();
  await expect(panel.locator('.assistant-submission')).toHaveCount(0);
  expect(sent.length).toBe(sendsBeforeResume);
  await panel.getByRole('button', { name: 'Model settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copilot fixture model', exact: true }).click();
  await message.fill('Recover supported model'); await message.press('Enter');
  await expect(panel.getByText('Fixture rejection response lost', { exact: true })).toBeVisible();
  const retryId = sent.at(-1).submissionId;
  await message.fill('New draft survives retry');
  await panel.getByRole('button', { name: 'Reasoning effort settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'max', exact: true }).click();
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(panel.locator('.assistant-submission')).toHaveCount(0);
  expect(sent.at(-1).submissionId).toBe(retryId);
  await expect(message).toHaveValue('New draft survives retry');
  // Navigation during a response does not stop that response.
  const runningConversation = selected;
  await panel.getByRole('button', { name: 'Conversation history', exact: true }).click();
  await expect(panel.locator('.assistant-history')).toBeVisible();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  expect(runningConversation.turns.at(-1).status).toBe('inProgress');
  await message.fill('Uncertain first');
  const beforeLost = sent.length;
  await message.press('Enter');
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await message.fill('Preserved after lost response');
  if (screenshots) await panel.screenshot({ path: 'tmp/1542-retry-1440.png' });
  revealLost = true; // Same live Host still has the accepted submission.
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(panel.locator('.assistant-submission')).toHaveCount(0);
  expect(sent.length).toBe(beforeLost + 1);
  await expect(message).toHaveValue('Preserved after lost response');
  await expect(panel.getByRole('group', { name: 'Your message', exact: true }).filter({ hasText: 'Uncertain first' })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  revealLost = false;
  await message.fill('Uncertain first'); await message.press('Enter');
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  const lostId = sent.at(-1).submissionId, beforeRestartRetry = sent.length;
  // Response loss -> Host restart: the provider ran, but the replacement Host has no receipt.
  receipts.clear(); lostResult = undefined; forgottenSubmissions = true;
  await message.fill('Separate draft after restart');
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(panel.getByText('Unable to confirm acceptance', { exact: true })).toBeVisible();
  expect(sent.length, 'Retry after Host restart must never dispatch the forgotten submission').toBe(beforeRestartRetry);
  await expect(message).toHaveValue('Separate draft after restart');
  const newSend = panel.getByRole('button', { name: 'Send as new', exact: true });
  await newSend.hover();
  await expect(page.getByText('Send the original message as a new request. The previous request may already have run.', { exact: true })).toBeVisible();
  if (screenshots) await panel.screenshot({ path: 'tmp/1542-restart-retry-1440.png' });
  allowNewSend = true;
  await newSend.click();
  await expect.poll(() => sent.length).toBe(beforeRestartRetry + 1);
  expect(sent.at(-1).submissionId).not.toBe(lostId);
  expect(sent.at(-1).message).toBe('Uncertain first');
  await expect(panel.locator('.assistant-submission')).toHaveCount(0);
  forgottenSubmissions = false;
  await expect(message).toHaveValue('Separate draft after restart');
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
    await page.getByRole('button', { name: /^비서(?: — |$)/ }).click();
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
  // Admission is already known even when the provider's user row is late (#1522).
  await page.getByRole('button', { name: /^(Settings|설정)$/ }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await page.getByRole('button', { name: /^Assistant(?: — |$)/ }).click();
  if (await panel.getByRole('button', { name: 'Stop response', exact: true }).isVisible()) await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  let releaseLateSnapshot, releaseLateReceipt;
  snapshotGate = new Promise(resolve => { releaseLateSnapshot = resolve; });
  receiptGate = new Promise(resolve => { releaseLateReceipt = resolve; });
  await message.fill('Accepted before observation');
  await message.press('Enter');
  await expect(panel.locator('.assistant-submission')).toContainText('Accepted before observation');
  await expect(panel.locator('.assistant-submission-status')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Your message', exact: true })).toHaveCount(1);
  expect(sent.filter(value => value.message === 'Accepted before observation').length).toBe(1);
  releaseLateSnapshot(); snapshotGate = undefined; releaseLateReceipt(); receiptGate = undefined;
  await expect(panel.locator('.assistant-submission')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Your message', exact: true })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  // #1548: provider history may still lack its correlated row after Stop.
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await message.fill('Accepted before observation'); await message.press('Enter');
  await expect(panel.locator('.assistant-submission-status')).toHaveCount(0);
  for (const turn of selected.turns) for (const item of turn.items) if (item.kind === 'user') item.userMessageSource = 'host';
  const previousConversation = selected.id;
  await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'New conversation', exact: true })).toBeEnabled();
  // Paced input leaves time for the idle observer, as ordinary user typing would.
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  await panel.getByRole('button', { name: 'Model settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copilot fixture model', exact: true }).click();
  await message.pressSequentially('A separate conversation', { delay: 100 });
  await message.press('Enter');
  await expect.poll(() => sent.at(-1).message).toBe('A separate conversation');
  expect(sent.at(-1).id, 'New conversation must not send the previous provider ID').toBeUndefined();
  expect(selected.id).not.toBe(previousConversation);
  await expect(panel.getByText('Accepted before observation', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Stop response', exact: true }).click();
  // Restore preferences for the other stable scenarios.
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'en'); localStorage.setItem(prefix + '.theme', 'light'); localStorage.removeItem(prefix + '.assistantWidth'); localStorage.removeItem(prefix + '.assistantConversation:local'); }, brand.storagePrefix);
  return { settings: true, minimumViewport: true, nativeDocumentPreserved: true, conversations: true };
}
