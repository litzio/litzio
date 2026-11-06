async (page, { expect, screenshots, brand }) => {
  await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'ko'); localStorage.setItem(prefix + '.theme', 'dark'); }, brand.storagePrefix);
  const settings = { provider: 'codex', model: 'gpt-6-luna', reasoningEffort: 'low', permissionMode: 'read-only' };
  const id = '00000000-0000-4000-8000-000000000001';
  let conversation;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: 'gpt-6-luna', displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, provider: 'codex', account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST') {
      const input = r.request().postDataJSON();
      conversation = { id, provider: 'codex', title: '합성 로그 연결 시험', folders: [], createdAt: 1, updatedAt: 1, model: 'gpt-6-luna', reasoningEffort: 'low', turns: [{ id: 'turn', status: 'completed', items: [{ id: 'user', kind: 'user', text: input.message }, { id: 'assistant', kind: 'assistant', text: '합성 시험 대화입니다. 공급자 원본은 외부 앱에서 확인할 수 있습니다.' }] }] };
    }
    return r.fulfill({ json: conversation ?? [] });
  });
  await page.reload();
  await page.keyboard.press('Control+Shift+Y');
  const panel = page.getByTestId('assistant-panel');
  const open = panel.getByRole('button', { name: '공급자 로그를 메모장에서 열기', exact: true });
  await expect(open).toBeDisabled();
  await page.evaluate(() => { window.logCalls = []; window.litzioDesktop = { providerSessionLog: async (...args) => { window.logCalls.push(args); } }; });
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(panel).toBeVisible();
    await page.mouse.move(0, 999);
    if (screenshots) await panel.screenshot({ path: `tmp/1304/no-conversation-${width}-dark-ko.png` });
  }
  await panel.getByRole('textbox').fill('이 합성 대화의 공급자 로그를 확인하고 싶습니다.');
  await panel.getByRole('button', { name: '메시지 보내기', exact: true }).click();
  await expect(open).toBeEnabled();
  expect(await page.evaluate(() => window.logCalls)).toEqual([]);
  await open.click();
  await expect.poll(() => page.evaluate(() => window.logCalls)).toEqual([['local', id, 'codex', 'open']]);
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(panel).toBeVisible();
    await page.mouse.move(0, 999);
    if (screenshots) await panel.screenshot({ path: `tmp/1304/provider-log-${width}-dark-ko.png` });
  }
  await panel.getByRole('button', { name: '공급자 로그 파일 위치 표시', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.logCalls.at(-1))).toEqual(['local', id, 'codex', 'reveal']);
  await page.evaluate(() => { window.litzioDesktop.providerSessionLog = async () => ({ available: false, reason: 'missing' }); });
  await open.click();
  await expect(panel.getByRole('alert')).toContainText('공급자 로그가 없거나 이미 삭제되었습니다.');
}
