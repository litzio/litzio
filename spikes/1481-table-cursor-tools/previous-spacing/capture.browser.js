async (page,{openPath,expect})=>{
 const origin=page.url().split('/').slice(0,3).join('/');
 const initial=await(await page.request.get(origin+'/api/document',{headers:{Connection:'close'}})).json();
 const sep=initial.path.includes('\\')?'\\':'/';
 const root=initial.path.split(sep).slice(0,-4).join(sep);
 await openPath(page,[root,'tmp','table-spacing-1481','sample.md'].join(sep));
 const tables=page.locator('.table-block:visible');await expect(tables).toHaveCount(4);
 const measurements=[];
 for(const theme of ['light','dark'])for(const width of [1440,640]){
 await page.setViewportSize({width,height:1000});
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 for(const mode of ['read','visual']){
 await page.getByTestId('view-'+mode).click();
 for(const option of mode==='read'?['before','after']:['a','b']){
 const style=await page.addStyleTag({content:option==='before'?'.table-block[data-editable="false"] .table-grid{padding:calc(var(--size-control-compact) + var(--size-table-handle-gutter)) var(--size-table-handle-gutter) calc(var(--size-control-compact) + 2 * var(--space-2)) 0}':option==='b'?'.table-grid{padding:var(--size-control-compact) 0 0!important}.table-column-handle{top:calc(var(--size-control-compact) / 2)!important}.table-tools .table-extend{transform:translateY(-50%)}':'/* current */'});
 for(const state of ['hidden','shown','menu','scrolled','keyboard']){
 await page.locator('.tiptap:visible > p').first().click();
 await tables.first().scrollIntoViewIfNeeded();
 await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());
 if(state!=='hidden')await tables.nth(state==='scrolled'?3:1).hover();
 if(state==='keyboard'&&mode==='visual'){await tables.nth(1).locator('.table-column-handle').first().focus();await page.keyboard.press('Tab');}
 if(state==='menu'&&mode==='visual')await tables.nth(1).locator('.table-column-handle').first().click();
 if(state==='scrolled')await tables.nth(3).locator('.table-scroll').evaluate(el=>el.scrollLeft=el.scrollWidth);
 const metrics=await tables.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),g=n.querySelector('.table-grid'),c=getComputedStyle(g);return {height:r.height,padding:[c.paddingTop,c.paddingRight,c.paddingBottom],buttons:[...n.querySelectorAll('.table-tools button')].map(b=>{const x=b.getBoundingClientRect();return {label:b.getAttribute('aria-label'),top:x.top-r.top,bottom:x.bottom-r.top,visible:getComputedStyle(b).visibility,opacity:getComputedStyle(b).opacity}})}}));
const overlap=await page.evaluate(()=>{
 const controls=[...document.querySelectorAll('.table-tools button')].filter(b=>b.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
 const texts=[...document.querySelectorAll('.tiptap p,.tiptap th,.tiptap td,.block-metadata,.caption')];
 const pairs=[];
 for(const b of controls){const r=b.getBoundingClientRect();for(const t of texts){if(t.contains(b))continue;const range=document.createRange();range.selectNodeContents(t);for(const q of range.getClientRects()){const w=Math.min(r.right,q.right)-Math.max(r.left,q.left),h=Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top);if(w>0&&h>0){const x=(Math.max(r.left,q.left)+Math.min(r.right,q.right))/2,y=(Math.max(r.top,q.top)+Math.min(r.bottom,q.bottom))/2,hit=document.elementFromPoint(x,y);pairs.push({button:b.getAttribute('aria-label'),text:t.textContent.slice(0,60),width:w,height:h,textReceivesPointer:!!hit&&t.contains(hit),buttonReceivesPointer:!!hit&&b.contains(hit)});}}}}
 return pairs;
});

 measurements.push({theme,width,mode,option,state,metrics,overlap});
 await page.locator('.tiptap:visible').screenshot({path:`tmp/table-spacing-1481/${theme}-${width}-${mode}-${option}-${state}.png`});
 await page.keyboard.press('Escape');
 }
 await style.evaluate(el=>el.remove());
 }
 }
 }
 return measurements;
}






