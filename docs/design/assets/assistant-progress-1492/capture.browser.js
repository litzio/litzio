async (page, { expect, brand }) => {
  // Manual review only: temporarily use as quiet-document.browser.js, then restore.
  // pnpm browser:test quiet-document --screenshots; baseline uses stage = 'before'.
  const stage = 'after';
  const settings = { provider: 'codex', permissionMode: 'read-only', model: 'gpt-6-luna', reasoningEffort: 'low' };
  let conversation;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      if (body.action === 'send') {
        conversation = { id: 'synthetic-conversation', title: '여행 계획', folders: [], createdAt: 1, updatedAt: 1, ...settings,
          turns: [{ id: 'earlier', status: 'completed', items: [{ id: 'earlier-answer', kind: 'assistant', text: '여행 목적과 일정을 함께 검토합니다.\n\n'.repeat(50) }] },
            { id: 'current', status: 'inProgress', items: [{ id: 'user', kind: 'user', submissionId: body.submissionId, text: body.message },
              { id: 'thought', kind: 'reasoning', text: '이동 시간과 쉬는 시간을 확인합니다.\n\n'.repeat(6) },
              { id: 'tool', kind: 'tool', text: 'read_document · 여행 계획.md', status: 'inProgress' },
              { id: 'answer', kind: 'assistant', text: '계획을 검토하고 있습니다. 선호하는 여행 방식을 알려 주세요.' }] }] };
        return r.fulfill({ json: { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id, itemId: 'user' }, conversation } });
      }
    }
    return r.fulfill({ json: conversation ?? [] });
  });
  for (const width of [1440, 640]) for (const theme of ['light', 'dark']) {
    conversation = undefined;
    await page.evaluate(({ prefix, theme }) => {
      localStorage.removeItem(prefix + '.assistantConversation:local');
      localStorage.setItem(prefix + '.uiLanguage', 'ko');
      localStorage.setItem(prefix + '.theme', theme);
    }, { prefix: brand.storagePrefix, theme });
    await page.setViewportSize({ width, height: 1000 }); await page.reload();
    const panel = page.getByTestId('assistant-panel');
    await page.locator('.assistant-trigger').click();
    const input = panel.getByRole('textbox'); await expect(input).toBeEnabled();
    await input.fill('여행 계획을 검토해 주세요.'); await input.press('Enter');
    await expect(panel.locator('.assistant-steps')).toBeVisible();
    const transcript = panel.locator('.assistant-transcript');
    await transcript.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const capture = async name => {
      await page.mouse.move(0, 0); await input.blur();
      await panel.screenshot({ path: `docs/design/assets/assistant-progress-1492/${stage}-${width}-${theme}-${name}.png` });
    };
    await capture('tool');
    if (stage === 'before') continue;
    conversation.userInput = { requestId: 'synthetic-question', turnId: 'current', questions: [{ id: 'style', header: '여행 방식', question: '예시 여행 계획에서 어떤 여행 방식을 선호하시나요?', isOther: true, isSecret: false,
      options: ['휴식 중심', '관광 중심', '음식 탐방'].map(label => ({ label, description: '' })) }] };
    await expect(panel.getByTestId('assistant-question')).toBeVisible();
    await expect(panel.locator('summary')).toContainText('확인·답변 필요');
    await capture('question');
    conversation.turns[1].items.push({ id: 'second-answer', kind: 'assistant', text: '추가 답변입니다. 이동 시간을 확인한 뒤 최종 계획을 정리하겠습니다.' });
    await expect(panel.locator('.assistant-answer').last()).toContainText('추가 답변입니다.');
    await expect.poll(() => transcript.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(2);
    await panel.screenshot({ path: `docs/design/assets/assistant-progress-1492/after-${width}-${theme}-latest.png` });
    const box = await transcript.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -70);
    await expect(panel.getByRole('button', { name: '맨 아래로', exact: true })).toBeVisible();
    conversation.turns[1].items[3].text += ' 답변을 기다리며 내용을 정리합니다.';
    await expect(panel.getByRole('button', { name: '새 내용 · 맨 아래로', exact: true })).toBeVisible();
    await capture('reading');
    await panel.getByRole('button', { name: '새 내용 · 맨 아래로', exact: true }).click();
    await panel.locator('summary').click(); await expect(panel.locator('details')).toHaveAttribute('open', '');
    await capture('expanded');
  }
}
