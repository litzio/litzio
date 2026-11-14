async(page,{openPath,expect,assertTableToolGeometry})=>{
 const initial=await(await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close'}})).json();
 const sep=initial.path.includes('\\')?'\\':'/';const root=initial.path.split(sep).slice(0,-4).join(sep);
 await openPath(page,[root,'tmp','table-tool-placement','table-tool-placement.md'].join(sep));
 const tables=page.locator('.table-block:visible'), observations=[];
 // This first 1280 -> 1440 transition docks the 256px document panel. The
 // standard text column retains its width but moves 128px to the left.
 for(const theme of ['light','dark']){
 await page.evaluate(async theme=>(await import('/src/theme.ts')).applyTheme(theme),theme);
 for(const state of ['inside','dense-header','wide-scroll']){
 const table=tables.nth(state==='inside'?1:state==='dense-header'?2:3);
 if(state==='wide-scroll')await table.locator('table').evaluate(t=>t.style.minWidth='1200px');
 for(const collapsed of [false,true]){
 const actual=await page.locator('.sidebar--collapsed').count()>0;
 if(actual!==collapsed)await page.getByRole('button',{name:collapsed?'Collapse Explorer':'Expand Explorer',exact:true}).click();
 for(const width of [1440,640,1440]){
 await page.setViewportSize({width,height:1000});
 const cell=table.locator('td');await (state==='wide-scroll'?cell.last():cell.first()).click();
 await expect(table.locator('.table-row-handle[data-show=true]')).toHaveCount(1);
 await table.scrollIntoViewIfNeeded();
 const report=await assertTableToolGeometry(table);
 observations.push({theme,state,collapsed,width,...report});
 }
 }
 if(state==='wide-scroll')await table.locator('table').evaluate(t=>t.style.minWidth='');
 }
 }
 return observations;
}
