async (page, { expect, openPath, assistantFixture, screenshots, brand }) => {
  const settings = { provider: 'codex', permissionMode: 'opened-folders', model: 'gpt-6-luna', reasoningEffort: 'low' };
  const statuses = ['completed', 'success', 'failed', 'declined', 'interrupted', 'pending', 'inProgress', 'running', 'future-state'];
  let conversation;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST' && r.request().postDataJSON().action === 'send') {
      const body = r.request().postDataJSON();
      conversation = { id: 'headers-fixture', title: '문서 검토', ...settings, folders: [], createdAt: 1, updatedAt: 1,
        turns: [{ id: 'turn', status: 'inProgress', items: [
          { id: 'user', kind: 'user', text: '문서를 검토해 주세요.', submissionId: body.submissionId },
          ...statuses.map((status, i) => ({ id: 'tool-' + i, kind: 'tool', text: '문서 검토 · report.md', status })),
          { id: 'result', kind: 'tool', text: 'create_document', status: 'completed', toolResult: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ path: 'C:/Documents/report.md', revision: 'a'.repeat(64) }) }] } },
          { id: 'question', kind: 'question', text: '', question: { requestId: 'scope', turnId: 'turn', delivery: 'blocking', status: 'pending', questions: [{ id: 'scope', header: '검토 범위', question: '어떤 내용을 검토할까요?', isOther: true, isSecret: false, options: [{ label: '전체 문서', description: '근거와 결론을 함께 확인합니다.' }] }] } }
        ] }] };
      return r.fulfill({ json: { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id }, conversation } });
    }
    return r.fulfill({ json: r.request().method() === 'GET' && !r.request().url().includes('?id=') ? (conversation ? [conversation] : []) : conversation });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPath(page, assistantFixture.document);
  const collapse = page.getByRole('button', { name: 'Collapse Explorer', exact: true });
  await collapse.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Expand Explorer', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Expand Explorer', exact: true }).press('Enter');
  await expect(collapse).toBeFocused();
  const documentGeometry = await page.locator('.document-panel-header').evaluate(n => { const s = getComputedStyle(n); return { height: n.getBoundingClientRect().height, padding: s.padding, border: s.borderBottom }; });
  const trigger = page.locator('.assistant-trigger');
  await trigger.click();
  const panel = page.getByTestId('assistant-panel');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  {
    const geometry = await page.locator('.sidebar > .panel-header, .assistant-panel > .panel-header').evaluateAll(nodes => nodes.map(n => { const s = getComputedStyle(n); return { height: n.getBoundingClientRect().height, padding: s.padding, border: s.borderBottom }; }));
    expect(geometry).toHaveLength(2);
    expect(geometry[1]).toEqual(geometry[0]); expect(documentGeometry).toEqual(geometry[0]);
  }
  const capture = async (state) => {
    if (!screenshots) return;
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [640, 'light']]) {
      await page.evaluate(({ prefix, theme }) => { localStorage.setItem(prefix + '.uiLanguage', 'ko'); localStorage.setItem(prefix + '.theme', theme); }, { prefix: brand.storagePrefix, theme });
      await page.setViewportSize({ width, height: 1000 }); await page.reload();
      if (!await panel.isVisible()) await trigger.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(panel.getByRole('textbox')).toBeEnabled();
      if (state === 'empty') {
        await panel.getByRole('button', { name: '비서 닫기', exact: true }).click();
        if (!await page.getByTestId('document-panel').isVisible()) await page.getByRole('button', { name: '개요', exact: true }).click();
        await expect(page.getByTestId('document-panel')).toBeVisible();
        await page.screenshot({ path: `docs/design/assets/panel-headers-assistant-1686/after-document-${width}-${theme}-ko.png`, mask: [page.locator('.sidebar-host-account'), page.locator('.document-location'), page.locator('.sidebar-folder-header')] });
        await trigger.click();
      }
      if (state === 'history') { await panel.getByRole('button', { name: '대화 기록', exact: true }).click(); await expect(panel.locator('.assistant-history')).toBeVisible(); }
      if (state === 'work') { await expect(panel.getByTestId('assistant-result')).toBeVisible(); await panel.locator('.assistant-transcript').evaluate(el => el.scrollTop = 0); }
      if (state === 'cards') { await panel.getByTestId('assistant-question').scrollIntoViewIfNeeded(); }
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: `docs/design/assets/panel-headers-assistant-1686/after-${state}-${width}-${theme}-ko.png`, mask: [page.locator('.sidebar-host-account'), page.locator('.document-location'), page.locator('.sidebar-folder-header')] });
      if (width === 640 && state === 'empty') {
        await panel.getByRole('button', { name: '비서 닫기', exact: true }).click();
        await page.getByRole('button', { name: '탐색기 펼치기', exact: true }).click();
        await page.screenshot({ path: `docs/design/assets/panel-headers-assistant-1686/after-explorer-640-light-ko.png`, mask: [page.locator('.sidebar-host-account'), page.locator('.document-location'), page.locator('.sidebar-folder-header')] });
      }
    }
    await page.evaluate(prefix => { localStorage.setItem(prefix + '.uiLanguage', 'en'); localStorage.setItem(prefix + '.theme', 'light'); }, brand.storagePrefix);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload();
    if (!await panel.isVisible()) await trigger.click();
    await expect(panel.getByRole('textbox')).toBeEnabled();
  };
  await capture('empty');
  await panel.getByRole('textbox').fill('Review'); await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByTestId('assistant-result')).toBeVisible();
  {
    const labels = ['Completed', 'Completed', 'Failed', 'Declined', 'Stopped', 'In progress', 'In progress', 'In progress', 'Unknown status'];
    for (const [i, label] of labels.entries()) {
      const row = panel.locator('.assistant-steps').nth(i), status = row.locator('.screen-status');
      await expect(status).toHaveText(label);
      await expect(status).toHaveAttribute('data-tone', [2, 3].includes(i) ? 'error' : [5, 6, 7].includes(i) ? 'progress' : 'neutral');
      await expect(status.locator('svg')).toHaveCount([5, 6, 7].includes(i) ? 1 : 0);
      if (i < 2) await expect(status.locator('span')).toHaveCount(0);
    }
    const colors = await panel.locator('.assistant-steps').nth(2).locator('summary').evaluate(el => [getComputedStyle(el.querySelector('.type-helper')).color, getComputedStyle(el.querySelector('.screen-status')).color]);
    expect(colors[0]).not.toEqual(colors[1]);
  }
  await capture('work'); await capture('cards'); await capture('history');
}
