async (page,{expect,openFolderPicker,pluginFixture})=>{
 const {root}=pluginFixture.spike;
 await page.setViewportSize({width:1440,height:1000});
 await openFolderPicker(page);await page.getByTestId('folder-path').fill(root);await page.getByTestId('folder-open').click();await expect(page.getByTestId('folder-path')).not.toBeVisible();
 await page.getByRole('button',{name:'Collapse Explorer',exact:true}).click();
 const jobs=async()=>{await page.keyboard.press('Control+Slash');await page.getByRole('combobox').fill('> Plugin jobs');await page.getByRole('option',{name:'Plugin jobs',exact:true}).click();};
 await jobs();await page.getByRole('button',{name:'Open comparison',exact:true}).click();
 const review=page.getByTestId('review-view');await expect(review.locator('.spike-page')).toHaveCount(11);
 await expect(review.getByAltText('Source page 1')).toBeVisible();
 expect(await review.locator('.spike-pages img').count()).toBeLessThan(11);
 const region=review.locator('.review-region:not([disabled])').filter({hasText:'section_header'}).first();await region.click();await expect(review.locator('.review-highlights > div')).toHaveCount(1);await expect(review.locator('.spike-connectors line')).toHaveCount(1);
 expect(await review.locator('[contenteditable=true]').count()).toBe(0);
 await review.screenshot({path:'spike/compare/nist-1440.png'});
 await review.getByRole('button',{name:'Scroll sync off'}).click();
 await review.locator('.spike-pages').hover();await page.mouse.wheel(0,1600);
 await expect.poll(()=>review.locator('.review-read').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 const oldSource=await review.locator('.spike-pages').evaluate(e=>e.scrollTop);await review.locator('.review-read').hover();await page.mouse.wheel(0,300);await expect.poll(()=>review.locator('.spike-pages').evaluate(e=>e.scrollTop)).toBeGreaterThan(oldSource);await review.getByRole('button',{name:'Scroll sync on'}).click();const before=await review.locator('.review-read').evaluate(e=>e.scrollTop);await review.locator('.spike-pages').hover();await page.mouse.wheel(0,800);await expect.poll(()=>review.locator('.spike-pages').evaluate(e=>e.scrollTop)).toBeGreaterThan(1600);expect(await review.locator('.review-read').evaluate(e=>e.scrollTop)).toBe(before);
 // NIST figure and table correspondence: actual image regions, not synthetic boxes.
 for(const [n,kind] of [[2,'picture'],[5,'table']]) {
   await review.locator(`[data-page="${n}"]`).scrollIntoViewIfNeeded();
   const area=review.locator(`[data-page="${n}"]`).getByRole('button',{name:new RegExp('^'+kind+' ·')}).first();
   await expect(area).toBeVisible();await expect(review.getByAltText(`Source page ${n}`)).toBeVisible();await expect.poll(()=>review.getByAltText(`Source page ${n}`).evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);await area.click();await expect.poll(()=>review.locator('.review-highlights > div').count()).toBeGreaterThan(0);
   await review.screenshot({path:`spike/compare/nist-${kind}-1440.png`});
 }
 // Reopening the same bundle focuses its one tab; close then open reads Host material again.
 await jobs();await page.getByRole('button',{name:'Open comparison',exact:true}).click();await expect(page.getByRole('tab',{name:/^NIST comparison/})).toHaveCount(1);
 await page.getByRole('button',{name:'Close NIST comparison',exact:true}).click();await jobs();await page.getByRole('button',{name:'Open comparison',exact:true}).click();await expect(review.getByAltText('Source page 1')).toBeVisible();
 // Read callback on actual Core blocks jumps across the source page list.
 const last=review.locator('.review-read p').last();await last.scrollIntoViewIfNeeded();await last.click();await expect.poll(()=>review.locator('.spike-pages').evaluate(e=>e.scrollTop)).toBeGreaterThan(1000);
 for(const kind of ['source','document']) await pluginFixture.spikeStale(kind,async()=>{await review.getByRole('button',{name:'Refresh data',exact:true}).click();await expect(review.getByText('Data is out of date. Refresh data to navigate or apply changes.',{exact:true})).toBeVisible();expect(await review.locator('.review-region:not([disabled])').count()).toBe(0);});
 await review.getByRole('button',{name:'Refresh data',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('litzio.uiLanguage','ko');localStorage.setItem('litzio.theme','dark');});await page.reload();
 await page.keyboard.press('Control+Slash');await page.getByRole('combobox').fill('> 플러그인 작업');await page.getByRole('option',{name:'플러그인 작업',exact:true}).click();await page.getByRole('button',{name:'Open comparison',exact:true}).click();await page.setViewportSize({width:640,height:900});await expect(page.getByTestId('review-view')).toBeVisible();await expect(page.getByTestId('review-view').getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'spike/compare/nist-640-ko-dark.png',mask:[page.locator('.sidebar-host-account')]});
}
