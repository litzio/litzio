async (page, { expect, brand }) => {
  // Manual capture only. Copy to quiet-document.browser.js temporarily and restore after
  // `pnpm browser:test quiet-document --screenshots`. Use the baseline UI for Before.
  const stage = 'after';
  const settings = { provider: 'codex', permissionMode: 'read-only', model: 'gpt-6-luna', reasoningEffort: 'low' };
  let conversation;
  const captures = [];
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: { connected: true, account: { type: 'chatgpt' } } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      if (body.action === 'send') {
        conversation = { id: 'synthetic-thread', title: 'Synthetic review', folders: [], createdAt: 1, updatedAt: 1, ...settings,
          turns: [{ id: 'synthetic-turn', status: 'inProgress', items: [{ id: 'user', kind: 'user', submissionId: body.submissionId, text: body.message }] }] };
        return r.fulfill({ json: { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id, itemId: 'user' }, conversation } });
      }
    }
    return r.fulfill({ json: conversation ?? [] });
  });
  for (const width of [1440, 640]) for (const theme of ['light', 'dark']) {
    conversation = undefined;
    await page.evaluate(({ prefix, theme }) => {
      localStorage.removeItem(prefix + '.assistantConversation:local');
      localStorage.setItem(prefix + '.uiLanguage', 'en');
      localStorage.setItem(prefix + '.theme', theme);
    }, { prefix: brand.storagePrefix, theme });
    await page.setViewportSize({ width, height: 1000 }); await page.reload();
    const trigger = page.locator('.assistant-trigger'), header = page.locator('.top-bar');
    const panel = page.getByTestId('assistant-panel');
    const capture = async state => {
      await page.mouse.move(0, 0); await trigger.blur();
      captures.push({ width, theme, state, ...await trigger.evaluate(button => {
        const { width, height } = button.getBoundingClientRect();
        const dot = button.querySelector('.assistant-status');
        const style = dot && getComputedStyle(dot);
        return { buttonWidth: width, buttonHeight: height, dpr: devicePixelRatio, dot: style ? { color: style.backgroundColor, border: style.borderColor, size: style.width } : null };
      }) });
      await header.screenshot({ path: `docs/design/assets/assistant-status-1424/${stage}-${width}-${theme}-${state}.png` });
    };
    await capture('idle');
    await trigger.click();
    const input = panel.getByRole('textbox');
    await expect(input).toBeEnabled();
    await input.fill('Review the document.'); await input.press('Enter');
    await expect(panel.getByRole('button', { name: 'Stop response', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
    if (stage === 'after') await expect(trigger).toHaveAttribute('data-status', 'working');
    await capture('working');
    if (stage === 'before') continue;
    conversation.userInput = { requestId: 'synthetic-question', turnId: 'synthetic-turn', questions: [{ id: 'scope', header: 'Scope', question: 'Which section should I review?', isOther: true, isSecret: false, options: null }] };
    await expect(trigger).toHaveAttribute('data-status', 'attention');
    await capture('attention');
    delete conversation.userInput;
    conversation.turns[0].status = 'completed';
    await expect(trigger).toHaveAttribute('data-status', 'completed');
    await capture('completed');
    await trigger.click();
    await expect(input).toBeEnabled();
    await panel.getByRole('button', { name: 'Close assistant', exact: true }).click();
    await expect(trigger).not.toHaveAttribute('data-status');
    await capture('acknowledged');
  }
  return { stage, captures };
}
