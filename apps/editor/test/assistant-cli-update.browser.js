async (page, { expect, screenshots, brand }) => {
  // #1904: provider CLI release status and the Host-run update in Assistant diagnostics. Synthetic Host values only.
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'ko'); localStorage.setItem(prefix + '.theme', 'light'); }, brand.storagePrefix);
  const settings = { provider: 'codex', model: 'gpt-6-luna', reasoningEffort: 'low', permissionMode: 'full-access', responseLanguage: 'ko', copilotModelSource: 'account', ollamaUrl: 'http://localhost:11434' };
  const model = { id: 'luna', model: 'gpt-6-luna', displayName: 'GPT Luna', description: '', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: '' }] };
  let version = { version: 'codex-cli 0.171.0', versionStatus: 'available', latestVersion: '0.172.0', latestCheckedAt: 1793590000000 }, reads = 0;
  let update = { provider: 'codex', status: 'idle', output: '' }, started = 0;
  await page.route('**/api/assistant/settings*', route => route.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', route => route.fulfill({ json: { provider: route.request().url().includes('provider=copilot') ? 'copilot' : 'codex', updatedAt: 1, models: [model] } }));
  await page.route('**/api/assistant/environment*', route => route.fulfill({ json: { cwd: 'C:\\Example\\assistant', instructions: 'C:\\Example\\assistant\\AGENTS.md', skills: [] } }));
  await page.route('**/api/assistant/diagnostics*', route => {
    if (!route.request().url().includes('cache=prefer')) reads++;
    return route.fulfill({ json: { provider: route.request().url().includes('provider=copilot') ? 'copilot' : 'codex', checkedAt: 1793590000000, path: 'C:\\Example\\bin\\codex.exe', connected: true, account: { type: 'apiKey' }, mcp: [], rateLimits: [], ...version } });
  });
  await page.route('**/api/assistant/provider-update*', route => {
    if (route.request().method() === 'POST') { started++; update = { provider: 'codex', status: 'running', startedAt: 1, output: 'Updating Codex…\n==> Resolved version: 0.172.0\n' }; }
    return route.fulfill({ json: update });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('navigation', { name: '설정 분류' }).getByRole('button', { name: '비서', exact: true }).click();
  await page.getByTestId('settings-dialog').getByRole('button', { name: '진단', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Codex 진단', exact: true })).toBeVisible();
  const status = page.getByTestId('assistant-cli-version-status'), button = page.getByTestId('assistant-cli-update');
  const capture = async name => { if (screenshots) { await page.mouse.move(0, 999); await page.getByTestId('settings-dialog').screenshot({ path: `tmp/1904/${name}.png` }); } };
  await expect(status).toHaveText('업데이트 있음');
  await status.hover();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('최신 공개 버전 0.172.0');
  await capture('available-1440-light-ko');

  // The run continues on the Host; the screen follows it and re-reads diagnostics once it ends.
  await button.click();
  await expect(button).toHaveText('업데이트 중…');
  await expect(button).toBeDisabled();
  await expect(page.getByTestId('assistant-cli-update-output')).toContainText('Resolved version: 0.172.0');
  await capture('running-1440-light-ko');
  if (screenshots) {
    // Capture only: the owner's main width, the minimum width and the dark theme of the same running state.
    await page.setViewportSize({ width: 1920, height: 1080 }); await capture('running-1920-light-ko');
    await page.setViewportSize({ width: 640, height: 900 });
    expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await capture('running-640-light-ko');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
    await capture('running-1440-dark-ko');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.style.colorScheme = 'light'; });
  }
  const before = reads;
  version = { version: 'codex-cli 0.172.0', versionStatus: 'current', latestVersion: '0.172.0', latestCheckedAt: 1793590000000 };
  update = { ...update, status: 'succeeded', exitCode: 0, finishedAt: 2, output: update.output + 'Codex CLI 0.172.0 installed successfully.\n' };
  await expect(page.getByTestId('assistant-cli-update-result')).toContainText('업데이트했습니다. 진행 중인 응답이 있으면 끝난 뒤 새 버전을 씁니다.');
  await expect(status).toHaveText('최신 버전');
  expect(reads).toBeGreaterThan(before);
  await expect(button).toHaveText('업데이트');
  // Up to date: the screen does not offer the update (the Host operation and CLI still run it).
  await expect(button).toBeDisabled();
  // The pointer still rests where the enabled button was clicked; enter the trigger again as a person would.
  await page.mouse.move(0, 999);
  await button.locator('..').hover();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('이미 최신 버전입니다.');
  await capture('succeeded-1440-light-ko');

  version = { version: 'codex-cli 0.172.0', versionStatus: 'available', latestVersion: '0.173.0', latestCheckedAt: 1793590000000 };
  await page.getByRole('button', { name: '다시 진단', exact: true }).click();
  await expect(button).toBeEnabled();
  await button.click();
  update = { ...update, status: 'failed', exitCode: 1, finishedAt: 3, output: update.output + 'error: release download failed\n' };
  const result = page.getByTestId('assistant-cli-update-result');
  await expect(result).toContainText('업데이트하지 못했습니다(종료 코드 1).');
  await result.getByText('출력', { exact: true }).click();
  await expect(result.getByTestId('assistant-cli-update-output')).toContainText('release download failed');
  expect(started).toBe(2);
  await capture('failed-1440-light-ko');

  // A failed release check is "couldn't check"; a CLI without its own update command cannot be updated here.
  version = { version: 'codex-cli 0.171.0', versionStatus: 'unknown' };
  await page.getByRole('button', { name: '다시 진단', exact: true }).click();
  await expect(status).toHaveText('확인하지 못함');
  await expect(button).toBeEnabled();
  await capture('unknown-1440-light-ko');
  version = { ...version, updateUnavailable: 'unsupported' };
  await page.getByRole('button', { name: '다시 진단', exact: true }).click();
  await expect(button).toBeDisabled();
  await button.locator('..').hover();
  await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('이 CLI 버전에는 업데이트 명령이 없습니다.');
  await capture('unsupported-1440-light-ko');
}
