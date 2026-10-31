async (page, { expect, openPath, pluginFixture, screenshots = false }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const origin = page.url().split('/').slice(0, 3).join('/');
  const file = pluginFixture.document;
  const initialDisk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
  const registration = (await (await page.request.get(origin + '/api/worker-plugins')).json()).find(item => item.id === 'ai-agent');
  expect(registration).toBeTruthy();
  // Real Host/worker/Core pipeline; only the provider selection is fixed for this scenario.
  await page.route('**/api/ai-proposal', route => route.request().method() === 'POST'
    ? route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), adapter: 'fake' }) }) : route.continue());
  const native = () => page.locator('.document-scroll[data-active=true] .document-editor');
  await openPath(page, file);
  const nativeTab = await page.getByRole('tablist', { name: /Documents|문서/, exact: true }).getByRole('tab', { selected: true }).getAttribute('id');
  const tab = () => page.locator('#' + nativeTab);
  const snapshot = () => native().evaluate(element => JSON.stringify(element.editor.getJSON()));
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await native().evaluate(element => { globalThis.__aiOriginalEditor = element; });
  const begin = async instruction => {
    await tab().click();
    await native().locator('p').first().click();
    await page.keyboard.press('Control+Slash');
    const center = page.getByRole('dialog', { name: /Command center|명령 센터/, exact: true });
    await center.getByRole('combobox').fill('> AI에게 수정 제안 요청');
    await center.getByRole('option', { name: 'AI에게 수정 제안 요청', exact: true }).click();
    await page.getByRole('textbox', { name: '수정 지시', exact: true }).fill(instruction);
    await page.getByRole('button', { name: '제안 요청', exact: true }).click();
    await expect(page.getByRole('button', { name: '제안 요청', exact: true })).toBeDisabled();
  };
  const ready = async () => {
    await expect(page.getByRole('button', { name: '적용', exact: true })).toBeVisible();
    await expect(page.locator('[data-active=true] .ai-agent-proposal .recovery-diff')).toBeVisible();
  };
  try {
    await native().locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' Before AI.');
    const before = await snapshot();
    await begin('Make the selected paragraph clearer.'); await ready();
    const capture = file.replace(/tmp[\\/]plugin-ui[\\/]document.md$/, 'docs/reviews/assets/ai-agent-proposal-spike/comparison-1440.png');
    if (screenshots) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: capture }); }
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await tab().click();
    await expect(native()).toContainText('A clearer proposal for the selected paragraph.');
    await native().locator('p').first().click(); await page.keyboard.press('Control+z');
    // Immediate state after the synchronous Undo, no poll/reload masking history grouping.
    expect(await snapshot()).toBe(before);
    expect(await native().evaluate(element => element === globalThis.__aiOriginalEditor)).toBe(true);

    await begin('Reject this proposal.'); await ready();
    await page.getByRole('button', { name: '거절', exact: true }).click();
    await tab().click(); expect(await snapshot()).toBe(before);

    await begin('fixture:invalid');
    await expect(page.locator('[data-active=true] .ai-agent-proposal [role=alert]')).toContainText(/Unsupported|native|support/i);
    expect(await page.getByRole('button', { name: '적용', exact: true }).count()).toBe(0);
    await tab().click(); expect(await snapshot()).toBe(before);

    await begin('A proposal that will become stale.'); await ready();
    const proposalTab = await page.getByRole('tablist', { name: /Documents|문서/, exact: true }).getByRole('tab', { selected: true }).getAttribute('id');
    await tab().click(); await native().locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' Concurrent change.');
    const changed = await snapshot();
    await page.locator('#' + proposalTab).click(); await page.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.locator('[data-active=true] .ai-agent-proposal [role=alert]')).toContainText('제안 기준 이후 바뀌었습니다');
    await tab().click(); expect(await snapshot()).toBe(changed);

    for (const instruction of ['fixture:crash', 'fixture:timeout']) {
      await begin(instruction);
      await expect(page.locator('[data-active=true] .ai-agent-proposal [role=alert]')).toContainText(instruction.endsWith('timeout') ? /timed out/ : /failed/);
      await tab().click(); expect(await snapshot()).toBe(changed);
      expect(await native().evaluate(element => element === globalThis.__aiOriginalEditor)).toBe(true);
    }
    await native().locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' Still editable.');
    await expect(native()).toContainText('Still editable.');
    const afterFailures = await snapshot();

    const disabled = await page.request.delete(origin + '/api/worker-plugins', { data: { id: 'ai-agent' }, headers: { Origin: origin } });
    expect(disabled.status()).toBe(200);
    await page.keyboard.press('Control+Slash');
    const center = page.getByRole('dialog', { name: /Command center|명령 센터/, exact: true });
    await center.getByRole('combobox').fill('> AI에게 수정 제안 요청');
    await expect(center.getByRole('option', { name: 'AI에게 수정 제안 요청', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await snapshot()).toBe(afterFailures);
    await native().locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' After disable.');
    await expect(native()).toContainText('After disable.');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    const finalDisk = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json();
    expect(finalDisk.source).toBe(initialDisk.source);
    return { a: 'pass: apply and one Undo retain preceding manual edit', b: 'pass: exact engine snapshot', c: 'pass: Core refusal with reason',
      d: 'pass: revision refusal and exact changed snapshot', e: 'pass: crash and real watchdog timeout; same DOM; further typing',
      f: 'pass: command detached without reload; typing preserved', fileUnchanged: true, capture, viewport: '1440x1000' };
  } finally {
    await page.unroute('**/api/ai-proposal');
    const manifest = file.replace(/plugin-ui[\\/]document.md$/, 'ai-agent/manifest.json');
    const restored = await page.request.post(origin + '/api/worker-plugins', { data: { manifest }, headers: { Origin: origin } });
    expect(restored.status()).toBe(200);
  }
}
