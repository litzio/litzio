// Manual review only. Temporarily run as quiet-document with --screenshots; restore that scenario afterwards.
async (page, { openPath, screenshots }) => {
  if (!screenshots) throw Error('Manual captures require --screenshots');
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  await openPath(page, [root, 'tmp', 'editing-block-bar-1022', 'converter-control.md'].join(sep));
  const captures = [];
  const before = !await page.locator('.block-gutter').evaluate(n => getComputedStyle(n).getPropertyValue('--size-editing-block-bar').trim());
  for (const [width, theme] of before ? [[1440,'light']] : [[1440,'light'],[1440,'dark'],[640,'light']]) {
    await page.setViewportSize({width,height:1000});
    const expand = page.getByRole('button',{name:'Expand Explorer',exact:true});
    if (await expand.isVisible()) await expand.click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByTestId('theme').selectOption(theme);
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.evaluate(() => document.fonts.ready);
    const doc = page.locator('[data-document-tab][data-active="true"] .document-editor');
    for (const [name,target] of [
      ['paragraph',doc.locator('p').filter({hasText:'This design note develops'}).first()],
      ['nested-list',doc.locator('li p').filter({hasText:'Inductance changes'}).first()],
      ['admonition',doc.locator('.admonition-body').filter({hasText:'Keep the power stage disabled'}).first()],
    ]) {
      await target.click();
      await page.keyboard.type(' '); await page.keyboard.press('Backspace');
      await page.mouse.move(0,0);
      await target.evaluate(n => n.scrollIntoView({block:'center'}));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = `docs/design/assets/editing-block-bar-1022/${before?'before':'after'}-${width}-${theme}-${name}.png`;
      await page.screenshot({path:file,caret:'initial'}); captures.push(file);
      if (before) break;
    }
  }
  return {captures,before};
}
