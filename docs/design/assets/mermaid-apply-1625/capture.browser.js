// Copy to apps/editor/test/mermaid-apply-capture.browser.js and run
// pnpm browser:test mermaid-apply-capture. Uses disposable browser fixtures only.
async (page, { openPath, expect, waitForExplorerLayout }) => {
  const stage = 'after';
  // Public evidence uses a synthetic account, with no pixel editing.
  await page.route('**/api/host-capabilities', route => route.fulfill({json:{fileDeletion:'permanent',identity:{runAs:'DEMO-PC\\demo'}}}));
  await page.reload();
  const initial = await (await page.request.get(page.url().split('/').slice(0,3).join('/') + '/api/document', {headers:{Connection:'close'}})).json();
  const separator = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(separator).slice(0,-4).join(separator);
  await openPath(page, [root,'tmp','mermaid-authoring','diagram.md'].join(separator));
  const active = page.locator('[data-document-tab][data-active=true]');
  const figure = active.locator('[data-content-kind="mermaid"]').first();
  const cases = {
    small: 'graph LR\n  A[Input] --> B[Output]',
    large: 'graph TD\n' + Array.from({length:15},(_,i)=>`N${i}[Stage ${i}]`).join(' --> '),
  };
  const captures=[];
  for (const width of [1440,640]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:1200}); await waitForExplorerLayout(page);
    await page.evaluate(async theme => {
      await (await import('/src/i18n.ts')).i18n.changeLanguage('en');
      (await import('/src/theme.ts')).applyTheme(theme);
    },theme);
    for (const [size,source] of Object.entries(cases)) {
      await figure.hover({position:{x:4,y:4}});
      await figure.getByRole('button',{name:'Edit figure'}).click();
      await page.getByTestId('mermaid-edit-source').click();
      const input=active.getByTestId('mermaid-source');
      await expect(input).toBeFocused(); await input.fill(source);
      const preview=active.getByTestId('mermaid-edit-preview');
      await expect(preview).toHaveAttribute('aria-busy','false');
      await preview.locator('img').evaluate(img=>img.decode());
      await input.scrollIntoViewIfNeeded();
      const name=`${width}-${theme}-${size}.png`;
      await page.screenshot({path:`docs/design/assets/mermaid-apply-1625/${stage}/${name}`,caret:'hide'});
      captures.push({stage,file:name,width,height:1200,theme,size,
        preview:await preview.boundingBox(),apply:await active.getByTestId('mermaid-apply').boundingBox()});
      await active.getByTestId('mermaid-cancel').click();
    }
  }
  return captures;
}
