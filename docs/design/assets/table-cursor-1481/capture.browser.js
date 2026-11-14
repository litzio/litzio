async (page,{openPath,expect})=>{
 const initial=await(await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close'}})).json();
 const sep=initial.path.includes('\\')?'\\':'/';const root=initial.path.split(sep).slice(0,-4).join(sep);
 await openPath(page,[root,'tmp','table-cursor-product','sample.md'].join(sep));
 await page.setViewportSize({width:1440,height:1000});await page.getByTestId('view-visual').click();
 const tables=page.locator('.table-block:visible');await expect(tables).toHaveCount(4);const observations=[];
 const geometry=()=>tables.evaluateAll(bs=>bs.map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width,offset:b.getBoundingClientRect().top-b.closest('.tiptap').getBoundingClientRect().top})));
 for(const theme of ['light','dark']){
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const state of ['outside','inside','row-menu','column-menu','dense-header','wide-scroll']){
 await page.keyboard.press('Escape');await page.locator('.tiptap:visible > p').first().click();
 const target=tables.nth(state==='dense-header'?2:state==='wide-scroll'?3:1);
 await target.scrollIntoViewIfNeeded();const before=await geometry();
 if(state==='outside'){await target.hover();await page.mouse.move(1400,10);}
 else {
 const cell=target.locator('td').first();await cell.click();
 await expect(target.locator('.table-row-handle[data-show=true]')).toHaveCount(1);
 if(state==='wide-scroll'){
 await target.locator('table').evaluate(t=>t.style.minWidth='1200px');
 await target.locator('.table-scroll').evaluate(s=>s.scrollLeft=s.scrollWidth);
 await target.locator('td').last().click();
 }
 if(state==='row-menu'||state==='column-menu'){
 const handle=target.locator(state==='row-menu'?'.table-row-handle[data-show=true]':'.table-column-handle[data-show=true]');await handle.click();await page.getByRole('menu').waitFor();
 }
 }
 await page.mouse.move(1400,10);await page.evaluate(()=>document.fonts.ready);
 const after=await geometry();if(state!=='wide-scroll')expect(after).toEqual(before);
 const details=await target.evaluate(b=>{
 const viewport=b.querySelector('.table-scroll').getBoundingClientRect();
 const buttons=[...b.querySelectorAll('.table-row-layer button')].filter(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).pointerEvents==='auto');
 const collisions=[];
 for(const button of buttons){const a=button.getBoundingClientRect();for(const cell of b.querySelectorAll('td,th')){const range=document.createRange();range.selectNodeContents(cell);for(const r of range.getClientRects()){
 const left=Math.max(a.left,r.left,viewport.left),right=Math.min(a.right,r.right,viewport.right),top=Math.max(a.top,r.top),bottom=Math.min(a.bottom,r.bottom);
 if(right>left&&bottom>top)collisions.push({button:button.getAttribute('aria-label'),text:cell.textContent,width:right-left,height:bottom-top});
 }}}
 return {viewport:viewport.toJSON(),scrollLeft:b.querySelector('.table-scroll').scrollLeft,buttons:buttons.map(e=>({label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()})),collisions,menuTargets:b.querySelectorAll('[data-table-menu-target=true]').length};
 });
 expect(details.collisions).toEqual([]);
 if(state==='outside')expect(details.buttons).toHaveLength(0);
 if(state.endsWith('menu')){expect(details.buttons.some(b=>b.label.startsWith('Append'))).toBe(false);expect(details.menuTargets).toBeGreaterThan(0);}
 const bounds=await page.locator('.tiptap:visible').boundingBox();
 await page.screenshot({path:`docs/design/assets/table-cursor-1481/${theme}-${state}.png`,clip:{x:bounds.x-44,y:72,width:bounds.width+88,height:928}});
 if(state==='dense-header'){await target.getByRole('button',{name:'Table actions',exact:true}).click();await page.getByRole('menu',{name:'Table actions',exact:true}).waitFor();await page.keyboard.press('Escape');}
 observations.push({theme,state,before,after,...details});
 await page.keyboard.press('Escape');if(state==='wide-scroll')await target.locator('table').evaluate(t=>t.style.minWidth='');
 }
 }
 return observations;
}
