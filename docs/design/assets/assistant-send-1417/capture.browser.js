async (page, { expect, brand }) => {
  // Manual visual procedure, outside the stable suite. Synthetic data only.
  const stage = 'after';
  const settings = { provider: 'codex', permissionMode: 'read-only', model: 'gpt-6-luna', reasoningEffort: 'low' };
  let release, gate, sends = 0;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', async r => {
    if (r.request().method() !== 'POST') {
      const id = (r.request().url().split('submissionId=')[1] ?? '').split('&')[0];
      return r.fulfill({ json: id ? { submission: { id, status: 'pending' } } : [] });
    }
    const body = r.request().postDataJSON();
    sends++; await gate;
    const conversation = { id: 'synthetic-thread', title: 'Synthetic review', folders: [], createdAt: 1, updatedAt: 1, ...settings, turns: [{ id: 'turn', status: 'completed', items: [{ id: 'user', submissionId: body.submissionId, kind: 'user', text: body.message }] }] };
    return r.fulfill({ json: stage === 'before' ? conversation : { submission: { id: body.submissionId, status: 'rejected', error: 'Synthetic provider unavailable' } } });
  });
  for (const width of [1440, 640]) {
    await page.evaluate(({ prefix, width }) => {
      localStorage.removeItem(prefix + '.assistantConversation:local');
      localStorage.setItem(prefix + '.uiLanguage', width === 640 ? 'ko' : 'en');
      localStorage.setItem(prefix + '.theme', width === 640 ? 'dark' : 'light');
    }, { prefix: brand.storagePrefix, width });
    await page.setViewportSize({ width, height: 1000 }); await page.reload();
    await page.getByRole('button', { name: /^(Assistant|비서)$/ }).first().click();
    const panel = page.getByTestId('assistant-panel'), input = panel.getByRole('textbox');
    await expect(input).toBeEnabled();
    await input.fill('검토할 문서와 확인할 조건을 정리해 주세요.');
    gate = new Promise(resolve => { release = resolve; });
    const before = sends;
    await input.press('Enter');
    await expect.poll(() => sends).toBe(before + 1);
    await panel.screenshot({ path: `docs/design/assets/assistant-send-1417/${stage}-${width}.png` });
    release();
    if (stage === 'after') {
      await expect(panel.getByRole('button', { name: /^(Restore to input|입력으로 복원)$/ })).toBeEnabled();
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await panel.screenshot({ path: `docs/design/assets/assistant-send-1417/${stage}-${width}-rejected.png` });
    } else await expect(input).toHaveValue('');
  }
}
