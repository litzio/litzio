async (page, { expect, screenshots, brand, stalePluginRegistration }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  let staleRegistration = false;
  try {
    const items = await (await page.request.get(origin + '/api/worker-plugins')).json();
    const original = items.find(item => item.id === 'docling');
    expect(original.bundledRevision).toBeTruthy();
    if (!original.enabled) expect((await page.request.patch(origin + '/api/worker-plugins', { data: { id: original.id, enabled: true } })).ok()).toBe(true);
    // A synthetic pinned revision exercises UI behavior; the POST and final GET use the real Host.
    let mismatch = true, writes = 0;
    await page.route('**/api/worker-plugins', async route => {
      if (route.request().method() === 'POST') {
        writes++;
        expect(route.request().postDataJSON()).toEqual({ bundled: 'docling' });
        const response = await route.fetch(); expect(response.ok()).toBe(true);
        mismatch = false; return route.fulfill({ response });
      }
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch(); const value = await response.json();
      return route.fulfill({ json: value.map(item => item.id === 'docling' && mismatch ? { ...item, version: '0.0.1-beta.1', revision: 'f'.repeat(64), directory: original.directory + '/long-path-for-wrapping-check/설치된-플러그인-경로' } : item) });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /^Settings$/ }).click();
    const nav = page.getByRole('navigation', { name: 'Settings categories' });
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/before-1440.png' });
    await nav.getByRole('button', { name: 'Plugins', exact: true }).click();
    const row = page.getByTestId('installed-plugin-docling');
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toBeEnabled();
    const details = row.getByRole('button', { name: 'Installation details', exact: true });
    await expect(row.getByText('Installation path', { exact: true })).toHaveCount(0);
    await details.hover();
    const tooltip = page.locator('[data-slot=tooltip-content][data-open]');
    await expect(tooltip).toContainText(original.directory);
    await expect(tooltip).toContainText('f'.repeat(64));
    await expect(tooltip).toContainText('0.0.1-beta.1');
    await expect(tooltip).toContainText('Differs from app default');
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    await details.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tooltip).toContainText(original.directory);
    await page.keyboard.press('Tab');
    await row.getByRole('switch', { name: 'Docling', exact: true }).click();
    await expect(page.getByTestId('plugin-settings')).toHaveAttribute('aria-busy', 'false');
    await expect(row.getByRole('switch')).not.toBeChecked();
    await expect(row.getByText('Off', { exact: false })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.getByTestId('sidebar').getByRole('button', { name: 'Docling', exact: true })).toHaveCount(0);
    await row.getByRole('switch', { name: 'Docling', exact: true }).click();
    await expect(page.getByTestId('plugin-settings')).toHaveAttribute('aria-busy', 'false');
    await expect(row.getByRole('switch')).toBeChecked();
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Docling settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Docling server', exact: true })).toBeVisible();
    const backBounds = await page.getByRole('button', { name: 'Back to plugins', exact: true }).boundingBox();
    const titleBounds = await page.getByRole('heading', { name: 'Docling', exact: true }).boundingBox();
    expect(Math.abs(backBounds.x - titleBounds.x)).toBeLessThanOrEqual(1);
    const information = page.getByRole('region', { name: 'Information', exact: true });
    await expect(information.getByRole('heading', { name: 'Version', exact: true })).toHaveCSS('font-size', '14px');
    await expect(information.getByText('0.0.1-beta.1', { exact: true })).toHaveCSS('font-size', '12px');
    if (screenshots) {
      await expect(page.getByRole('textbox', { name: 'Server address', exact: true })).toBeEnabled();
      await page.screenshot({ path: 'tmp/947-evidence/detail-1440.png' });
      await page.getByRole('region', { name: 'Information', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'tmp/947-evidence/information-1440.png' });
    }
    await expect(nav.getByRole('button', { name: 'Docling', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to plugins', exact: true }).click();
    await expect(row.getByRole('switch')).toBeChecked();
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toBeFocused();
    if (screenshots) { await page.mouse.move(0, 0); await page.screenshot({ path: 'tmp/947-evidence/plugins-1440.png' }); }
    await expect(row.getByRole('button', { name: 'Docling settings', exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Docling settings', exact: true }).click();
    await page.getByRole('button', { name: 'Register again', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Register app default again?', exact: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toBe(0);
    await nav.getByRole('button', { name: 'Appearance & language', exact: true }).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.getByTestId('theme').selectOption('dark');
    await page.setViewportSize({ width: 640, height: 1000 });
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/before-640-dark-ko.png' });
    await page.getByRole('button', { name: '플러그인', exact: true }).click();
    await row.getByRole('button', { name: '설치 정보', exact: true }).hover();
    await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('기본 버전과 다름');
    await page.mouse.move(0, 0);
    expect(await page.locator('.settings-content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (screenshots) {
      await page.screenshot({ path: 'tmp/947-evidence/plugins-640-dark-ko.png' });
      await row.getByRole('switch').scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'tmp/947-evidence/plugins-640-dark-ko-details.png' });
    }
    await expect(row.getByRole('button', { name: 'Docling 설정', exact: true })).toBeEnabled();
    await row.getByRole('button', { name: 'Docling 설정', exact: true }).click();
    if (screenshots) {
      await page.screenshot({ path: 'tmp/947-evidence/detail-640-dark-ko.png' });
      await page.getByRole('region', { name: '정보', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'tmp/947-evidence/information-640.png' });
    }
    await page.getByRole('button', { name: '다시 등록', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '기본 버전으로 다시 등록할까요?', exact: true });
    if (screenshots) await page.screenshot({ path: 'tmp/947-evidence/confirm-640-dark-ko.png' });
    await confirmation.getByRole('button', { name: '기본 버전으로 다시 등록', exact: true }).click();
    await expect(confirmation).toBeHidden();
    expect(writes).toBe(1);
    const registered = page.getByRole('button', { name: '다시 등록', exact: true });
    await expect(registered).toBeDisabled();
    await registered.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-slot=tooltip-content][data-open]')).toContainText('앱 기본 버전과 같음');
    await page.keyboard.press('Tab');
    expect(writes).toBe(1);
    await expect(page.getByRole('region', { name: '정보', exact: true })).toContainText('앱 기본 버전과 같음');
    const installed = (await (await page.request.get(origin + '/api/worker-plugins')).json()).find(item => item.id === 'docling');
    expect(installed.directory).toContain('docling');
    await expect(page.getByRole('region', { name: '정보', exact: true })).toContainText(installed.directory);
    await expect(page.getByRole('region', { name: '정보', exact: true }).getByText('설치 경로', { exact: true })).toBeVisible();
    if (screenshots) {
      await page.getByRole('region', { name: '정보', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'tmp/1112-evidence/registered-640.png' });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: 'tmp/1112-evidence/registered-1440.png' });
      await page.setViewportSize({ width: 640, height: 1000 });
    }
    await page.getByRole('button', { name: '플러그인 목록으로', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Docling 설정', exact: true })).toBeFocused();
    // Let in-flight inventory handlers finish before returning requests to Host.
    await page.unrouteAll({ behavior: 'wait' });
    // A real old registration, not a mocked HTTP failure: Host must stop UI admission.
    await page.getByTestId('sidebar').getByRole('button', { name: 'Docling', exact: true }).click();
    await expect(page.getByTestId('docling-dashboard')).toBeVisible();
    // Inject only after the dashboard initial reads and connection check finish.
    await expect(page.getByTestId('docling-dashboard').getByRole('button', { name: '다시 확인', exact: true })).toBeEnabled();
    staleRegistration = true;
    stalePluginRegistration();
    const cause = '저장된 플러그인의 버전이 지원하는 semver 형식이 아닙니다.';
    await expect(page.locator('.plugin-tab-message')).toContainText(cause);
    let pluginReads = 0;
    const countPluginReads = request => { if (/\/api\/docling-/.test(request.url())) pluginReads++; };
    page.on('request', countPluginReads);
    // Observe two ordinary discovery cycles; rejected plugin reads must stay stopped.
    await page.waitForResponse(response => response.url().endsWith('/api/ui-plugins'));
    await page.waitForResponse(response => response.url().endsWith('/api/ui-plugins'));
    page.off('request', countPluginReads);
    expect(pluginReads).toBe(0);
    if (screenshots) await page.screenshot({ path: 'tmp/1097/after-tab-640.png' });
    await page.locator('.plugin-tab-message').getByRole('button', { name: '플러그인 설정 열기', exact: true }).click();
    await expect(page.getByTestId('plugin-settings')).toContainText(cause);
    await expect(page.getByTestId('plugin-settings').getByRole('status')).toHaveCount(0);
    if (screenshots) {
      await page.screenshot({ path: 'tmp/1097/after-settings-640.png' });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: 'tmp/1097/after-settings-1440.png' });
    }
    await page.getByRole('button', { name: '다시 등록', exact: true }).click();
    await confirmation.getByRole('button', { name: '기본 버전으로 다시 등록', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Docling 서버', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 등록', exact: true })).toBeDisabled();
  } finally {
    try {
      if (staleRegistration) {
        await page.unrouteAll({ behavior: 'wait' });
        expect((await page.request.post(origin + '/api/worker-plugins', { data: { bundled: 'docling' } })).ok()).toBe(true);
      }
    } finally {
      // Preferences survive page teardown; restore the next scenario's starting language.
      await page.evaluate(prefix => {
        localStorage.setItem(prefix + '.uiLanguage', 'en');
        localStorage.setItem(prefix + '.theme', 'light');
      }, brand.storagePrefix);
    }
  }
}
