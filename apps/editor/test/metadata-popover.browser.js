// #1626: native held clicks across actual render/decode, plus common corner/keyboard ownership.
async(page,{openPath,expect,waitForExplorerLayout})=>{
  await page.route('**/src/mermaid-render.ts*',async route=>{
    const response=await route.fetch({headers:{...route.request().headers(),Connection:'close'}});
    await route.fulfill({response,body:await response.text()+`\n
      const metadataRender=renderMermaid;
      renderMermaid=async(...args)=>{const result=await metadataRender(...args);
        if(window.__holdMetadata){window.__metadataHeld=true;await new Promise(r=>window.__metadataReleases.push(r));}
        return result;
      };`});
  });
  const initial=await(await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close'}})).json();
  const sep=initial.path.includes('\\')?'\\':'/';const root=initial.path.split(sep).slice(0,-4).join(sep);
  const active=page.locator('[data-document-tab][data-active=true]');
  const open=async name=>openPath(page,[root,'tmp','metadata-popover',name].join(sep));
  const place=async(target,side)=>{
    await target.scrollIntoViewIfNeeded();
    await target.evaluate((el,side)=>{const r=el.getBoundingClientRect();el.closest('.document-scroll').scrollTop+=side==='bottom'?r.top-140:r.bottom-1340;},side);
  };
  const begin=async target=>{await target.hover({position:{x:4,y:4}});await target.getByRole('button',{name:'Edit figure'}).click();};
  const outcomes=[];
  await open('cold.md');
  for(const width of [1440,640]){
    await page.setViewportSize({width,height:1400});await waitForExplorerLayout(page);
    for(const kind of ['mermaid','image'])for(const side of ['bottom','top'])for(const action of ['media','done']){
      const target=active.locator(kind==='mermaid'?'[data-content-kind="mermaid"]':'figure:not([data-content-kind="mermaid"])').first();
      const id=kind==='mermaid'?'mermaid-property':'figure';const popup=page.getByTestId(`${id}-properties`);
      if(kind==='mermaid'){
        await target.scrollIntoViewIfNeeded();await expect(target.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');
        await target.getByTestId('mermaid-preview').locator('img').evaluate(img=>img.decode());
      }
      let releaseImage, imageReady;
      const imageHeld=new Promise(resolve=>imageReady=resolve);
      const token=`${width}-${side}-${action}`;
      if(kind==='image'){
        // Give the newly created thumbnail a cold URL before its first src assignment.
        // Otherwise the body image's decoded cache can make this experiment vacuous.
        // Only the ephemeral asset request changes; SVG bytes and document stay intact.
        await target.locator('img').first().evaluate(img=>img.decode());
        await page.route('**/*metadata-cold=*',async route=>{
          const response=await route.fetch({headers:{...route.request().headers(),Connection:'close'}});await new Promise(resolve=>{releaseImage=resolve;imageReady();});await route.fulfill({response});
        });
        await page.evaluate(token=>{
          const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src'),setAttribute=Element.prototype.setAttribute;
          const cold=value=>{if(!String(value).includes('/portrait.svg'))return value;const url=new URL(value,location.href);url.searchParams.set('metadata-cold',token);return url.href;};
          Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){descriptor.set.call(this,cold(value));}});
          Element.prototype.setAttribute=function(name,value){return setAttribute.call(this,name,this instanceof HTMLImageElement&&name==='src'?cold(value):value);};
          window.__restoreThumbnail=()=>{Object.defineProperty(HTMLImageElement.prototype,'src',descriptor);Element.prototype.setAttribute=setAttribute;};
        },token);
      }else await page.evaluate(()=>{window.__holdMetadata=true;window.__metadataHeld=false;window.__metadataReleases=[];});
      try{
        await place(target,side);await begin(target);await expect(popup).toHaveAttribute('data-side',side);
        if(kind==='mermaid')await page.waitForFunction(()=>window.__metadataHeld);else await imageHeld;
        if(kind==='image')expect(await popup.locator('.figure-property-thumbnail img').evaluate(img=>img.naturalWidth)).toBe(0);
        const button=popup.getByTestId(action==='done'?`${id}-apply`:kind==='mermaid'?'mermaid-edit-source':'figure-replace');
        const buttonId=await button.getAttribute('data-testid');
        const before=await button.boundingBox();
        await page.evaluate(()=>{window.__metadataClick=null;window.__metadataClickListener=event=>{window.__metadataClick=event.target.closest('button')?.dataset.testid;};document.addEventListener('click',window.__metadataClickListener,true);});
        await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();
        if(kind==='mermaid')await page.evaluate(()=>{window.__holdMetadata=false;for(const r of window.__metadataReleases.splice(0))r();});else releaseImage();
        const preview=popup.locator('.figure-property-thumbnail img');
        if(kind==='mermaid')await expect(popup.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');
        await preview.evaluate(img=>img.decode());
        const after=await button.boundingBox(), afterSide=await popup.getAttribute('data-side');
        await page.mouse.up();
        const clicked=await page.evaluate(()=>window.__metadataClick)===buttonId;
        if(clicked){
          if(action==='done')await expect(popup).toHaveCount(0);
          else if(kind==='mermaid')await expect(active.getByTestId('mermaid-source')).toHaveCount(1);
          else await expect(popup.getByTestId('figure-image-url')).toBeVisible();
        }
        outcomes.push({width,kind,side,action,clicked,buttonStable:Math.abs(before.y-after.y)<=1&&Math.abs(before.x-after.x)<=1,sideStable:afterSide===side,before,after});
      }finally{
        await page.mouse.up();releaseImage?.();
        await page.evaluate(()=>{window.__restoreThumbnail?.();window.__restoreThumbnail=undefined;window.__holdMetadata=false;for(const r of window.__metadataReleases??[])r();if(window.__metadataClickListener)document.removeEventListener('click',window.__metadataClickListener,true);});
        if(kind==='image')await page.unroute('**/*metadata-cold=*');
        if(await active.getByTestId('mermaid-source').count())await active.getByTestId('mermaid-cancel').click();
        else if(await popup.count())await popup.locator('form').press('Escape');
      }
    }
  }
  expect(outcomes.every(r=>r.clicked&&r.buttonStable&&r.sideStable),JSON.stringify(outcomes)).toBe(true);
  await open('properties.md');
  const kinds=[['figure','figure:not([data-content-kind="mermaid"])','figure-label','Edit figure'],['mermaid-property','[data-content-kind="mermaid"]','mermaid-property-label','Edit figure'],['table','[data-block="table"]','table-label','Edit table'],['equation-property','[data-block="equation"]','equation-property-label','Edit'],['label-target','[data-block="label-target"]','label-target-input',null]];
  for(const width of [1440,640]){
    await page.setViewportSize({width,height:1400});await waitForExplorerLayout(page);
    for(const[id,selector,fieldId,buttonName]of kinds){
      const target=active.locator(selector).first();await target.scrollIntoViewIfNeeded();
      const move=side=>target.evaluate((el,{side,id})=>{const block=id==='label-target'?el.closest('.node-labelTarget').nextElementSibling:el,r=block.getBoundingClientRect();el.closest('.document-scroll').scrollTop+=side==='bottom'?r.top-140:r.bottom-1340;},{side,id});
      await move('bottom');
      if(buttonName){await target.hover({position:{x:4,y:4}});await target.getByRole('button',{name:buttonName,exact:true}).click();}
      else{await target.getByTestId('label-target-edit').focus();await target.getByTestId('label-target-edit').press('Enter');}
      const popup=page.getByTestId(`${id}-properties`),field=page.getByTestId(fieldId);
      await expect(popup).toHaveAttribute('data-side','bottom');
      const original=await field.inputValue();await field.fill(`${original}-focus`);await field.press('Home');
      for(let i=0;i<3;i++)await field.press('Shift+ArrowRight');
      await field.evaluate(el=>window.__metadataField=el);
      await move('top');await expect(popup).toHaveAttribute('data-side','top');
      await expect(field).toBeFocused();await expect(field).toHaveValue(`${original}-focus`);
      expect(await field.evaluate(el=>({same:el===window.__metadataField,start:el.selectionStart,end:el.selectionEnd}))).toEqual({same:true,start:0,end:3});
      if(id==='table'&&width===1440){
        await page.setViewportSize({width,height:1800});await expect(popup).toHaveAttribute('data-side','bottom');
        await expect(field).toBeFocused();expect(await field.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,3]);
        await page.setViewportSize({width,height:1400});await expect(popup).toHaveAttribute('data-side','top');
        await expect(field).toBeFocused();
      }
      const geometry=await popup.evaluate(async el=>{
        const{documentContentBounds}=await import('/src/document-scroll.ts');
        const viewport=document.querySelector('[data-document-tab][data-active=true] .document-editor').closest('.document-scroll');
        const b=documentContentBounds(viewport),r=el.getBoundingClientRect();
        return{bounds:b,rect:{x:r.x,y:r.y,width:r.width,height:r.height},parent:el.parentElement.getAttribute('style'),focus:(()=>{const input=el.querySelector('input:focus'),body=el.querySelector('.metadata-property-body');if(!input)return null;const f=input.getBoundingClientRect(),s=body.getBoundingClientRect(),ring=Math.max(0,...[...getComputedStyle(input).boxShadow.matchAll(/(-?[\d.]+)px/g)].map(m=>Math.abs(Number(m[1]))));return{left:f.left-s.left,right:s.right-f.right,ring};})()};
      });
      expect(geometry.focus.left,JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.focus.ring);
      expect(geometry.focus.right,JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.focus.ring);
      expect(geometry.rect.x,JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.bounds.x);
      expect(geometry.rect.x+geometry.rect.width,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.bounds.x+geometry.bounds.width);
      expect(geometry.rect.y,JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.bounds.y);
      expect(geometry.rect.y+geometry.rect.height,JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.bounds.y+geometry.bounds.height);
      await move('bottom');await expect(popup).toHaveAttribute('data-side','bottom');await expect(field).toBeFocused();
      expect(await field.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,3]);
      // Native Tab follows the visual/DOM order; no positive tabindex or custom tab loop.
      const stops=popup.locator('button:enabled,input:enabled,summary').filter({visible:true});
      const elements=await stops.all();await elements[0].focus();
      for(const next of elements.slice(1)){await page.keyboard.press('Tab');await expect(next).toBeFocused();}
      await field.fill(original);await field.press('Enter');await expect(popup).toHaveCount(0);
      await expect(active.locator('.document-editor')).toBeFocused();
    }
  }
  // A pending paragraph fits below here, but the maximum intrinsic thumbnail does
  // not. Choose above before completing it; the completion must not flip the side.
  await open('cold.md');await page.setViewportSize({width:640,height:1400});await waitForExplorerLayout(page);
  const diagram=active.locator('[data-content-kind="mermaid"]');
  await place(diagram,'bottom');await begin(diagram);
  const diagramPopup=page.getByTestId('mermaid-property-properties');
  await expect(diagramPopup.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');
  await diagramPopup.locator('img').evaluate(img=>img.decode());
  const fullHeight=await diagramPopup.evaluate(el=>el.getBoundingClientRect().height);
  await diagramPopup.locator('form').press('Escape');
  await diagram.evaluate((el,height)=>{const r=el.getBoundingClientRect(),viewport=el.closest('.document-scroll'),b=viewport.getBoundingClientRect();viewport.scrollTop+=r.bottom-(b.bottom-height+24-9);},fullHeight);
  await page.evaluate(()=>{window.__holdMetadata=true;window.__metadataHeld=false;window.__metadataReleases=[];});
  try{
    await begin(diagram);await page.waitForFunction(()=>window.__metadataHeld);
    await expect(diagramPopup).toHaveAttribute('data-side','top');
    const pendingHeight=await diagramPopup.evaluate(el=>el.getBoundingClientRect().height);
    expect(pendingHeight).toBeLessThan(fullHeight-24);
    const button=diagramPopup.getByTestId('mermaid-edit-source'),r=await button.boundingBox();
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
    await page.evaluate(()=>{window.__holdMetadata=false;for(const r of window.__metadataReleases.splice(0))r();});
    await expect(diagramPopup.getByTestId('mermaid-preview')).toHaveAttribute('aria-busy','false');await diagramPopup.locator('img').evaluate(img=>img.decode());
    await expect(diagramPopup).toHaveAttribute('data-side','top');await page.mouse.up();
    await expect(active.getByTestId('mermaid-source')).toHaveCount(1);await active.getByTestId('mermaid-cancel').click();
  }finally{await page.mouse.up();await page.evaluate(()=>{window.__holdMetadata=false;for(const r of window.__metadataReleases??[])r();});}
  // Height-constrained Advanced and a long real validation error must scroll only
  // the body, leaving both actions available on either side.
  await open('properties.md');await page.setViewportSize({width:640,height:600});await waitForExplorerLayout(page);
  for(const side of ['bottom','top']){
    const image=active.locator('figure:not([data-content-kind="mermaid"])').first();await image.scrollIntoViewIfNeeded();
    await image.evaluate((el,side)=>{const r=el.getBoundingClientRect();el.closest('.document-scroll').scrollTop+=side==='bottom'?r.top-100:r.bottom-540;},side);
    await begin(image);const popup=page.getByTestId('figure-properties');await expect(popup).toHaveAttribute('data-side',side);
    await popup.locator('summary').click();const label=popup.getByTestId('figure-label');await label.fill('invalid label '.repeat(20));
    const done=popup.getByTestId('figure-apply'),before=await done.boundingBox();await done.click();
    await expect(label).toHaveAttribute('aria-invalid','true');await expect(done).toBeEnabled();
    expect((await done.boundingBox()).y).toBeCloseTo(before.y,0);
    const body=popup.locator('.metadata-property-body');expect(await body.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    await body.evaluate(el=>el.scrollTop=el.scrollHeight);await expect(done).toBeInViewport();await expect(popup.getByTestId('figure-replace')).toBeInViewport();
    const r=await popup.boundingBox();expect(r.y).toBeGreaterThanOrEqual(72);expect(r.y+r.height).toBeLessThanOrEqual(600);
    await popup.locator('form').press('Escape');
  }
  // Native keyboard group navigation does not apply the metadata draft. The
  // shared boundary must follow the retained owner into a split group and back.
  await page.setViewportSize({width:1440,height:1400});await waitForExplorerLayout(page);
  const image=active.locator('figure:not([data-content-kind="mermaid"])').first();await place(image,'bottom');await begin(image);
  const label=page.getByTestId('figure-label');await label.fill('group-placement-draft');await label.evaluate(el=>window.__metadataField=el);
  const ownerId=await active.getAttribute('data-document-tab'),tab=page.locator(`#tab-${ownerId}`);
  await tab.focus();await tab.press('Shift+F10');await page.getByRole('menuitem',{name:'Open to the right',exact:true}).press('Enter');
  await expect(page.locator('[data-editor-group]')).toHaveCount(2);
  await expect(label).toHaveValue('group-placement-draft');expect(await label.evaluate(el=>el===window.__metadataField)).toBe(true);
  const popup=page.getByTestId('figure-properties');
  const fits=()=>popup.evaluate(async(el,ownerId)=>{const{documentContentBounds}=await import('/src/document-scroll.ts');const b=documentContentBounds(document.querySelector(`[data-document-tab="${ownerId}"]`)),r=el.getBoundingClientRect();return r.left>=b.x&&r.right<=b.x+b.width&&r.top>=b.y&&r.bottom<=b.y+b.height;},ownerId);
  await expect.poll(fits).toBe(true);await label.focus();
  await page.setViewportSize({width:640,height:1400});await expect(page.locator('[data-editor-group]')).toHaveCount(1);
  await expect(label).toHaveValue('group-placement-draft');await expect.poll(fits).toBe(true);
  await popup.locator('form').press('Escape');
  // Actual first/last document blocks, without room supplied by following prose.
  for(const width of [1440,640])for(const edge of ['first','last']){
    await page.setViewportSize({width,height:700});await waitForExplorerLayout(page);await open(`${edge}.md`);
    const target=active.locator('figure').first();await target.scrollIntoViewIfNeeded();
    await target.evaluate((el,edge)=>{const viewport=el.closest('.document-scroll');viewport.scrollTop=edge==='first'?0:viewport.scrollHeight;},edge);
    await begin(target);const popup=page.getByTestId(edge==='first'?'mermaid-property-properties':'figure-properties');
    await expect(popup).toBeVisible();
    await expect.poll(()=>popup.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=72&&r.bottom<=700&&r.left>=0&&r.right<=innerWidth;})).toBe(true);
    await expect(popup.locator('.form-actions button').last()).toBeInViewport();await popup.locator('form').press('Escape');
  }
  return outcomes;
}
