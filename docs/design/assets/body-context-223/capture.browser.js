// Manual capture: copy to a temporary apps/editor/test/*.browser.js and run through pnpm browser:test.
async (page, { openPath }) => {
  const phase = 'after';
  const initial = await (await page.request.get(page.url().split('/').slice(0,3).join('/') + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0, -4), 'tmp', 'quiet-document', 'quiet-document.md'].join(sep);
  await openPath(page, file);
  const metadata = [];
  for (const width of [1440, 640]) {
    await page.setViewportSize({width, height:900});
    await page.getByRole('button', {name:/^(Settings|설정)$/}).click();
    await page.getByTestId('ui-language').selectOption(width === 640 ? 'ko' : 'en');
    await page.getByTestId('theme').selectOption(width === 640 ? 'dark' : 'light');
    await page.getByTestId('settings-back').click();
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.evaluate(() => document.fonts.ready);
    const paragraph = page.locator('[data-document-tab][data-active=true] .document-editor > p.paragraph').last();
    await paragraph.evaluate(node => node.scrollIntoView({block:'end'}));
    const rect = await paragraph.boundingBox();
    await page.mouse.click(rect.x + rect.width - 6, rect.y + rect.height - 6, {button:'right'});
    if (phase === 'after') await page.getByRole('menu', {name:/^(Block actions|블록 작업)$/}).waitFor();
    await page.screenshot({path:`tmp/body-context-223/${phase}-${width}.png`});
    metadata.push(await page.evaluate(point => ({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,zoom:visualViewport.scale,theme:document.documentElement.dataset.theme,language:document.documentElement.lang,font:getComputedStyle(document.body).fontFamily,scroll:document.querySelector('.document-scroll[data-active=true]').scrollTop,point,menu:(() => {const rect=document.querySelector('[role=menu]')?.getBoundingClientRect(); return rect ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height} : null;})(),notificationOverlap:(() => {
      const menu=document.querySelector('[role=menu]'),row=menu?.querySelector('button.danger'),bell=document.querySelector('.notification-center > button');
      if(!row||!bell)return null;
      const r=row.getBoundingClientRect(),b=bell.getBoundingClientRect(),left=Math.max(r.left,b.left),right=Math.min(r.right,b.right),top=Math.max(r.top,b.top),bottom=Math.min(r.bottom,b.bottom);
      return {intersects:right>left&&bottom>top,menuOwnsHit:right>left&&bottom>top?row.contains(document.elementFromPoint((left+right)/2,(top+bottom)/2)):null};
    })()}), {x:rect.x+rect.width-6,y:rect.y+rect.height-6}));
    await page.keyboard.press('Escape');
    if (phase === 'after') {
      const index = await paragraph.evaluate(el => el.closest('.document-editor').editor.state.selection.$from.index(0));
      await page.locator('[data-document-tab][data-active=true] .block-handle').nth(index).click();
      await page.getByRole('menu').waitFor();
      await page.screenshot({path:`tmp/body-context-223/gutter-${width}.png`});
      await page.keyboard.press('Escape');
      await page.getByRole('treeitem',{name:'quiet-document.md',exact:true}).click({button:'right'});
      await page.getByRole('menu').waitFor();
      await page.screenshot({path:`tmp/body-context-223/file-${width}.png`});
      await page.keyboard.press('Escape');
      await page.getByRole('tab',{name:'quiet-document.md',exact:true}).click({button:'right'});
      await page.getByRole('menu').waitFor();
      await page.screenshot({path:`tmp/body-context-223/tab-${width}.png`});
      await page.keyboard.press('Escape');
    }
  }
  return {phase, metadata};
}
