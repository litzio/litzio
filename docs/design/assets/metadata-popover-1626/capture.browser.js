// Copy to apps/editor/test/metadata-popover-capture.browser.js;
// pnpm browser:test metadata-popover-capture --screenshots. Manual review only.
async(page,{openPath,expect,screenshots,waitForExplorerLayout})=>{
  if(!screenshots)throw Error('Manual capture requires --screenshots');
  const stage='after';
  await page.route('**/api/host-capabilities',r=>r.fulfill({json:{fileDeletion:'permanent',identity:{runAs:'DEMO-PC\\demo'}}}));await page.reload();
  const initial=await(await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close'}})).json();
  const sep=initial.path.includes('\\')?'\\':'/';const root=initial.path.split(sep).slice(0,-4).join(sep);
  await openPath(page,[root,'tmp','metadata-popover','properties.md'].join(sep));
  const active=page.locator('[data-document-tab][data-active=true]');
  const cases=[['image','figure','figure:not([data-content-kind="mermaid"])','Edit figure'],['mermaid','mermaid-property','[data-content-kind="mermaid"]','Edit figure'],['table','table','[data-block="table"]','Edit table'],['equation','equation-property','[data-block="equation"]','Edit'],['section','label-target','[data-block="label-target"]',null]];
  const rows=[];
  for(const width of [1440,640])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:1000});await waitForExplorerLayout(page);
    await page.evaluate(async theme=>{await(await import('/src/i18n.ts')).i18n.changeLanguage('en');(await import('/src/theme.ts')).applyTheme(theme);},theme);
    await page.evaluate(()=>document.fonts.ready);
    for(const [kind,id,selector,buttonName]of cases)for(const side of ['bottom','top']){
      const target=active.locator(selector).first();await target.scrollIntoViewIfNeeded();
      if(kind==='mermaid'){await expect(target.getByTestId('mermaid-preview')).toHaveAttribute('data-theme',theme);await expect(target.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');}
      await target.evaluate((el,{side,kind})=>{const block=kind==='section'?el.closest('.node-labelTarget').nextElementSibling:el;const r=block.getBoundingClientRect(),viewport=el.closest('.document-scroll');viewport.scrollTop+=side==='bottom'?r.top-140:r.bottom-940;},{side,kind});
      if(buttonName){await target.hover({position:{x:4,y:4}});await target.getByRole('button',{name:buttonName,exact:true}).click();}
      else {const edit=target.getByTestId('label-target-edit');await edit.focus();await edit.press('Enter');}
      const popup=page.getByTestId(`${id}-properties`);await expect(popup).toHaveAttribute('data-side',side);
      if(kind==='mermaid')await expect(popup.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');
      const imgs=popup.locator('img');for(const img of await imgs.all())await img.evaluate(img=>img.decode());
      const file=`${width}-${theme}-${kind}-${side}.png`;
      await page.mouse.move(0,0);await page.screenshot({path:`docs/design/assets/metadata-popover-1626/${stage}/${file}`,caret:'hide'});
      rows.push({file:`${stage}/${file}`,width,height:1000,theme,kind,side,popup:await popup.boundingBox(),actions:await popup.locator('.form-actions').boundingBox()});
      await popup.locator('form').press('Escape');
    }
  }
  return rows;
}
