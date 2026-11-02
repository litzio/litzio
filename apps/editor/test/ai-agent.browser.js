async (page, { expect, openPath, pluginFixture, screenshots, brand }) => {
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
  await page.route('**/api/ai-agent-settings*', route => {
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
  expect(settings).toEqual({ provider: 'codex', enabled: true, writeAccess: 'opened-folders', model: 'gpt-6.1-sol', reasoningEffort: 'high' });
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
  return { settings: true, minimumViewport: true, nativeDocumentPreserved: true };
}
