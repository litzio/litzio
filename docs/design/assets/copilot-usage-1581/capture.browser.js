async (page, { expect, brand }) => {
  // Manual review only: temporarily copy to quiet-document.browser.js and run
  // pnpm browser:test quiet-document --screenshots, then restore that file.
  const stage = 'after';
  await page.clock.setFixedTime(new Date('2026-11-10T03:00:00Z'));
  const settings = { provider: 'copilot', permissionMode: 'read-only', model: 'auto', reasoningEffort: 'low' };
  let conversation;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { provider: 'copilot', models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: {
    provider: 'copilot', connected: true, checkedAt: 1794268800000,
    account: { type: 'chatgpt', email: 'demo@example.invalid', planType: 'business' },
    rateLimits: [{ name: 'Codex', planType: 'business', windows: [],
      individualLimit: { limit: 500, used: 208.24, remainingPercent: 58, resetsAt: 1795478400 },
      credits: { hasCredits: true, unlimited: false, balance: 125.5 }, spendControlReached: true,
    }],
  } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      conversation = { ...settings, id: 'fixture-thread', title: 'Fixture review', folders: [], createdAt: 1, updatedAt: 1,
        tokenUsage: { used: 15000, limit: 200000 }, copilotUsage: { cost: { amount: 0.25, currency: 'USD' }, prompt: { totalTokens: 14000, inputTokens: 13995, outputTokens: 5 } },
        turns: [{ id: 'fixture-turn', status: 'completed', items: [{ id: 'user', kind: 'user', submissionId: body.submissionId, text: body.message }, { id: 'answer', kind: 'assistant', text: 'The document is ready for review.' }] }] };
      return r.fulfill({ json: { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id, itemId: 'user' }, conversation } });
    }
    return r.fulfill({ json: conversation ?? [] });
  });
  for (const width of [1440]) for (const theme of ['light', 'dark']) {
    conversation = undefined;
    await page.evaluate(({ prefix, theme }) => {
      localStorage.removeItem(prefix + '.assistantConversation:local');
      localStorage.setItem(prefix + '.uiLanguage', 'ko');
      localStorage.setItem(prefix + '.theme', theme);
    }, { prefix: brand.storagePrefix, theme });
    await page.setViewportSize({ width, height: 1000 }); await page.reload();
    const panel = page.getByTestId('assistant-panel');
    if (!await panel.isVisible()) await page.locator('.assistant-trigger').click();
    const input = panel.getByRole('textbox');
    await expect(input).toBeEnabled();
    await input.fill('Review the document.'); await input.press('Enter');
    await expect(panel).toContainText('The document is ready for review.');
    await panel.getByRole('img', { name: '컨텍스트 사용량' }).hover();
    const tooltip = page.locator('[data-slot=tooltip-content]');
    await expect(tooltip).toContainText('15,000 / 200,000');
    await expect(tooltip).toContainText('0.25 USD');
    await page.evaluate(() => document.fonts.ready);
    // Native footer + tooltip crop excludes unrelated Host OS identity and paths.
    const tip = await tooltip.boundingBox(), footer = await panel.locator('.assistant-composer').boundingBox();
    const x = Math.floor(Math.min(tip.x, footer.x)), y = Math.floor(Math.min(tip.y, footer.y) - 8);
    const right = Math.ceil(Math.max(tip.x + tip.width, footer.x + footer.width));
    const bottom = Math.ceil(footer.y + footer.height);
    await page.screenshot({ path: `docs/design/assets/copilot-usage-1581/${stage}-${width}-${theme}.png`, clip: { x, y, width: right - x, height: bottom - y } });
  }
  return { stage, viewports: [1440], themes: ['light', 'dark'], dpr: await page.evaluate(() => devicePixelRatio), fixtureOnly: true };
}
