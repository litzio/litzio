async(page,{openPath,expect,assertTableToolGeometry})=>{
 const initial=await(await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close'}})).json();
 const sep=initial.path.includes('\\')?'\\':'/';const root=initial.path.split(sep).slice(0,-4).join(sep);
 // A fixed-width, minimum-height paper moves without resizing when settings or
 // preceding content expands. No caret re-click may refresh cached geometry.
 await page.setViewportSize({width:1440,height:1600});
 await openPath(page,[root,'tmp','table-tool-placement','short.md'].join(sep));
 const short=page.locator('.table-block:visible');
 await short.locator('td').first().click();
 const positionOnly=[];
 for(const expanded of [false,true,false]){
 if(positionOnly.length)await page.getByRole('button',{name:'Document settings',exact:true}).click();
 const report=await assertTableToolGeometry(short);
 const sizes=await short.evaluate(t=>[t,t.closest(".document-editor"),t.closest(".document")].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 if(positionOnly.length)expect(sizes).toEqual(positionOnly[0].sizes);
 positionOnly.push({expanded,sizes,...report});
 }
 expect(positionOnly[1].metrics.addColumn.top-positionOnly[0].metrics.addColumn.top).toBeGreaterThan(100);
 const paragraph=page.locator('.document-editor:visible .paragraph').first();
 await paragraph.evaluate(p=>p.style.minHeight='120px');
 await assertTableToolGeometry(short);
 await paragraph.evaluate(p=>p.style.minHeight='');
 await assertTableToolGeometry(short);
 await openPath(page,[root,'tmp','table-tool-placement','table-tool-placement.md'].join(sep));
 const tables=page.locator('.table-block:visible'), observations=[];
 // Resizing across the docking boundary moves a constant-width text column.
 for(const theme of ['light','dark']){
 await page.evaluate(async theme=>(await import('/src/theme.ts')).applyTheme(theme),theme);
 for(const state of ['inside','dense-header','wide-scroll']){
 const table=tables.nth(state==='inside'?1:state==='dense-header'?2:3);
 if(state==='wide-scroll')await table.locator('table').evaluate(t=>t.style.minWidth='1200px');
 const cells=table.locator('td'), selected=state==='wide-scroll'?cells.last():cells.first(); await selected.click();
 for(const collapsed of [false,true]){
 const actual=await page.locator('.sidebar--collapsed').count()>0;
 if(actual!==collapsed)await page.getByRole('button',{name:collapsed?'Collapse Explorer':'Expand Explorer',exact:true}).click();
 for(const width of [1440,640,1440]){
 await page.setViewportSize({width,height:1000});
 await selected.scrollIntoViewIfNeeded();
 await expect(table.locator('.table-row-handle[data-show=true]')).toHaveCount(1);
 await table.scrollIntoViewIfNeeded();
 const report=await assertTableToolGeometry(table);
 observations.push({theme,state,collapsed,width,...report});
 if(state==='wide-scroll'){
 const horizontal=await table.locator('.table-scroll').evaluate(s=>{const before=s.scrollLeft;s.scrollLeft=before>0?before-12:before+12;return {before,after:s.scrollLeft};});
 expect(horizontal.after).not.toBe(horizontal.before);
 await assertTableToolGeometry(table);
 observations.push({theme,state,collapsed,width,horizontal});
 }
 const scroll=page.locator('.document-scroll:visible');
 const moved=await scroll.evaluate(s=>{const before=s.scrollTop,max=s.scrollHeight-s.clientHeight;s.scrollTop=before<max?Math.min(max,before+40):Math.max(0,before-40);return s.scrollTop!==before;});
 if(moved)await assertTableToolGeometry(table);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 }
 if(state==='wide-scroll')await table.locator('table').evaluate(t=>t.style.minWidth='');
 }
 }
 return observations;
}
