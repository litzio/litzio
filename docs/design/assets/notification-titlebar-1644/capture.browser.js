// Manual visual review only; excluded from STABLE_SCENARIOS and CI.
async (page, { expect, openPath, screenshots }) => {
  if (!screenshots) throw new Error('Use --screenshots for manual titlebar review');
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, {headers:{Connection:'close'}})).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const file = [...initial.path.split(sep).slice(0,-4),'tmp','reference-save-reload','fixed.md'].join(sep);
  await openPath(page,file);
  const bell = page.locator('.notification-center > button');
  const list = page.locator('#notification-list');
  const engine = page.locator('.document-scroll[data-active=true] .document-editor');
  const close = async () => { if (await bell.getAttribute('aria-expanded') === 'true') await bell.click(); };
  const shot = async name => {
    // Only the automatic-card placement changed after the owner review.
    if (!name.endsWith('-error-auto')) return;
    await page.mouse.move(0,0);
    await page.evaluate(async () => {await document.fonts.ready;});
    await page.screenshot({path:`tmp/notification-titlebar-1644/${name}.png`, mask:[page.locator('.sidebar')]});
  };
  const geometry = async () => page.evaluate(() => {
    const names = ['.command-center-trigger','.assistant-trigger','.notification-center > button'];
    const controls = names.map(selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect(); return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};});
    const caption = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--window-controls-width')) || 0;
    return {controls,caption,viewport:innerWidth,overlap:controls.flatMap((a,i)=>controls.slice(i+1).filter(b=>Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)).map(b=>[a.selector,b.selector]))};
  });
  for (const width of [1440]) for (const theme of ['light','dark']) {
    await close();
    await page.setViewportSize({width,height:900});
    await page.evaluate(async theme=>(await import('/src/theme.ts')).applyTheme(theme),theme);
    if (width === 1440) await expect(page.locator('.assistant-trigger-label')).toBeVisible();
    await shot(`${width}-${theme}-closed`);
    const bounds = await geometry();
    expect(bounds.overlap,JSON.stringify(bounds)).toEqual([]);
    await bell.click(); await expect(list).toBeVisible();
    await shot(`${width}-${theme}-open`);
    await close();
    if (width === 1440) {
      const before = await engine.evaluate(el=>el.editor.getJSON());
      await engine.locator('p.paragraph').first().click();
      await engine.evaluate(el=>el.editor.state.doc.forEach((node,pos)=>{
        if (node.attrs.label === 'fixed-diagram') el.editor.view.dispatch(el.editor.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,mermaidSource:'this is not Mermaid'}));
      }));
      await expect(page.locator('.notification-center').getByTestId('mermaid-error')).toBeVisible();
      expect(await engine.evaluate(el=>el.contains(document.activeElement))).toBe(true);
      await shot(`${width}-${theme}-error-auto`);
      await close();
      await engine.evaluate((el,value)=>el.editor.commands.setContent(value),before);
      await expect(bell).toHaveAccessibleDescription('Notifications: none');
    }
  }
  return {manualReview:true, refreshed:'automatic-cards'};
}
