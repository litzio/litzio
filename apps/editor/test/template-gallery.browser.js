// Gallery-only risks: one retained preview editor, card/keyboard navigation, real template
// PUT/open, and localized save POST feedback. Host tests own template-file writes/collisions.
async (page, { expect, waitForEditorFocus }) => {
  const previousLanguage = await page.evaluate(() => localStorage.getItem('litzio.uiLanguage'));
  try {
    const origin = page.url().split('/').slice(0, 3).join('/');
    const reconnectOrigin = origin.replace('127.0.0.1', 'localhost');
    // Background folder observation is independent of the stale operation under test.
    await page.route(`${reconnectOrigin}/api/folder-version?*`, route => route.fulfill({
      headers: { 'access-control-allow-origin': origin }, json: { version: 'reconnected-fixture', revisions: [] },
    }));
    const loaded = await (await page.request.get(origin + '/api/document', { headers: { Connection: "close" } })).json();
    const originalCatalog = await (await page.request.get(origin + '/api/templates?language=ko', { headers: { Connection: "close" } })).json();
    const sep = loaded.path.includes('\\') ? '\\' : '/';
    const root = loaded.path.split(sep).slice(0, -4).join(sep);
    const folder = [root, 'tmp', 'new-document'].join(sep);
    await page.evaluate(() => localStorage.setItem('litzio.uiLanguage', 'ko'));
    await page.reload();
    const enter = page.getByTestId('sidebar').getByRole('button', { name: '템플릿 갤러리', exact: true });
    await enter.click();
    const gallery = page.getByRole('tabpanel', { name: '템플릿 갤러리', exact: true });
    const cards = gallery.locator('.template-card-preview');
    await expect(cards).toHaveCount(2);
    await expect(gallery.getByText('사용자 템플릿이 없습니다.')).toBeVisible();
    await cards.first().hover();
    const preview = page.getByRole('dialog', { name: '문서 미리보기', exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.locator('.document-title-input')).toHaveValue('AI 작업 보고서');
    await preview.locator('.document-editor').evaluate(node => { window.galleryPreviewEditor = node.editor; });
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();
    await cards.nth(1).hover();
    await expect(preview.locator('.document-title-input')).toHaveValue('기술 문서');
    expect(await preview.locator('.document-editor').evaluate(node => node.editor === window.galleryPreviewEditor)).toBe(true);
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();
    // Real keyboard entry after pointer close, Escape returns to the card without reopening.
    await cards.first().focus();
    await expect(preview).toBeVisible();
    await page.keyboard.press('Tab');
    const previewScroll = page.getByRole('region', { name: '미리보기 내용' });
    await expect(previewScroll).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(cards.first()).toBeFocused();
    await cards.first().hover();
    await expect(preview).toBeVisible();
    expect(await preview.locator('.document-editor').evaluate(node => node.editor === window.galleryPreviewEditor)).toBe(true);
    // Creation stays on the card, outside the preview.
    await gallery.getByRole('button', { name: '이 템플릿으로 새 문서', exact: true }).first().click();
    await page.getByTestId('folder-path').fill(folder);
    await page.getByTestId('folder-open').click();
    await page.getByTestId('new-file-name').fill('from-template');
    await page.getByRole('button', { name: '만들기', exact: true }).click();
    const editor = page.locator('[data-document-tab][data-active="true"] .document-editor');
    await expect(editor).toBeVisible();
    await waitForEditorFocus(page);
    const created = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(folder + sep + 'from-template.md')}`, { headers: { Connection: "close" } })).json();
    expect(created.source).not.toContain('template:');
    expect(created.source).toContain('작업 목적');
    expect(created.source).toContain('그림 %s');
    // The UI must send the saved active path, not source text or a stale gallery path.
    let calls = 0;
    await page.route('**/api/templates', async route => {
      const body = route.request().postDataJSON();
      expect(body.from).toBe(created.path);
      calls++;
      if (calls === 1) return route.fulfill({ status: 400, json: { error: 'Template name is reserved for an app default.' } });
      if (calls === 2) return route.fulfill({ status: 400, json: { error: 'Template already exists.' } });
      return route.fulfill({ status: 201, json: { id: 'user:My report', name: body.name, description: body.description, source: created.source, kind: 'user' } });
    });
    await page.keyboard.press('Control+Slash');
    await page.getByRole('combobox').fill('템플릿으로 저장');
    await page.getByRole('option', { name: '템플릿으로 저장…', exact: true }).click();
    const save = page.getByRole('dialog', { name: '템플릿으로 저장…', exact: true });
    await save.getByLabel('이름', { exact: true }).fill('AI 작업 보고서');
    await save.getByRole('button', { name: '저장', exact: true }).click();
    await expect(save.getByRole('alert')).toContainText('예약된 이름');
    await save.getByLabel('이름', { exact: true }).fill('My report');
    await save.getByRole('button', { name: '저장', exact: true }).click();
    await expect(save.getByRole('alert')).toContainText('같은 이름');
    await save.getByRole('button', { name: '저장', exact: true }).click();
    await expect(save).toBeHidden();
    expect(calls).toBe(3);
    // Reconnection is a Desktop lifecycle event, injected here to test a dialog
    // opened AFTER the change; it must keep the source document's old client.
    await page.route('**/api/host-capabilities', route => route.fulfill({ json: { fileDeletion: 'trash' } }));
    await page.evaluate(async target => (await import('/src/host-client.ts')).setDesktopHost(target), reconnectOrigin);
    try {
      await page.keyboard.press('Control+Slash');
      await page.getByRole('combobox').fill('템플릿으로 저장');
      await page.getByRole('option', { name: '템플릿으로 저장…', exact: true }).click();
      await save.getByLabel('이름', { exact: true }).fill('Previous connection');
      await save.getByRole('button', { name: '저장', exact: true }).click();
      await expect(save.getByRole('alert')).toContainText('Host connection changed');
      expect(calls).toBe(3);
      await save.getByRole('button', { name: '취소', exact: true }).click();
    } finally {
      await page.evaluate(async () => (await import('/src/host-client.ts')).setDesktopHost('/'));
    }

    // Partial catalog failure must leave valid choices available, including a separate empty state.
    const user = { id: 'user:technical-document', name: 'technical-document', description: 'Reading table spacing', kind: 'user' };
    await page.route('**/api/template?*', route => route.fulfill({ json: { ...user, source: loaded.source } }));
    await page.route('**/api/templates?*', route => route.fulfill({ json: { directory: loaded.path.split(sep).slice(0, -1).join(sep), templates: [...originalCatalog.templates, user], problems: [{ file: 'broken.md', error: 'Invalid native document' }] } }));
    await enter.click();
    await expect(gallery.getByText('일부 사용자 템플릿을 불러오지 못했습니다.')).toBeVisible();
    await expect(gallery.getByText('broken.md')).toBeVisible();
    await expect(gallery.locator('.template-card')).toHaveCount(originalCatalog.templates.length + 1);
    const userCard = gallery.getByRole('button', { name: 'technical-document 미리보기', exact: true });
    await userCard.hover();
    await expect(preview.locator('.table')).toBeVisible();
    const gap = await preview.locator('.document-editor').evaluate(node => {
      const heading = [...node.querySelectorAll('.heading')].at(-1);
      return node.querySelector('.table').getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
    });
    expect(gap).toBeLessThan(48); // Reading keeps the ordinary block gap, without the 60px authoring gutter.
    // Close the pointer preview before entering through the keyboard, as above.
    // The built-in fits without scrolling; this existing long document proves native keyboard reading.
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();
    await userCard.focus();
    await expect(preview).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(previewScroll).toBeFocused();
    const scrollBeforePageDown = await previewScroll.evaluate(node => node.scrollTop);
    await page.keyboard.press('PageDown');
    await expect.poll(() => previewScroll.evaluate(node => node.scrollTop)).toBeGreaterThan(scrollBeforePageDown);
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(userCard).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();
    // Creating from a gallery card is also a continuation of that gallery's connection.
    let staleCreates = 0;
    const countCreates = request => { if (request.method() === 'PUT' && request.url().includes('/api/document')) staleCreates++; };
    page.on('request', countCreates);
    await page.evaluate(async target => (await import('/src/host-client.ts')).setDesktopHost(target), reconnectOrigin);
    try {
      await gallery.getByRole('button', { name: '이 템플릿으로 새 문서', exact: true }).first().click();
      const newDocument = page.getByRole('dialog', { name: '새 문서', exact: true });
      await page.getByTestId('new-file-name').fill('stale-template');
      await newDocument.getByRole('button', { name: '만들기', exact: true }).click();
      await expect(newDocument.getByRole('alert')).toContainText('Host connection changed');
      expect(staleCreates).toBe(0);
      await newDocument.getByRole('button', { name: '취소', exact: true }).click();
    } finally {
      page.off('request', countCreates);
      await page.evaluate(async () => (await import('/src/host-client.ts')).setDesktopHost('/'));
    }
  } finally {
    await page.evaluate(value => {
      if (value === null) localStorage.removeItem('litzio.uiLanguage');
      else localStorage.setItem('litzio.uiLanguage', value);
    }, previousLanguage);
  }
}
