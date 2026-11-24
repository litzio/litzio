async (page, { expect, screenshots, brand }) => {
  // #1917: Ollama as the third AI provider — its settings row, diagnostics with the three reasons it cannot be used,
  // the address it is reached at, and the composer's provider choice. Synthetic Host values only.
  // An earlier scenario may leave its remembered conversation; this one starts with none.
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'ko'); localStorage.setItem(prefix + '.theme', 'light'); localStorage.removeItem(prefix + '.assistantConversation.v2'); }, brand.storagePrefix);
  let settings = { provider: 'codex', model: 'gpt-6-luna', reasoningEffort: 'low', permissionMode: 'full-access', responseLanguage: 'ko', ollamaUrl: 'http://localhost:11434' };
  const writes = [];
  const efforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(reasoningEffort => ({ reasoningEffort, description: '' }));
  const acp = { reasoningEffortSource: 'config', reasoningEfforts: efforts, currentMode: 'agent', modes: [{ id: 'agent', name: 'Agent', description: '' }, { id: 'plan', name: 'Plan', description: '' }] };
  const catalogs = {
    codex: { provider: 'codex', updatedAt: 1, models: [{ id: 'luna', model: 'gpt-6-luna', displayName: 'GPT Luna', description: '', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: '' }] }] },
    copilot: { provider: 'copilot', updatedAt: 1, copilot: { ...acp, reasoningEffortSource: 'cli', reasoningEfforts: undefined }, models: [{ id: 'auto', model: 'auto', displayName: 'Auto', description: '', defaultReasoningEffort: 'medium', supportedReasoningEfforts: efforts }] },
    ollama: { provider: 'ollama', updatedAt: 1, copilot: acp, models: ['qwen3.5:4b', 'gemma4:e4b'].map(name => ({ id: name, model: name, displayName: name, description: '', defaultReasoningEffort: 'medium', supportedReasoningEfforts: efforts })) },
  };
  // Ollama's state on the synthetic Host: ok, unreachable, no-models or cli-missing.
  let ollama = 'ok', diagnosticReads = 0;
  const cli = { path: 'C:\\Example\\bin\\copilot.exe', version: '1.0.114', versionStatus: 'current', latestVersion: '1.0.114', latestCheckedAt: 1793590000000 };
  const diagnostics = provider => provider === 'ollama' ? {
    provider, checkedAt: 1793590000000, ...cli, connected: ollama === 'ok',
    ...(ollama === 'cli-missing' ? { path: null, version: null, versionStatus: 'unknown', updateUnavailable: 'missing' } : {}),
    ollama: { url: settings.ollamaUrl, models: ollama === 'unreachable' ? null : ollama === 'no-models' ? 0 : 2, ...(ollama === 'ok' ? {} : { unavailable: ollama }) },
    ...(ollama === 'ok' ? {} : { error: 'Synthetic Host message' }),
  } : provider === 'copilot' ? { provider, checkedAt: 1793590000000, ...cli, connected: true }
    : { provider, checkedAt: 1793590000000, path: 'C:\\Example\\bin\\codex.exe', version: 'codex-cli 0.172.0', versionStatus: 'current', connected: true, account: { type: 'apiKey' }, mcp: [], rateLimits: [] };
  // Scenarios run in a VM context without URL: read the query by pattern.
  const provider = route => /[?&]provider=([a-z]+)/.exec(route.request().url())?.[1] ?? settings.provider;
  await page.route('**/api/assistant/settings*', route => {
    if (route.request().method() === 'PUT') { settings = route.request().postDataJSON(); writes.push(settings); }
    return route.fulfill({ json: settings });
  });
  await page.route('**/api/assistant/models*', route => route.fulfill({ json: catalogs[provider(route)] }));
  await page.route('**/api/assistant/environment*', route => route.fulfill({ json: { cwd: 'C:\\Example\\assistant', instructions: 'C:\\Example\\assistant\\AGENTS.md', skills: [] } }));
  await page.route('**/api/assistant/diagnostics*', route => {
    if (provider(route) === 'ollama' && !route.request().url().includes('cache=prefer')) diagnosticReads++;
    return route.fulfill({ json: diagnostics(provider(route)) });
  });
  await page.route('**/api/assistant/provider-update*', route => route.fulfill({ json: { provider: provider(route) === 'codex' ? 'codex' : 'copilot', status: 'idle', output: '' } }));
  // No history on this Host: the list is empty and any conversation action finds nothing.
  await page.route('**/api/assistant/conversations*', route => route.fulfill(route.request().method() === 'GET' ? { json: [] } : { status: 400, json: { error: 'Conversation was not found.' } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  const dialog = page.getByTestId('settings-dialog');
  const capture = async (name, target = dialog) => { if (screenshots) { await page.mouse.move(0, 999); await target.screenshot({ path: `tmp/1917/${name}.png` }); } };
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('navigation', { name: '설정 분류' }).getByRole('button', { name: '비서', exact: true }).click();

  // Three provider rows of the same parts; the removed Copilot model source and its address row are gone.
  const rows = ['Codex 모델', 'Copilot 모델', 'Ollama 모델'].map(name => dialog.getByRole('button', { name, exact: true }));
  for (const row of rows) await expect(row).toBeVisible();
  await expect(rows[2]).toHaveText(/Ollama/);
  await expect(dialog.getByLabel('Copilot 모델 출처', { exact: true })).toHaveCount(0);
  await expect(dialog.getByTestId('ollama-url')).toHaveCount(0);
  const ollamaRow = rows[2].locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " shared-row ")]');
  await expect(ollamaRow).toContainText('사용 가능');
  await expect(dialog.getByLabel('기본 AI 공급자', { exact: true }).locator('option')).toHaveText(['Codex', 'GitHub Copilot', 'Ollama']);
  await capture('settings-1440-light-ko');

  // Diagnostics: address, connection with the installed model count, how it runs, and the Copilot CLI that runs it.
  await ollamaRow.getByRole('button', { name: '진단', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Ollama 진단', exact: true })).toBeVisible();
  await expect(dialog).toContainText('연결됨 · 모델 2개');
  await expect(dialog).toContainText('Copilot CLI로 실행');
  await expect(dialog).toContainText('1.0.114');
  await expect(dialog.getByTestId('assistant-cli-update')).toBeVisible();
  await capture('diagnostics-1440-light-ko');

  // The address is fixed here, with the same validation and commit as before.
  const address = dialog.getByTestId('ollama-url');
  await expect(address).toHaveValue('http://localhost:11434');
  const writesBefore = writes.length;
  await address.fill('localhost:11434?x=1');
  await address.press('Tab');
  await expect(address).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('http:// 또는 https:// 주소를 입력하세요.', { exact: true })).toBeVisible();
  expect(writes.length).toBe(writesBefore);
  const readsBefore = diagnosticReads;
  await address.fill('http://127.0.0.1:11500/');
  await address.press('Enter');
  await expect.poll(() => settings.ollamaUrl).toBe('http://127.0.0.1:11500');
  await expect(address).not.toHaveAttribute('aria-invalid', 'true');
  await expect.poll(() => diagnosticReads, { message: 'a new address re-reads Ollama' }).toBeGreaterThan(readsBefore);
  expect(settings).toMatchObject({ provider: 'codex', model: 'gpt-6-luna' });
  expect('copilotModelSource' in settings).toBe(false);

  // The three reasons Ollama cannot be used, each in its own words.
  for (const [state, reason] of [['unreachable', 'Ollama에 연결할 수 없습니다. 주소와 Ollama 실행 여부를 확인하세요.'], ['no-models', 'Ollama에 받아 둔 모델이 없습니다.'], ['cli-missing', 'Copilot CLI가 설치돼 있지 않습니다. Ollama는 Copilot CLI로 실행합니다.']]) {
    ollama = state;
    await dialog.getByRole('button', { name: '다시 진단', exact: true }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: reason })).toBeVisible();
    await expect(dialog).not.toContainText('Synthetic Host message');
    await capture(`diagnostics-${state}-1440-light-ko`);
  }
  // The settings row shows the same reason in its status tooltip.
  await dialog.getByRole('button', { name: '← 비서', exact: true }).click();
  await expect(ollamaRow).toContainText('사용 불가');
  await ollamaRow.getByText('사용 불가', { exact: true }).hover();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('Copilot CLI가 설치돼 있지 않습니다.');
  ollama = 'ok';

  // The composer offers Ollama third; choosing it lists Ollama's models.
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await page.getByRole('button', { name: /^비서(?: — |$)/ }).first().click();
  const panel = page.getByTestId('assistant-panel');
  const choice = panel.getByRole('button', { name: 'AI 공급자 설정', exact: true });
  await expect(choice).toHaveText('Codex');
  await choice.click();
  await expect(page.getByRole('menuitem')).toHaveText(['Codex', 'GitHub Copilot', 'Ollama']);
  if (screenshots) await page.screenshot({ path: 'tmp/1917/composer-providers-1440-light-ko.png' });
  await page.getByRole('menuitem', { name: 'Ollama', exact: true }).click();
  await expect(choice).toHaveText('Ollama');
  await expect(panel.getByRole('button', { name: '모델 설정', exact: true })).toHaveText('qwen3.5:4b');
  await expect(panel.getByRole('button', { name: '세션 모드 설정', exact: true })).toBeVisible();
  if (screenshots) {
    // Capture only: settings beside the panel at the owner's main width, the dark theme and the minimum width.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('navigation', { name: '설정 분류' }).getByRole('button', { name: '비서', exact: true }).click();
    await page.screenshot({ path: 'tmp/1917/settings-panel-1920-light-ko.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await panel.getByRole('button', { name: '비서 닫기', exact: true }).click();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
    await ollamaRow.getByRole('button', { name: '진단', exact: true }).click();
    await capture('diagnostics-1440-dark-ko');
    await page.setViewportSize({ width: 640, height: 900 });
    expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await capture('diagnostics-640-dark-ko');
  }
}
