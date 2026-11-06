async (page, {openPath, expect}) => {
  await page.setViewportSize({width:1440,height:900});
  const origin=page.url().split('/').slice(0,3).join('/');
  const loaded=await (await page.request.get(origin+'/api/document')).json();
  const sep=loaded.path.includes('\\')?'\\':'/';
  const root=loaded.path.split(sep).slice(0,-4).join(sep);
  await openPath(page,[root,'tmp','outline','outline.md'].join(sep));
  await openPath(page,[root,'tmp','read-view','other.md'].join(sep));
  const overlay=await page.locator('.document-scroll-frame').count()>0;
  const results=[];
  for(const width of [1440,1424,1423,640]) for(const theme of ['light','dark']) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({theme,width})=>{localStorage.setItem('litzio.theme',theme);localStorage.setItem('litzio.uiLanguage',width===640?'ko':'en');},{theme,width});
    await page.reload();
    for(const [kind,name] of [['long','outline.md'],['short','other.md']]) {
      await page.getByRole('tab',{name,exact:true}).click();
      await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      await page.mouse.move(0,0);
      const geometry=await page.evaluate(()=>{
        const viewport=document.querySelector('.document-scroll[data-active="true"]');
        const rect=node=>{const {x,y,width,height}=node.getBoundingClientRect();return {x,y,width,height};};
        const track=viewport.closest('.document-scroll-frame')?.querySelector('.document-scrollbar');
        return {gutter:viewport.offsetWidth-viewport.clientWidth,overflow:viewport.scrollHeight>viewport.clientHeight,
          column:rect(viewport.querySelector('.document-column')),paper:rect(viewport.querySelector('.document')),
          header:rect(document.querySelector('.app-header')),panel:rect(document.querySelector('.document-panel')),
          track:track?rect(track):null,thumb:track?rect(track.firstElementChild):null};
      });
      const path=`tmp/scrollbar-overlay-capture/${overlay?'after':'before'}-${width}-${theme}-${kind}.png`;
      await page.screenshot({path});
      results.push({width,theme,kind,path,...geometry});
    }
  }
  return {overlay,results,userAgent:await page.evaluate(()=>navigator.userAgent)};
}
