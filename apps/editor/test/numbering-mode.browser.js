async (page, { openPath, reloadDocument, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'reference-save-reload', 'fixed.md'].join(sep);
  const settings = page.getByRole('button', {name:'Document settings',exact:true});
  const engine = page.locator('[data-document-tab][data-active=true] .document-editor');
  await openPath(page, file);
  await settings.click();
  if (screenshots) {
    // Manual evidence only, separate from the stable behavioral scenario.
    const modern = await page.getByRole('combobox',{name:'Status',exact:true}).count() > 0;
    const phase = modern ? 'after' : 'before';
    for (const [language,theme,width] of [['en','light',1440],['ko','dark',1440],['ko','dark',640]]) {
      await page.evaluate(async ({language,theme})=>{
        await (await import('/src/i18n.ts')).i18n.changeLanguage(language);
        localStorage.setItem('litzio.theme',theme);
        document.documentElement.dataset.theme=theme;
      },{language,theme});
      await page.setViewportSize({width,height:1000});
      const trigger = page.getByRole('button',{name:language==='ko'?'문서 설정':'Document settings',exact:true});
      for (const value of modern ? ['', 'draft'] : ['']) {
        if (await trigger.getAttribute('aria-expanded')!=='true') await trigger.click();
        if(modern) await page.getByRole('combobox',{name:language==='ko'?'상태':'Status',exact:true}).selectOption(value);
        for (const state of ['expanded','collapsed']) {
          if ((await trigger.getAttribute('aria-expanded')==='true') !== (state==='expanded')) await trigger.click();
          await page.evaluate(async()=>{await document.fonts.ready;document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0);});
          await page.mouse.move(0,0);
          await engine.getByTestId('mermaid-preview').locator('img').waitFor();
          await page.screenshot({path:`tmp/settings-1721/${phase}-${value || 'none'}-${language}-${theme}-${width}-${state}.png`,
            mask:[page.locator('.activity-bar-status'),page.locator('.document-path'),page.locator('.sidebar-folder-name')],
            maskColor:await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--id-color-surface').trim())});
        }
      }
    }
    if(modern) {
      await page.evaluate(async()=> (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
      await openPath(page,[...initial.path.split(sep).slice(0,-4),'tmp','bibliography','chapters','paper.md'].join(sep));
      await page.evaluate(async()=> (await import('/src/i18n.ts')).i18n.changeLanguage('ko'));
      const trigger=page.getByRole('button',{name:'문서 설정',exact:true});
      await trigger.click();
      await page.screenshot({path:'tmp/settings-1721/after-bibliography-ko-dark-640.png',
        mask:[page.locator('.activity-bar-status'),page.locator('.document-path'),page.locator('.sidebar-folder-name')],
        maskColor:await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--id-color-surface').trim())});
    }
    return {manualCaptures:true};
  }
  await page.setViewportSize({width:1440,height:1000});
  const enumerators = () => engine.evaluate(el => {const values=[];el.editor.state.doc.forEach(n=>{if(['figure','equation','table'].includes(n.type.name))values.push(n.attrs.enumerator)});return values;});
  const undo = () => engine.evaluate(el => el.editor.commands.undo());
  const original = await enumerators();
  await expect(page.locator('[data-document-tab][data-active=true]').getByRole('combobox', {name:'Caption numbering',exact:true})).toHaveValue('fixed');
  await page.getByRole('combobox', {name:'Caption numbering',exact:true}).selectOption('automatic');
  expect((await enumerators()).every(n=>!n)).toBe(true);
  await undo();
  expect(await enumerators()).toEqual(original);
  // Remove one applied number, then resolve it directly in the notification.
  await engine.evaluate(el => {const e=el.editor;let pos;e.state.doc.forEach((n,p)=>{if(pos===undefined && n.type.name==='figure')pos=p});e.view.dispatch(e.state.tr.setNodeAttribute(pos,'enumerator',null));});
  await expect(page.locator('[data-document-tab][data-active=true]').getByRole('combobox', {name:'Caption numbering',exact:true})).toHaveValue('mixed');
  await page.getByRole('button',{name:'Fix current number',exact:true}).first().click();
  await expect(page.locator('[data-document-tab][data-active=true]').getByRole('combobox', {name:'Caption numbering',exact:true})).toHaveValue('fixed');
  await undo();
  await expect(page.locator('[data-document-tab][data-active=true]').getByRole('combobox', {name:'Caption numbering',exact:true})).toHaveValue('mixed');
  const mixed = await enumerators();
  await page.getByRole('combobox', {name:'Caption numbering',exact:true}).selectOption('fixed');
  await expect(page.locator('[data-document-tab][data-active=true]').getByRole('combobox', {name:'Caption numbering',exact:true})).toHaveValue('fixed');
  await undo();
  expect(await enumerators()).toEqual(mixed);
  await page.getByRole('combobox', {name:'Caption numbering',exact:true}).selectOption('fixed');
  const fixed = await enumerators();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  await reloadDocument(page);
  expect(await enumerators()).toEqual(fixed);
}
