async(page,{openPath,expect})=>{
 const origin=page.url().split('/').slice(0,3).join('/');
 const initial=await(await page.request.get(origin+'/api/document',{headers:{Connection:'close'}})).json();
 const sep=initial.path.includes('\\')?'\\':'/';const root=initial.path.split(sep).slice(0,-4).join(sep);
 await openPath(page,[root,'tmp','table-spacing-1481','cursor-sample.md'].join(sep));
 await page.setViewportSize({width:1440,height:1000});
 await page.getByTestId('view-visual').click();
 const table=page.locator('.table-block:visible').nth(1);const data=[];
 // Preserve normal product tokens; only presentation is injected for this visual prototype.
 const css=`html[data-proto] .table-grid{padding:var(--size-control-compact) 0 0!important}
 html[data-proto] .table-tools button{position:fixed!important} html[data-proto] .table-tools button,html[data-proto] .table-action-bar,html[data-proto] .block-hover-controls{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
 html[data-proto] button[data-proto-tool]{left:var(--proto-left)!important;top:var(--proto-top)!important;width:var(--proto-width)!important;height:var(--proto-height)!important;position:fixed!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:30!important;min-width:0!important;min-height:0!important;padding:0!important;border:var(--border-width) solid var(--id-color-border-strong)!important;border-radius:var(--id-radius-full,12px)!important;background:var(--id-color-surface)!important;color:var(--id-color-text-muted)!important;display:flex!important;align-items:center;justify-content:center}
 html[data-proto] button[data-proto-tool] svg{display:none}
 html[data-proto] button[data-proto-tool]::after{content:attr(data-proto-symbol);font-size:var(--font-size-sm);line-height:1}
 html[data-proto] .table-command-popover{z-index:50}
 html[data-proto] tr[data-proto-row] > :is(td,th){background:var(--id-color-surface-selected)!important;box-shadow:inset 0 0 0 1px var(--id-color-interaction)}
 html[data-proto] .table-block:has([data-proto-tool]) ~ .block-controls{visibility:hidden}
 `;
 const style=await page.addStyleTag({content:css});
 const apply=async(target,inside,menu=false)=>target.evaluate((block,{inside,menu})=>{
 document.querySelectorAll('[data-proto-clone]').forEach(b=>b.remove());document.querySelectorAll('[data-proto-tool]').forEach(b=>{b.removeAttribute('data-proto-tool');b.removeAttribute('data-proto-symbol')});
 document.querySelectorAll('[data-proto-row]').forEach(r=>r.removeAttribute('data-proto-row'));
 if(!inside)return;
 const t=block.querySelector('table'),r=t.getBoundingClientRect(),scroll=block.querySelector('.table-scroll').getBoundingClientRect();
 const current=t.style.minWidth?t.rows[t.rows.length-1].cells[t.rows[0].cells.length-1]:t.rows[0].cells[0];const row=current.parentElement.rowIndex,col=current.cellIndex;
 const cr=t.rows[0].cells[col].getBoundingClientRect(),rr=t.rows[row].getBoundingClientRect();
 const set=(original,x,y,w,h,symbol)=>{for(const [k,v] of Object.entries({left:x,top:y,width:w,height:h}))original.style.setProperty(k,v+'px','important');const b=original.cloneNode(true);b.dataset.protoClone='true';b.addEventListener('click',()=>original.click());document.body.append(b);b.dataset.protoTool='true';b.dataset.protoSymbol=symbol;for(const [k,v] of Object.entries({left:x,top:y,width:w,height:h}))b.style.setProperty('--proto-'+k,v+'px')};
 set(block.querySelectorAll('.table-row-handle')[row],scroll.left-(block.querySelector('.table-scroll').scrollLeft>0?14:6),rr.top+rr.height/2-14,12,28,'⋮');
 const cx=Math.min(scroll.right-16,Math.max(scroll.left+16,cr.left+cr.width/2));
 set(block.querySelectorAll('.table-column-handle')[col],cx-14,r.top-6,28,12,'•••');
 if(menu){t.rows[row].dataset.protoRow='true';return;}
 set(block.querySelector('[aria-label="Append column"]'),scroll.right+4,r.top,8,r.height,'+');
 set(block.querySelector('[aria-label="Append row"]'),scroll.left,r.bottom+4,scroll.width,8,'+');
 },{inside,menu});
 const capture=async(name,target)=>{
 const result=await target.evaluate(b=>{const t=b.querySelector('table'),r=t.getBoundingClientRect();const buttons=[...document.querySelectorAll('[data-proto-tool]')];const collisions=[];for(const button of buttons){const a=button.getBoundingClientRect();for(const cell of t.querySelectorAll('th,td')){const range=document.createRange();range.selectNodeContents(cell);for(const q of range.getClientRects()){const w=Math.min(a.right,q.right)-Math.max(a.left,q.left),h=Math.min(a.bottom,q.bottom)-Math.max(a.top,q.top);if(w>0&&h>0)collisions.push({button:button.getAttribute('aria-label'),text:cell.textContent,width:w,height:h});}}}return {table:r.toJSON(),block:b.getBoundingClientRect().toJSON(),controls:buttons.map(e=>({label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()})),collisions,scrollLeft:b.querySelector('.table-scroll').scrollLeft}});
 data.push({name,...result});
 const paper=await page.locator('.tiptap:visible').boundingBox();await page.screenshot({path:'tmp/table-cursor-prototype/'+name+'.png',clip:{x:Math.max(0,paper.x-44),y:72,width:Math.min(1440-paper.x+44,paper.width+88),height:928}});
 };
 for(const theme of ['light','dark']){
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const version of ['current','prototype']){
 await page.evaluate(v=>{if(v==='prototype')document.documentElement.dataset.proto='true';else delete document.documentElement.dataset.proto},version);
 await table.locator('td').first().click();await table.scrollIntoViewIfNeeded();
 for(const state of ['outside','inside','row-menu','dense-header','full-width','wide-scroll']){
 await page.keyboard.press('Escape');
 await page.locator('.tiptap:visible > p').first().click();await page.mouse.move(0,0);
 let target=table;
 if(state==='dense-header')target=page.locator('.table-block:visible').nth(2);
 if(state==='wide-scroll')target=page.locator('.table-block:visible').last();
 await target.scrollIntoViewIfNeeded();
 if(state!=='outside'){await target.locator('td,th').first().click();await target.locator('td,th').first().evaluate(c=>{document.querySelectorAll('[data-proto-current]').forEach(n=>n.removeAttribute('data-proto-current'));c.dataset.protoCurrent='true'});}
 if(state==='wide-scroll'){
 await target.locator('table').evaluate(t=>{t.style.minWidth='1200px'});await target.locator('.table-scroll').evaluate(s=>s.scrollLeft=s.scrollWidth);
 await target.locator('td,th').last().click();await target.locator('td,th').last().evaluate(c=>{document.querySelectorAll('[data-proto-current]').forEach(n=>n.removeAttribute('data-proto-current'));c.dataset.protoCurrent='true'});
 }
 if(version==='prototype')await apply(target,state!=='outside');
 if(state==='row-menu'){
 if(version==='prototype')await apply(target,true,true);
 if(version==='prototype')await page.locator('body > [data-proto-tool].table-row-handle').click();else await target.locator('.table-row-handle').first().click();await page.getByRole('menu').waitFor({state:'visible'});
 }
 await page.mouse.move(1400,10);
 await capture(theme+'-'+version+'-'+state,target);
 if(state==='wide-scroll')await target.locator('table').evaluate(t=>t.style.minWidth='');
 }
 }
 }
 await style.evaluate(el=>el.remove());await page.evaluate(()=>delete document.documentElement.dataset.proto);
 return data;
}



