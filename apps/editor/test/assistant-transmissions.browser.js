async (page, { expect, screenshots, brand }) => {
  const entry = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', at: 1793590000000, provider: 'codex', method: 'turn/start', conversationId: 'fixture-thread', turnId: 'fixture-turn', bytes: 123, status: 'acknowledged', complete: true, sources: [{ kind: 'attachment', label: 'fixture.md', bytes: 42 }] };
  let deleted = false;
  await page.route('**/api/assistant/**', route => {
    const url = route.request().url();
    if (url.includes('/transmissions')) {
      const args = route.request().postDataJSON();
      if (args.action === 'delete') { deleted = true; return route.fulfill({ json: { receipt: { outcome: 'success', deleted: true } } }); }
      return route.fulfill({ json: args.action === 'read' ? { metadata: entry, text: args.offset ? '원문 두 번째 페이지' : '{"message":"한글 fixture 원문"}', nextOffset: args.offset ? null : 25 } : { entries: deleted ? [] : [entry], failures: 0, incomplete: [], nextOffset: null } });
    }
    if (url.includes('/settings')) return route.fulfill({ json: { provider: 'codex', model: 'fixture', reasoningEffort: 'low', permissionMode: 'read-only' } });
    if (url.includes('/models')) return route.fulfill({ json: { models: [{ id: 'fixture', model: 'fixture', displayName: 'Fixture', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] } });
    if (url.includes('/diagnostics')) return route.fulfill({ json: { connected: true, account: { type: 'fixture' } } });
    return route.fulfill({ json: [] });
  });
  for (const width of [1440, 640]) {
    const ko = width === 640;
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(({ prefix, ko }) => { localStorage.setItem(prefix + '.uiLanguage', ko ? 'ko' : 'en'); localStorage.setItem(prefix + '.theme', ko ? 'dark' : 'light'); }, { prefix: brand.storagePrefix, ko });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", ko ? "dark" : "light");
    await page.getByRole('button', { name: ko ? '비서' : 'Assistant', exact: true }).click();
    const panel = page.getByTestId('assistant-panel');
    await expect(panel.getByRole('textbox')).toBeEnabled();
    if (screenshots) await page.screenshot({ path: `tmp/1304-before-${width}.png` });
    await panel.getByRole('button', { name: ko ? '전송 기록' : 'Transmission log', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: ko ? '전송 기록' : 'Transmission log', exact: true });
    await dialog.getByRole('button', { name: /turn\/start/ }).click();
    await expect(dialog.getByLabel(ko ? '전송한 내용' : 'Sent payload')).toContainText('한글 fixture 원문');
    await expect(dialog.getByText(/fixture.md/)).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (screenshots) await page.screenshot({ path: `tmp/1304-after-${width}.png` });
    await dialog.getByRole('button', { name: ko ? '다음 원문 페이지' : 'Next payload page' }).click();
    await expect(dialog.getByLabel(ko ? '전송한 내용' : 'Sent payload')).toContainText('원문 두 번째 페이지');
    if (ko) {
      await dialog.getByRole('button', { name: '기록 삭제', exact: true }).click();
      await dialog.getByRole('button', { name: '기록 삭제 확인', exact: true }).click();
      await expect(dialog.getByText('전송 기록이 없습니다.')).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(panel).toBeVisible();
  }
}
