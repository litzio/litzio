async (page, { expect, brand }) => {
  // Manual capture only: temporarily use as quiet-document.browser.js, then restore.
  // pnpm browser:test quiet-document --screenshots
  const settings = { provider: 'codex', permissionMode: 'read-only', model: 'gpt-6-luna', reasoningEffort: 'low' };
  let conversation, receipt;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      if (body.action === 'send') {
        const sourceQuestions = [{ title: '예시 여행 계획에서 어떤 여행 방식을 선호하시나요?', options: ['휴식 중심', '관광 중심', '음식 탐방'] }, { title: '일정에 넣을 요청을 직접 입력해 주세요.', options: null }];
        const question = { requestId: 'travel-question', turnId: 'travel-turn', delivery: 'async', status: 'pending', sourceQuestions,
          questions: sourceQuestions.map((q, index) => ({ id: String(index), header: '', question: q.title, isOther: true, isSecret: false, options: q.options?.map(label => ({ label, description: '' })) ?? null })) };
        conversation = { id: 'synthetic-travel', title: '여행 계획', folders: [], createdAt: 1, updatedAt: 1, ...settings, userInput: question,
          turns: [{ id: 'travel-turn', status: 'completed', items: [{ id: 'user', kind: 'user', submissionId: body.submissionId, userMessageSource: 'provider-history', text: body.message },
            { id: 'thought', kind: 'reasoning', text: '여행 계획에 필요한 선호와 요청을 확인합니다.' },
            { id: 'answer', kind: 'assistant', text: '선호하는 여행 방식과 일정에 넣을 요청을 알려 주세요.' },
            { id: 'travel-question', kind: 'question', text: '', question }] }] };
        receipt = { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id, itemId: 'user' }, conversation };
        return r.fulfill({ json: receipt });
      }
      if (body.action === 'answer') {
        const q = conversation.userInput; q.status = 'answered'; q.answers = body.answers; delete conversation.userInput;
        conversation.turns[0].status = 'completed'; conversation.turns[0].items[2].text = '음식 탐방을 중심으로, 아이와 쉬는 시간을 포함해 일정을 준비하겠습니다.';
      }
      return r.fulfill({ json: conversation });
    }
    const url = r.request().url();
    return r.fulfill({ json: url.includes('submissionId=') ? receipt : url.includes('?id=') ? conversation : conversation ? [conversation] : [] });
  });
  for (const width of [1440]) for (const theme of ['light', 'dark']) {
    conversation = undefined; receipt = undefined;
    await page.evaluate(({ prefix, theme }) => { localStorage.removeItem(prefix + '.assistantConversation:local'); localStorage.removeItem(prefix + '.assistantWidth'); localStorage.setItem(prefix + '.uiLanguage', 'ko'); localStorage.setItem(prefix + '.theme', theme); }, { prefix: brand.storagePrefix, theme });
    await page.setViewportSize({ width, height: 1000 }); await page.reload(); await page.locator('.assistant-trigger').click();
    const panel = page.getByTestId('assistant-panel'), input = panel.getByRole('textbox', { name: '비서에게 메시지' });
    await expect(input).toBeEnabled(); await input.fill('예시 여행 계획을 준비해 주세요.'); await input.press('Enter');
    const question = panel.locator('[data-question-status="pending"]');
    await expect(question.getByRole('radio', { name: '음식 탐방', exact: true })).toBeEnabled();
    await question.getByRole('radio', { name: '음식 탐방', exact: true }).check();
    await question.getByLabel('답변', { exact: true }).fill('아이와 쉬는 시간을 넣어 주세요.');
    await question.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await input.blur();
    await panel.screenshot({ path: `docs/design/assets/assistant-question-1530/pending-${width}-${theme}.png` });
    await question.getByRole('button', { name: '답변 제출' }).click();
    await expect(panel.locator('[data-question-status="answered"]')).toBeVisible();
    await expect(panel.getByRole('button', { name: '대화 기록' })).toBeEnabled();
    await panel.getByRole('button', { name: '대화 기록' }).click();
    await panel.getByRole('button', { name: /여행 계획/ }).click();
    await expect(panel.locator('[data-question-status="answered"]')).toContainText('아이와 쉬는 시간을 넣어 주세요.');
    await page.mouse.move(0, 0);
    await panel.screenshot({ path: `docs/design/assets/assistant-question-1530/reopened-${width}-${theme}.png` });
  }
}
