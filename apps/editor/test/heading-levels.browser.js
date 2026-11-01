// Heading depth is decorative chrome in Edit and opt-in comparison Read.
async (page, { openPath, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'read-view', name].join(sep);
  const configure = async (language, theme) => {
    await page.getByRole('button', {name:/^(Settings|설정)$/}).click();
    await page.getByTestId('ui-language').selectOption(language);
    await page.getByTestId('theme').selectOption(theme);
    await page.getByTestId('settings-back').click();
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  };
  await configure('en', 'light');
  // Depth cues are external chrome: collect both supported widths before judging the result.
  // This also leaves real before captures when run against the unmodified product.
  await openPath(page, file('heading-levels.md'));
  const depthPanel = page.locator('[data-document-tab][data-active=true]');
  const depthEditor = depthPanel.locator('.document-editor');
  const depthCues = depthPanel.locator('.heading-level');
  const depthResults = [];
  for (const [width, language, theme] of [[1440, 'en', 'light'], [640, 'ko', 'dark']]) {
    await configure(language, theme);
    await page.setViewportSize({width, height: 1000});
    await page.mouse.move(0, 0);
    await depthPanel.getByTestId('document-editor').evaluate(el => {
      el.querySelector('.document-editor').editor.view.dom.blur();
      el.closest('.document-scroll').scrollTop = 0;
    });
    await page.evaluate(() => document.fonts.ready);
    const result = await depthPanel.evaluate(panel => {
      const paper = panel.querySelector('[data-testid="document-editor"]');
      const headings = [...panel.querySelectorAll('.document-editor .heading')];
      const cues = [...panel.querySelectorAll('.heading-level')];
      const geometry = () => ({height:paper.scrollHeight, headings:headings.map(el => {
        const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
      })});
      const withCues = geometry();
      cues.forEach(el => {el.style.display = 'none';});
      const withoutCues = geometry();
      cues.forEach(el => {el.style.display = '';});
      return {withCues, withoutCues, headings:headings.map((el, i) => {
        const h = el.getBoundingClientRect(), cue = cues[i], c = cue?.getBoundingClientRect();
        return {level:el.tagName, text:cue?.textContent, title:cue?.title,
          decorative:cue?.getAttribute('aria-hidden'), outside:cue ? !el.closest('.document-editor').contains(cue) : false,
          visible:cue ? getComputedStyle(cue).visibility : null,
          left:c?.left, right:c?.right, textLeft:h.left,
          centerError:c ? Math.abs(c.top + c.height/2 - h.top - parseFloat(getComputedStyle(el).lineHeight)/2) : null};
      })};
    });
    depthResults.push({language, result});
    if (screenshots) await page.screenshot({path:`tmp/887-evidence/${await depthCues.count() ? 'after' : 'before'}-editor-${width}.png`});
  }
  for (const {language, result} of depthResults) {
    expect(result.withCues).toEqual(result.withoutCues);
    expect(result.headings.map(h => h.text)).toEqual(['H1','H2','H3','H4','H5','H6']);
    for (const [i, h] of result.headings.entries()) {
      expect(h.title).toBe(`${language === 'ko' ? '제목' : 'Heading'} ${i + 1}`);
      expect(h.decorative).toBe('true'); expect(h.outside).toBe(true); expect(h.visible).toBe('visible');
      expect(h.left).toBeGreaterThanOrEqual(0); expect(h.right).toBeLessThan(h.textLeft);
      expect(h.centerError).toBeLessThan(1);
    }
  }
  // Handle visibility wins for hover, focus and an open block menu; typing/level changes reuse geometry.
  const depthHeading = depthEditor.locator('h2');
  await page.mouse.move(0,0);
  await depthCues.nth(1).hover();
  await expect(depthCues.nth(1)).toBeVisible();
  await depthHeading.hover();
  await expect(depthCues.nth(1)).toBeHidden();
  const handle = depthPanel.locator('.block-controls').nth(1).locator('.block-handle');
  await expect(handle).toBeVisible();
  if (screenshots) await page.screenshot({path:'tmp/887-evidence/after-editor-handles-640.png'});
  await handle.click();
  await page.mouse.move(0,0);
  await expect(depthCues.nth(1)).toBeHidden();
  await page.keyboard.press('Escape');
  await depthEditor.evaluate(el => {
    el.editor.commands.setTextSelection(1);
    el.editor.view.focus();
  });
  for (let level = 1; level < 6; level++) await page.keyboard.press('Tab');
  await expect(depthCues.first()).toHaveText('H6');
  await depthEditor.evaluate(el => {
    el.editor.commands.selectAll();
    el.editor.view.focus();
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.keyboard.press('Control+c');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Depth 1'); expect(copied).not.toMatch(/H[1-6]/);
  await page.getByTestId('view-read').click();
  await expect(depthCues).toHaveCount(0);
  await page.getByTestId('view-source').click();
  await expect(depthCues).toBeHidden();
  const depthSource = await depthPanel.getByTestId('source-view').innerText();
  expect(depthSource).toContain('###### Depth 1'); expect(depthSource).not.toMatch(/H[1-6]/);
  await page.getByTestId('view-visual').click();
  await expect(depthCues.first()).toHaveText('H6');
  const saving = page.waitForResponse(response => response.url().includes('/api/document') && response.request().method() === 'POST');
  await page.keyboard.press('Control+s');
  expect((await saving).ok()).toBe(true);
  const depthSaved = await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file('heading-levels.md'))}`)).json();
  expect(depthSaved.source).toContain('###### Depth 1'); expect(depthSaved.source).not.toMatch(/H[1-6]/);
  await page.reload();
  await expect(depthCues.first()).toHaveText('H6');
  await configure('en', 'light');
}
