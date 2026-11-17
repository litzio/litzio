// Unique UI contract: per-tab expansion, external-content isolation, keyboard controls and notation previews.
async (page, { openPath, reloadDocument, expect, screenshots, withBlockHover }) => {
  const assert = (ok, reason) => { if (!ok) throw Error(reason); };
  const active = () => page.locator('[data-document-tab][data-active=true]');
  const editor = () => active().locator('.document-editor');
  const disclosure = (language='en') => active().getByRole('button',{name:language==='en'?'Document settings':'문서 설정',exact:true});
  const body = () => active().locator('.display-settings');
  const ready = () => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await ready();
  const defaultPath = (await (await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document', { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\')?'\\':'/';
  // A minimum-height paper and unchanged editor size must not hide position-only layout changes.
  // Keep the short fixture below the paper minimum even with settings expanded
  // and #793's table metadata row plus #892's caption numbering controls. Size invariants remain required.
  await page.setViewportSize({width:1440,height:1600});
  const short=[...defaultPath.split(separator).slice(0,-4), 'tmp', 'inline-document-settings', 'short.md'].join(separator);
  await openPath(page,short);
  await page.evaluate(async () => { await document.fonts.ready; });
  const twoFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await twoFrames();
  await editor().evaluate(n => {
    window.settingsLayoutTransactions = 0;
    n.editor.on('transaction', () => { window.settingsLayoutTransactions++; });
  });
  const alignment = state => active().evaluate((tab, state) => {
    const host=tab.querySelector('article.document'), content=tab.querySelector('.document-editor');
    const paragraph=content.querySelector('.paragraph');
    let index;
    content.editor.state.doc.forEach((node,pos,i) => { if(content.editor.view.nodeDOM(pos)===paragraph) index=i; });
    const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
    const block=rect(paragraph), control=rect(host.querySelectorAll('.block-controls')[index]);
    const outline=host.querySelector('[data-testid="block-hover-outline"]');
    const hover=outline ? rect(outline) : null;
    const headings=[...content.querySelectorAll('.heading')];
    const expectedHeading=headings.filter(n=>n.getBoundingClientRect().top<=innerHeight*0.3).at(-1) ?? headings[0];
    const table=content.querySelector('table');
    const rows=[...table.rows].map((row,i)=>({row:rect(row),control:rect(content.querySelectorAll('.table-row-handle')[i])}));
    const columns=[...table.rows[0].cells].map((cell,i)=>({cell:rect(cell),control:rect(content.querySelectorAll('.table-column-handle')[i])}));
    return {state,block,control,hover,paper:rect(host),content:rect(content),rows,columns,
      expectedHeading:expectedHeading.textContent,currentHeading:document.querySelector('[data-testid="outline"] [aria-current="location"]')?.textContent,
      transactions:window.settingsLayoutTransactions};
  },state);
  const layout=[];
  await withBlockHover(page,async()=>{
    for(const state of ['collapsed','expanded','collapsed-again']) {
      if(state!=='collapsed') await disclosure().click();
      await editor().locator('.paragraph').first().hover();
      await twoFrames();
      layout.push(await alignment(state));
      if(screenshots) await page.screenshot({path:`tmp/inline-settings-580/short-${state}.png`});
    }
  });
  const errors=[];
  for(const geometry of layout) {
    const {block,control,hover}=geometry;
    if(Math.abs(control.top-block.top)>0.5 || !hover || hover.height<=block.height ||
      Math.abs((hover.top+hover.bottom)/2-(block.top+block.bottom)/2)>0.5) errors.push('Gutter/hover alignment: '+JSON.stringify(geometry));
    if(geometry.currentHeading!==geometry.expectedHeading) errors.push('Reading outline: '+JSON.stringify(geometry));
    if(geometry.rows.some(({row,control})=>Math.abs((row.top+row.bottom)/2-(control.top+control.bottom)/2)>0.5) ||
      geometry.columns.some(({cell,control})=>Math.abs((cell.left+cell.right)/2-(control.left+control.right)/2)>0.5 || control.right-control.left<28)) errors.push('Table tools alignment: '+JSON.stringify(geometry));
    if(Math.abs(geometry.paper.height-layout[0].paper.height)>0.5 || Math.abs(geometry.content.height-layout[0].content.height)>0.5 || geometry.transactions!==0) errors.push('Position-only fixture changed size or dispatched a transaction: '+JSON.stringify(geometry));
  }
  assert(layout[0].expectedHeading!==layout[1].expectedHeading,'The short fixture crosses the reading line on expansion');
  assert(errors.length===0,errors.join('\n'));
  await page.getByRole('button',{name:'Close short.md',exact:true}).click();
  await page.getByTestId('sidebar').getByRole('button',{name:'More actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Close folder',exact:true}).click();
  const file=[...defaultPath.split(separator).slice(0,-4),'tmp','document-tabs','technical-1.md'].join(separator);
  await openPath(page,file);
  const state = () => editor().evaluate(n => JSON.stringify({doc:n.editor.getJSON(),selection:n.editor.state.selection.toJSON(),undo:n.editor.can().undo(),redo:n.editor.can().redo()}));
  const original = await state();
  assert(await disclosure().getAttribute('aria-expanded')==='false','Each newly opened document starts collapsed');
  await disclosure().focus(); await page.keyboard.press('Enter');
  await body().waitFor();
  await page.keyboard.press('Tab');
  assert(await active().getByRole('combobox',{name:'Status',exact:true}).evaluate(n=>n===document.activeElement),'Tab enters status');
  await page.keyboard.press('Tab');
  assert(await active().getByRole('switch',{name:'Number headings',exact:true}).evaluate(n=>n===document.activeElement),'Tab enters heading numbering');
  await page.keyboard.press('Tab');
  assert(await active().getByRole('combobox',{name:'Caption numbering',exact:true}).evaluate(n=>n===document.activeElement),'Tab reaches caption numbering');
  await page.keyboard.press('Tab');
  const notation = active().getByRole('combobox',{name:'Reference style',exact:true});
  assert(await notation.evaluate(n=>n===document.activeElement),'Tab reaches reference style');
  assert((await notation.locator('option[value="concise"]').innerText()).includes('Fig. 1 · Table 1 · (1)'), 'Concise offers actual notation previews');
  assert((await notation.locator('option[value="korean"]').innerText()).includes('그림 1 · 표 1 · 식 (1)'), 'Korean offers actual notation previews');
  await page.keyboard.press('Escape'); await body().waitFor({state:'hidden'});
  assert(await state()===original,'Expanding, keyboard navigation and collapsing preserve selection and history');
  assert(await editor().locator('.document-settings').count()===0,'Settings never enter ProseMirror content');
  // The public settings path owns document metadata, history, dirty state and Core Save replay.
  await disclosure().click();
  const status = active().getByRole('combobox',{name:'Status',exact:true});
  const mark = () => active().locator('.document-settings-summary .screen-status');
  await expect(mark()).toHaveCount(0);
  await status.selectOption('draft');
  await expect(page.getByTestId('status')).toHaveAttribute('title','Unsaved changes');
  await expect(mark()).toHaveText('Draft');
  await status.selectOption('review');
  await editor().evaluate(n=>n.editor.commands.undo());
  await expect(status).toHaveValue('draft');
  await editor().evaluate(n=>n.editor.commands.redo());
  await expect(status).toHaveValue('review');
  await status.selectOption('approved');
  await disclosure().click();
  await expect(mark()).toHaveText('Approved');
  await editor().evaluate(n=>n.editor.setEditable(false));
  await expect(mark()).toHaveText('Approved');
  await expect(active().locator('.document-settings').locator('select,input,button')).toHaveCount(0);
  await editor().evaluate(n=>n.editor.setEditable(true));
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  await reloadDocument(page);
  await expect(mark()).toHaveText('Approved');
  await disclosure().click();
  await status.selectOption('');
  await expect(mark()).toHaveCount(0);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).filter({visible:true}).waitFor();
  await reloadDocument(page);
  await expect(mark()).toHaveCount(0);
  // Source preserves the tab-session expansion while hiding all document settings UI.
  if(await disclosure().getAttribute('aria-expanded') !== 'true') await disclosure().click();
  await page.getByTestId('view-source').click(); await active().getByTestId('source-view').waitFor();
  assert(await page.getByRole('button',{name:'Document settings',exact:true}).count()===0,'Source omits inline settings');
  await page.getByTestId('view-visual').click(); await body().waitFor();
  // A readonly document exposes only the value summary, with no controls.
  await editor().evaluate(n=>n.editor.setEditable(false));
  await active().locator('.document-settings-summary:not(button)').waitFor();
  assert(await active().locator('.document-settings input,.document-settings button').count()===0,'Readonly settings expose summary only');
  await editor().evaluate(n=>n.editor.setEditable(true));
  await body().waitFor();
  const other=file.replace('technical-1.md','technical-2.md');
  await openPath(page,other);
  assert(await disclosure().getAttribute('aria-expanded')==='false','A second tab starts independently collapsed');
  await page.getByRole('tab',{name:'technical-1.md',exact:true}).click();
  await body().waitFor();
  assert(await disclosure().getAttribute('aria-expanded')==='true','Switching tabs preserves expansion');
  await disclosure().click();
  await page.reload(); await ready();
  assert(await disclosure().getAttribute('aria-expanded')==='false','Reload never restores expansion from storage');

  // Geometry is judged in this run; captures are optional manual evidence from the same states.
  const preferences = await page.evaluate(() => ({language:document.documentElement.lang,
    theme:localStorage.getItem('litzio.theme') ?? document.documentElement.dataset.theme, background:localStorage.getItem('litzio.pageBackground') ?? 'paper'}));
  try {
    for(const language of ['en','ko']) for(const theme of ['light','dark']) for(const background of ['paper','flat']) {
      const previousLanguage=await page.locator('html').getAttribute('lang');
      await page.getByRole('button',{name:previousLanguage==='ko'?'설정':'Settings',exact:true}).click();
      await page.getByTestId('theme').selectOption(theme);
      await page.getByTestId('page-background').selectOption(background);
      await page.getByTestId('ui-language').selectOption(language);
      await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
      for(const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        const trigger=disclosure(language);
        if(await trigger.getAttribute('aria-expanded')==='true') await trigger.click();
        await trigger.scrollIntoViewIfNeeded();
        const prefix=`tmp/inline-settings-580/after-${language}-${theme}-${background}-${width}`;
        const capture=async state => {if(screenshots) {await page.evaluate(async()=>{await document.fonts.ready;});await page.mouse.move(0,0);await page.screenshot({path:`${prefix}-${state}.png`});}};
        await capture('collapsed');
        await trigger.click(); await body().waitFor();
        const geometry=await body().evaluate(n=>{
          const r=n.getBoundingClientRect();return {left:r.left,right:r.right,overflow:n.scrollWidth>n.clientWidth,controls:[...n.querySelectorAll('button,input,select')].map(c=>{const b=c.getBoundingClientRect();return {left:b.left,right:b.right};})};
        });
        assert(geometry.left>=0&&geometry.right<=width&&!geometry.overflow&&geometry.controls.every(c=>c.left>=geometry.left&&c.right<=geometry.right),'Expanded settings must fit at '+JSON.stringify({language,theme,background,width,geometry}));
        await capture('expanded');
        await trigger.focus();await page.keyboard.press('Escape');await body().waitFor({state:'hidden'});
      }
    }
  } finally {
    if (await page.getByRole('menu').count()) {
      await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({state:'detached'});
    }
    const language=await page.locator('html').getAttribute('lang');
    if (!await page.getByTestId('settings-dialog').isVisible()) {
      await page.getByRole('button',{name:language==='ko'?'설정':'Settings',exact:true}).click();
    }
    await page.getByTestId('theme').selectOption(preferences.theme);
    await page.getByTestId('page-background').selectOption(preferences.background);
    await page.getByTestId('ui-language').selectOption(preferences.language);
    await page.keyboard.press('Escape'); await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  }
  return {shortDocumentLayout:layout};
}
