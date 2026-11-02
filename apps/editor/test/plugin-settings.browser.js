async (page, { expect, screenshots, brand }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  try {
    const items = await (await page.request.get(origin + '/api/worker-plugins')).json();
    const original = items.find(item => item.id === 'docling');
    expect(original.bundledRevision).toBeTruthy();
    // A synthetic pinned revision exercises UI behavior; the POST and final GET use the real Host.
    let mismatch = true, writes = 0;
    await page.route('**/api/worker-plugins', async route => {
      if (route.request().method() === 'POST') {
        writes++;
        expect(route.request().postDataJSON()).toEqual({ bundled: 'docling' });
        const response = await route.fetch(); expect(response.ok()).toBe(true);
        mismatch = false; return route.fulfill({ response });
      }
      const response = await route.fetch(); const value = await response.json();
      return route.fulfill({ json: value.map(item => item.id === 'docling' && mismatch ? { ...item, version: 'a'.repeat(64), revision: 'f'.repeat(64), directory: original.directory + '/long-path-for-wrapping-check/설치된-플러그인-경로' } : item) });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /^Settings$/ }).click();
    const nav = page.getByRole('navigation', { name: 'Settings categories' });
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/before-1440.png' });
    await nav.getByRole('button', { name: 'Plugins', exact: true }).click();
    const row = page.getByTestId('installed-plugin-docling');
    await expect(row.getByText('Differs from app default', { exact: true })).toBeVisible();
    await expect(row.getByText('ffffffffffff', { exact: true })).toHaveAttribute('title', 'f'.repeat(64));
    await expect(row.locator('dd').first()).toHaveText('aaaaaaaaaaaa');
    await expect(row.locator('dd').first()).toHaveAttribute('title', 'a'.repeat(64));
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/plugins-1440.png' });
    await row.getByRole('button', { name: 'Register app default again', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Register app default again?', exact: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toBe(0);
    await nav.getByRole('button', { name: 'Appearance & language', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.getByTestId('theme').selectOption('dark');
    await page.setViewportSize({ width: 640, height: 1000 });
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/before-640-dark-ko.png' });
    await page.getByRole('button', { name: '플러그인', exact: true }).click();
    await expect(row.getByText('기본 버전과 다름', { exact: true })).toBeVisible();
    expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (screenshots) {
      await page.screenshot({ path: 'tmp/947-evidence/plugins-640-dark-ko.png' });
      await row.getByRole('button').scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'tmp/947-evidence/plugins-640-dark-ko-details.png' });
    }
    await row.getByRole('button', { name: '기본 버전으로 다시 등록', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '기본 버전으로 다시 등록할까요?', exact: true });
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/confirm-640-dark-ko.png' });
    await confirmation.getByRole('button', { name: '기본 버전으로 다시 등록', exact: true }).click();
    await expect(confirmation).toBeHidden();
    expect(writes).toBe(1);
    await expect(row.getByText('앱 기본 버전과 같음', { exact: true })).toBeVisible();
    await expect(row.getByRole('button')).toHaveCount(0);
  } finally {
    // Preferences survive page teardown; restore the next scenario's starting language.
    await page.evaluate(prefix => {
      localStorage.setItem(prefix + '.uiLanguage', 'en');
      localStorage.setItem(prefix + '.theme', 'light');
    }, brand.storagePrefix);
  }
}
