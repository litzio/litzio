async (page, { expect, brand }) => {
  // Manual review only: temporarily copy to quiet-document.browser.js and run
  // pnpm browser:test quiet-document --screenshots, then restore that file.
  // For Before, temporarily restore AssistantPanel.tsx from the parent commit.
  const stage = 'after';
  await page.clock.setFixedTime(new Date('2026-11-10T03:00:00Z'));
  const settings = { provider: 'codex', permissionMode: 'read-only', model: 'gpt-6-luna', reasoningEffort: 'low' };
  let conversation;
  await page.route('**/api/assistant/settings*', r => r.fulfill({ json: settings }));
  await page.route('**/api/assistant/models*', r => r.fulfill({ json: { provider: 'codex', models: [{ id: 'luna', model: settings.model, displayName: 'GPT Luna', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } }));
  await page.route('**/api/assistant/diagnostics*', r => r.fulfill({ json: {
    provider: 'codex', connected: true, checkedAt: 1794268800000,
    account: { type: 'chatgpt', email: 'demo@example.invalid', planType: 'plus' },
    rateLimits: [{ name: 'Codex', windows: [
      { usedPercent: 28, windowDurationMins: 300, resetsAt: 1794286800 },
      { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1794873600 },
    ] }],
  } }));
  await page.route('**/api/assistant/conversations*', r => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      conversation = { ...settings, id: 'fixture-thread', title: 'Fixture review', folders: [], createdAt: 1, updatedAt: 1,
        tokenUsage: { used: 31207, limit: 475000 },
        turns: [{ id: 'fixture-turn', status: 'completed', items: [{ id: 'user', kind: 'user', submissionId: body.submissionId, text: body.message }, { id: 'answer', kind: 'assistant', text: 'The document is ready for review.' }] }] };
      return r.fulfill({ json: { submission: { id: body.submissionId, status: 'accepted', conversationId: conversation.id, itemId: 'user' }, conversation } });
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
    const panel = page.getByTestId('assistant-panel');
    if (!await panel.isVisible()) await page.locator('.assistant-trigger').click();
    const input = panel.getByRole('textbox');
    await expect(input).toBeEnabled();
    await input.fill('Review the document.'); await input.press('Enter');
    await expect(panel).toContainText('The document is ready for review.');
    await panel.getByRole('img', { name: 'Context usage' }).hover();
    const tooltip = page.locator('[data-slot=tooltip-content]');
    await expect(tooltip).toContainText('31,207 / 475,000 tokens');
    if (stage === 'after') await expect(tooltip).toContainText('demo@example.invalid');
    await page.evaluate(() => document.fonts.ready);
    // Native footer + tooltip crop excludes unrelated Host OS identity and paths.
    const tip = await tooltip.boundingBox(), footer = await panel.locator('.assistant-composer').boundingBox();
    const x = Math.floor(Math.min(tip.x, footer.x)), y = Math.floor(Math.min(tip.y, footer.y) - 8);
    const right = Math.ceil(Math.max(tip.x + tip.width, footer.x + footer.width));
    const bottom = Math.ceil(footer.y + footer.height);
    await page.screenshot({ path: `docs/design/assets/assistant-usage-1446/${stage}-${width}-${theme}.png`, clip: { x, y, width: right - x, height: bottom - y } });
  }
  return { stage, viewports: [1440, 640], themes: ['light', 'dark'], dpr: await page.evaluate(() => devicePixelRatio), fixtureOnly: true };
}
