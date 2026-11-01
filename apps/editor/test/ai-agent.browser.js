async (page, { expect, openPath, pluginFixture, screenshots, brand }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  // No model or account is used by browser tests; Host lifecycle is covered headlessly.
  await page.route('**/api/ai-agent-status', route => route.fulfill({ json: { adapter: 'Codex', available: true, loginRequired: false } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^(Settings|설정)$/ }).click();
  await page.getByTestId('ui-language').selectOption('en'); await page.getByTestId('theme').selectOption('light');
  await page.getByTestId('settings-back').click();
  await openPath(page, pluginFixture.document);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const categories = page.getByRole('navigation', { name: 'Settings categories' });
  await categories.getByRole('button', { name: 'AI agent', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI agent', exact: true }).last()).toBeVisible();
  await expect(page.getByText('No additional login is required.', { exact: true })).toBeVisible();
  const measure = () => page.locator('.settings-content-inner').evaluate(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width }));
  const aiGeometry = await measure();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/ai-1440-light-en.png' });
  await categories.getByRole('button', { name: 'Docling', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Docling server', exact: true })).toBeVisible();
  expect(await measure()).toEqual(aiGeometry);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/docling-1440-light-en.png' });
  await categories.getByRole('button', { name: 'Appearance & language', exact: true }).click();
  await page.getByTestId('ui-language').selectOption('ko'); await page.getByTestId('theme').selectOption('dark');
  await page.setViewportSize({ width: 640, height: 1000 });
  await page.getByRole('button', { name: 'AI 에이전트', exact: true }).click();
  await expect(page.getByText('추가 로그인이 필요하지 않습니다.', { exact: true })).toBeVisible();
  expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/ai-640-dark-ko.png' });
  await page.getByRole('button', { name: 'Docling', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Docling 서버', exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/880-evidence/docling-640-dark-ko.png' });
  await page.getByTestId('settings-back').click();
  const editor = page.locator('.document-scroll[data-active=true] .ProseMirror');
  await editor.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' preserved AI-off draft');
  await editor.evaluate(element => { globalThis.__aiOrdinaryDocument = element; });
  const list = await (await page.request.get(origin + '/api/worker-plugins')).json();
  const ai = list.find(item => item.id === 'ai-agent');
  try {
    const disabled = await page.request.delete(origin + '/api/worker-plugins', { data: { id: ai.id } }); expect(disabled.ok()).toBe(true);
    await expect.poll(async () => (await (await page.request.get(origin + '/api/ai-task-service')).json()).available).toBe(false);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(page.getByRole('button', { name: 'AI 에이전트', exact: true })).toHaveCount(0);
    await page.getByTestId('settings-back').click();
    expect(await editor.evaluate(element => element === globalThis.__aiOrdinaryDocument)).toBe(true);
    await expect(editor).toContainText('preserved AI-off draft');
    await editor.locator('p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' still editable');
    await expect(editor).toContainText('still editable');
  } finally {
    // The existing installed directory has no source manifest. Re-registration uses
    // the source bundle supplied by the same local development Host composition.
    const sourceManifest = pluginFixture.document.replace(/[/\\]tmp[/\\]plugin-ui[/\\]document\.md$/, '/tmp/ai-agent-worker/manifest.json');
    const restored = await page.request.post(origin + '/api/worker-plugins', { data: { manifest: sourceManifest } }); expect(restored.ok(), await restored.text()).toBe(true);
    // These preferences survive page teardown; the next scenario starts in English Light.
    await page.evaluate(prefix => {
      localStorage.setItem(prefix + '.uiLanguage', 'en');
      localStorage.setItem(prefix + '.theme', 'light');
    }, brand.storagePrefix);
  }
  return { settings: true, minimumViewport: true, nativeDocumentPreserved: true };
}
