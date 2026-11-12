async (page, { expect, brand }) => {
  const settings = { provider: 'codex', permissionMode: 'read-only', model: 'gpt-6-luna', reasoningEffort: 'low' };
  let conversation, receipt, resumes = 0;
  const refreshInput = () => { conversation.userInput = conversation.turns.flatMap(t => t.items).map(i => i.question).find(q => q?.status === 'pending'); };
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', async r => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      if (body.action === 'send') {
        conversation = { id: 'travel-thread', title: 'Travel planning', folders: [], createdAt: 1, updatedAt: 1, ...settings,
          turns: [{ id: 'travel-turn', status: 'inProgress', items: [{ id: 'user', kind: 'user', submissionId: body.submissionId, userMessageSource: 'provider-history', text: body.message }, { id: 'thinking', kind: 'reasoning', text: 'Reviewing travel preferences.' }] }] };
        receipt = { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id, itemId: 'user' }, conversation };
        return r.fulfill({ json: receipt });
      }
      if (body.action === 'answer') {
        expect(body.displayClient).toBeTruthy();
        const q = conversation.turns.flatMap(t => t.items).find(i => i.question?.requestId === body.requestId).question;
        q.status = 'answered'; q.answers = body.answers; refreshInput();
      }
      if (body.action === 'resume') resumes++;
      return r.fulfill({ json: conversation });
    }
    const url = r.request().url();
    return r.fulfill({ json: url.includes('submissionId=') ? receipt : url.includes('?id=') ? conversation : conversation ? [conversation] : [] });
  });
  await page.evaluate(prefix => { localStorage.removeItem(prefix + '.assistantConversation:local'); localStorage.setItem(prefix + '.uiLanguage', 'en'); }, brand.storagePrefix);
  await page.reload(); await page.setViewportSize({ width: 1440, height: 1000 });
  const trigger = page.locator('.assistant-trigger'), panel = page.getByTestId('assistant-panel');
  await trigger.click();
  const message = panel.getByRole('textbox', { name: 'Message assistant', exact: true });
  await expect(message).toBeEnabled(); await message.fill('여행 계획을 도와주세요.'); await message.press('Enter');
  await expect(panel.locator('.assistant-turn .assistant-user')).toHaveCount(1);
  const addQuestion = (id) => {
    const sourceQuestions = [{ title: '예시 여행 계획에서 어떤 여행 방식을 선호하시나요?', options: ['휴식 중심', '관광 중심', '음식 탐방'] }];
    const question = { requestId: id, turnId: 'travel-turn', delivery: 'async', status: 'pending', sourceQuestions,
      questions: sourceQuestions.map((q, index) => ({ id: String(index), header: '', question: q.title, isOther: true, isSecret: false, options: q.options.map(label => ({ label, description: '' })) })) };
    conversation.turns[0].items.push({ id, kind: 'question', text: 'Travel question', question }); refreshInput();
  };
  addQuestion('native-question');
  const pending = panel.locator('[data-question-status="pending"]');
  await expect(pending).toBeVisible();
  expect(await pending.evaluate(el => !!el.closest('details'))).toBe(false);
  await expect(panel.locator('details')).not.toHaveAttribute('open');
  await pending.getByRole('radio', { name: '음식 탐방', exact: true }).check();
  await pending.getByRole('button', { name: 'Submit answers' }).click();
  await expect(panel.locator('[data-question-status="answered"]')).toContainText('음식 탐방');
  await panel.getByRole('button', { name: 'Close assistant' }).click();
  addQuestion('host-question');
  await expect(trigger).toHaveAttribute('data-status', 'attention');
  await trigger.click();
  await pending.getByRole('radio', { name: 'Write another answer' }).check();
  await pending.getByLabel('Your answer').fill('아이와 쉬는 시간을 넣어 주세요.');
  await pending.getByRole('button', { name: 'Submit answers' }).click();
  await expect(panel.locator('[data-question-status="answered"]')).toHaveCount(2);
  addQuestion('ended-question');
  conversation.turns[0].status = 'completed';
  await expect(pending.getByRole('radio', { name: '음식 탐방', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Conversation history' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Conversation history' }).click();
  await panel.getByRole('button', { name: /Travel planning/ }).click();
  await expect.poll(() => resumes).toBeGreaterThan(0);
  await expect(panel.locator('[data-question-status="answered"]').last()).toContainText('아이와 쉬는 시간을 넣어 주세요.');
  await pending.getByRole('radio', { name: '음식 탐방', exact: true }).check();
  await pending.getByRole('button', { name: 'Submit answers' }).click();
  await expect(panel.locator('[data-question-status="answered"]')).toHaveCount(3);
  await page.setViewportSize({ width: 640, height: 1000 });
  expect(await panel.locator('.assistant-question').last().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
}
