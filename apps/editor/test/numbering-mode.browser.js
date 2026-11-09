async (page, { openPath, reloadDocument, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'reference-save-reload', 'fixed.md'].join(sep);
  const settings = page.getByRole('button', {name:'Document settings',exact:true});
  const engine = page.locator('[data-document-tab][data-active=true] .document-editor');
  await openPath(page, file);
  await settings.click();
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('numbering-mode')).toHaveText('Fixed');
  if (screenshots) {
    for (const language of ['en','ko']) {
      if (language === 'ko') {
        await page.getByRole('button', {name:'Settings',exact:true}).click();
        await page.getByTestId('ui-language').selectOption('ko');
        await page.keyboard.press('Escape');
        await page.getByTestId('settings-dialog').waitFor({state:'detached'});
        await page.emulateMedia({colorScheme:'dark'});
      }
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:1000});
        await page.evaluate(async () => {await document.fonts.ready; document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0);});
        await page.mouse.move(0,0);
        await page.screenshot({path:`tmp/numbering-mode-after-${width}-${language}.png`});
      }
    }
    await page.getByRole('button', {name:'설정',exact:true}).click();
    await page.getByTestId('ui-language').selectOption('en');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  }
  await page.setViewportSize({width:1440,height:1000});
  const enumerators = () => engine.evaluate(el => {const values=[];el.editor.state.doc.forEach(n=>{if(['figure','equation','table'].includes(n.type.name))values.push(n.attrs.enumerator)});return values;});
  const undo = () => engine.evaluate(el => el.editor.commands.undo());
  const original = await enumerators();
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('numbering-mode')).toHaveText('Fixed');
  await page.getByRole('button',{name:'Make all automatic',exact:true}).click();
  expect((await enumerators()).every(n=>!n)).toBe(true);
  await undo();
  expect(await enumerators()).toEqual(original);
  // Remove one applied number, then resolve it directly in the notification.
  await engine.evaluate(el => {const e=el.editor;let pos;e.state.doc.forEach((n,p)=>{if(pos===undefined && n.type.name==='figure')pos=p});e.view.dispatch(e.state.tr.setNodeAttribute(pos,'enumerator',null));});
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('numbering-mode')).toHaveText('Mixed');
  await page.getByRole('button',{name:'Fix current number',exact:true}).first().click();
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('numbering-mode')).toHaveText('Fixed');
  await undo();
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('numbering-mode')).toHaveText('Mixed');
  const mixed = await enumerators();
  await page.getByRole('button',{name:'Make all fixed',exact:true}).click();
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('numbering-mode')).toHaveText('Fixed');
  await undo();
  expect(await enumerators()).toEqual(mixed);
  await page.getByRole('button',{name:'Make all fixed',exact:true}).click();
  const fixed = await enumerators();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  await reloadDocument(page);
  expect(await enumerators()).toEqual(fixed);
}
