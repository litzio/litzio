// Browser-only risks: real Read callbacks, overlay geometry, explicit actions and read-after-write.
async (page, { expect, screenshots }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/test/fixtures/review-ui/index.html');
  await page.getByRole('button', {name:'Generated comparison',exact:true}).click();
  await expect(page.locator('.review-page img').first()).toBeVisible();
  await expect(page.getByText('Data unavailable.',{exact:true})).toBeHidden();
  await expect(page.getByTestId('opening-reads')).toHaveText('1');
  await expect(page.locator('.review-source-sheet')).toHaveCount(200);
  // Page geometry is present, but image requests must remain local to the viewport.
  await expect(page.locator('[data-page-no="200"] img')).toHaveCount(0);
  // One compact command row; narrow prose wraps while the wide table scrolls locally.
  const toolbar = page.locator('.review-compare-toolbar');
  const checkNarrowLayout = async width => {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>document.fonts.ready);
    await expect.poll(()=>page.locator('.review-read').evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThan(2);
    await expect.poll(()=>toolbar.evaluate(element=>{
      const height=element.querySelector('button').getBoundingClientRect().height;
      return element.getBoundingClientRect().height/(height+parseFloat(getComputedStyle(element).rowGap));
    })).toBeLessThanOrEqual(width===640 ? 2:1);
    if (width===640) await expect(page.getByText('Wide window advised',{exact:true})).toBeVisible();
    else await expect(page.getByText('Wide window advised',{exact:true})).toBeHidden();
    const text = page.locator('.review-read .paragraph').first();
    expect(await text.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThan(2);
    if (width===640) {
      await expect.poll(()=>page.locator('.review-read .table-scroll').evaluate(element=>element.scrollWidth-element.clientWidth)).toBeGreaterThan(0);
      // The fixture reserves the real narrow Explorer width, not an empty full-width tab.
      const typography = await page.locator('.review-read').evaluate(element=>{
        const heading=element.querySelector('h1.heading'),second=element.querySelector('h2.heading'),body=element.querySelector('.paragraph');
        const fragments=(root,text)=>{
          const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
          while (node=walker.nextNode()) {
            const start=node.textContent.indexOf(text);if (start<0) continue;
            const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+text.length);return range.getClientRects().length;
          }
          return Infinity;
        };
        return {body:parseFloat(getComputedStyle(body).fontSize),h1:parseFloat(getComputedStyle(heading).fontSize),h2:parseFloat(getComputedStyle(second).fontSize),words:['Conversion','acceptance'].map(word=>fragments(heading,word)),phrase:fragments(body,'Conversion acceptance retains'),longToken:fragments(body,'https://example.test/verylongunbrokentokenfornarrowcomparisonpanels'),readingWidth:element.clientWidth,sourceWidth:document.querySelector('.review-source').clientWidth};
      });
      expect(typography.words).toEqual([1,1]);
      expect(typography.phrase).toBe(1);
      expect(typography.longToken).toBeGreaterThan(1);
      expect(typography.h1).toBeLessThanOrEqual(typography.body*1.5);
      expect(typography.h1).toBeGreaterThan(typography.h2);
      expect(typography.h2).toBeGreaterThan(typography.body);
      expect(typography.readingWidth).toBeGreaterThan(typography.sourceWidth);
    }
    const paragraph = page.getByRole('button',{name:'Sentence · Supported',exact:true});
    await paragraph.click();
    await expect.poll(()=>page.locator('.review-wires path[data-selected="true"]').evaluateAll(paths=>{
      const target=document.querySelector('.review-read .paragraph').getBoundingClientRect();
      if (!paths.length) return Infinity;
      const path=paths[0],point=path.getPointAtLength(path.getTotalLength()),actual=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());
      return Math.max(Math.abs(actual.x-target.left),Math.abs(actual.y-target.top-Math.min(target.height/2,24)));
    })).toBeLessThan(2);
  };
  await checkNarrowLayout(640);
  await checkNarrowLayout(1440);
  // At high zoom, horizontal panning must keep the visible image's region controls.
  const zoomEarly = page.getByRole('combobox',{name:'Source zoom',exact:true});
  await zoomEarly.fill('400%'); await zoomEarly.press('Enter');
  await page.locator('.review-page-scroll').evaluate(element=>{element.scrollLeft=element.scrollWidth-element.clientWidth;});
  const pannedRegion = page.getByRole('button',{name:'Sentence · Supported',exact:true});
  await expect(pannedRegion).toBeVisible();
  await expect.poll(()=>page.locator('.review-wires path[data-selected="true"]').evaluateAll(paths=>{
    const region=document.querySelector('[data-page-no="1"] [data-region-id="text"]');
    if (!paths.length || !region) return Infinity;
    const box=region.getBoundingClientRect(),path=paths[0],point=path.getPointAtLength(0),actual=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());
    return Math.max(Math.abs(actual.x-box.right),Math.abs(actual.y-box.top-box.height/2));
  })).toBeLessThan(2);
  await zoomEarly.fill('Page width'); await zoomEarly.press('Enter');
  const progressCount = page.getByLabel('0 of 200 pages checked',{exact:true});
  await toolbar.getByRole('spinbutton').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(progressCount).toBeFocused();
  await expect(page.getByText('0 of 200 pages checked',{exact:true})).toBeVisible();
  await toolbar.getByRole('spinbutton').focus();
  await page.getByRole('button',{name:'Page 1: Page checked',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Saving review progress');
  const sourceScroll = page.locator('.review-page-scroll');
  await sourceScroll.hover();
  await page.mouse.wheel(0,4000);
  await expect.poll(()=>sourceScroll.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('[data-page-no="1"] img')).toHaveCount(0);
  await expect(page.locator('[data-page-no="200"] img')).toHaveCount(0);


  await expect(page.locator('.review-image-loading')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Saving review progress');
  await page.getByRole('button',{name:'Complete progress',exact:true}).click();
  await expect(page.getByRole('status')).toBeHidden();
  const readScroll = page.locator('.review-read');
  const middlePage = page.getByRole('spinbutton',{name:'Go to page',exact:true});
  await middlePage.fill('80'); await middlePage.press('Enter');
  await expect.poll(()=>readScroll.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  const beforeReverse = await sourceScroll.evaluate(e=>e.scrollTop);
  await readScroll.hover(); await page.mouse.wheel(0,300);
  await expect.poll(()=>sourceScroll.evaluate(e=>e.scrollTop)).toBeGreaterThan(beforeReverse);
  await page.getByRole('button',{name:'Sync scrolling',exact:true}).click();
  const readingTop = await readScroll.evaluate(e=>e.scrollTop);
  const sourceTop = await sourceScroll.evaluate(e=>e.scrollTop);
  await sourceScroll.hover(); await page.mouse.wheel(0,300);
  await expect.poll(()=>sourceScroll.evaluate(e=>e.scrollTop)).toBeGreaterThan(sourceTop);
  expect(await readScroll.evaluate(e=>e.scrollTop)).toBe(readingTop);
  await expect(page.getByRole('button',{name:'Previous page',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Next page',exact:true})).toHaveCount(0);
  const pageNumber = page.getByRole('spinbutton',{name:'Go to page',exact:true});
  await pageNumber.fill('100'); await pageNumber.press('Enter');
  await expect(page.locator('[data-page-no="100"] img')).toBeVisible();
  await expect(page.locator('[data-page-no="200"] img')).toHaveCount(0);

  const zoom = page.getByRole('combobox',{name:'Source zoom',exact:true});
  const anchor = () => sourceScroll.evaluate(element=>{
    const page=element.querySelector('[data-page-no="100"] .review-page').getBoundingClientRect();
    return (element.getBoundingClientRect().top+80-page.top)/page.height;
  });
  const beforeZoom = await anchor();
  await expect(page.getByTestId('page-100-reads')).toHaveText('1');
  for (const percent of ['50%','200%','10','500','67.5']) {
    await zoom.fill(percent); await zoom.press('Enter');
    const expected = Math.min(400,Math.max(25,Number(percent.replace('%',''))));
    await expect(zoom).toHaveValue(`${expected}%`);
    await expect.poll(()=>page.locator('[data-page-no="100"] .review-page').evaluate(element=>element.getBoundingClientRect().width)).toBeCloseTo(600*expected/100,0);
    await expect.poll(()=>anchor().then(value=>Math.abs(value-beforeZoom))).toBeLessThan(.01);
    await expect(page.getByTestId('page-100-reads')).toHaveText('1');
  }
  const browserWidth = await page.evaluate(()=>innerWidth);
  await sourceScroll.hover(); await page.keyboard.down('Control');
  try { await page.mouse.wheel(0,-100); } finally { await page.keyboard.up('Control'); }
  await expect(zoom).toHaveValue('77.5%');
  expect(await page.evaluate(()=>innerWidth)).toBe(browserWidth);
  await expect.poll(()=>anchor().then(value=>Math.abs(value-beforeZoom))).toBeLessThan(.01);
  await sourceScroll.hover(); await page.keyboard.down('Control');
  try { await page.mouse.wheel(0,100); } finally { await page.keyboard.up('Control'); }
  await expect(zoom).toHaveValue('67.5%');
  await zoom.fill('Page width'); await zoom.press('Enter');
  await expect.poll(()=>anchor().then(value=>Math.abs(value-beforeZoom))).toBeLessThan(.01);
  await expect(page.getByTestId('page-100-reads')).toHaveText('1');

  if (screenshots) {
    await pageNumber.fill('1'); await pageNumber.press('Enter');
    for (const width of [1440,640]) for (const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1000});
      await page.locator('html').evaluate((element,theme)=>{element.dataset.theme=theme;},theme);
      const unknown = page.getByRole('button',{name:'Unknown region · Unsupported · Unsupported content',exact:true});
      await expect(unknown).toBeVisible(); await unknown.click(); await unknown.focus();
      if (width === 640) { await page.mouse.move(0,0); await unknown.hover(); await expect(page.getByText('Unknown region · Unsupported · Unsupported content · No matching content.',{exact:true})).toBeVisible(); }
      await expect(unknown).toHaveAttribute('data-kind','unmapped');
      await expect(page.getByText('No matching content.',{exact:true})).toBeVisible();
      await page.screenshot({path:`docs/design/assets/review-compare-1435/unmapped-${width}-${theme}.png`});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('html').evaluate(element=>{element.dataset.theme='light';});
  }

  await page.reload();
  const source = page.getByRole('region', { name: 'Source page' });
  const region = page.getByRole('button', { name: 'Sentence · Supported', exact: true });
  await expect(source.getByRole('img')).toBeVisible();
  await expect(region).toBeVisible();
  if (screenshots) {
    await page.getByRole('button', { name: 'host-stale', exact: true }).click();
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(source.getByRole('img')).toHaveAttribute('alt', 'Source page 2');
    await page.screenshot({ path: 'tmp/review-readonly-1440.png', fullPage: true });
    await page.locator('html').evaluate(e => { e.dataset.theme = 'dark'; e.lang = 'ko'; });
    await page.screenshot({ path: 'tmp/review-readonly-dark-1440.png', fullPage: true });
    await page.setViewportSize({ width: 640, height: 900 });
    await expect(page.getByText('Widen the window to compare.', { exact: false })).toBeVisible();
    await page.screenshot({ path: 'tmp/review-readonly-dark-640.png', fullPage: true });
    return;
  }
  const imageBox = await source.getByRole('img').boundingBox(), regionBox = await region.boundingBox();
  expect(Math.abs((regionBox.x-imageBox.x)/imageBox.width - 45/600)).toBeLessThan(.01);
  expect(Math.abs((regionBox.y-imageBox.y)/imageBox.height - 130/800)).toBeLessThan(.01);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(source.getByRole('img')).toHaveAttribute('alt', 'Source page 2');
  const bottomImage = await source.getByRole('img').boundingBox(), bottomRegion = await region.boundingBox();
  expect(Math.abs((bottomRegion.y-bottomImage.y)/bottomImage.height - 130/800)).toBeLessThan(.01);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomImage = await source.getByRole('img').boundingBox(), zoomRegion = await region.boundingBox();
  expect(Math.abs(zoomRegion.width/zoomImage.width - 505/600)).toBeLessThan(.01);
  await page.getByRole('button', { name: 'Fit to width', exact: true }).click();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(source.getByRole('img')).toHaveAttribute('alt', 'Source page 1');
  const read = page.locator('.review-read');
  await page.getByRole('button',{name:'Refresh data',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh data',exact:true})).toBeEnabled();
  await expect.poll(()=>read.evaluate(el=>{
    const headings=[...el.querySelectorAll('.tiptap h1,.tiptap h2,.tiptap h3,.tiptap h4,.tiptap h5,.tiptap h6')],cues=[...el.querySelectorAll('.heading-level')];
    if (headings.length !== cues.length) return Infinity;
    return Math.max(...headings.map((heading,index)=>Math.abs(heading.getBoundingClientRect().top+parseFloat(getComputedStyle(heading).lineHeight)/2-cues[index].getBoundingClientRect().top-cues[index].getBoundingClientRect().height/2)));
  })).toBeLessThan(2);

  await region.click();
  await expect(region).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.review-highlights > div')).toHaveCount(1);
  await expect(page.locator('.review-wires path')).toHaveCount(2);
  await expect(page.locator('.review-wires path[data-selected="false"]')).toHaveCount(1);
  const correspondence = page.locator('.review-wires path[data-selected="true"]');
  const textColor = await region.evaluate(el=>getComputedStyle(el).borderColor);
  const headingColor = await page.getByRole('button',{name:'Heading · Supported',exact:true}).evaluate(el=>getComputedStyle(el).borderColor);
  expect(textColor).not.toBe(headingColor);
  await expect(page.getByRole('button',{name:'Divider · Decoration',exact:true})).toHaveAttribute('data-kind','unmapped');
  const checkWire = async () => {
    await expect(correspondence).toHaveCount(1);
    await expect.poll(async()=>{
      const point = await correspondence.evaluate(path=>{const p=path.getPointAtLength(0);const value=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());return {x:value.x,y:value.y};});
      const box=await region.boundingBox();
      return Math.max(Math.abs(point.x-box.x-box.width),Math.abs(point.y-box.y-box.height/2));
    }).toBeLessThan(2);
  };
  await checkWire();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect(correspondence).toHaveCount(0); // The selected region's right edge is outside the source viewport.
  await page.getByRole('button',{name:'Fit to width',exact:true}).click();
  await checkWire();
  await page.setViewportSize({width:1200,height:1000});
  await checkWire();
  await page.setViewportSize({width:1440,height:1000});
  await checkWire();

  const sourceViewport=page.locator('.review-page-scroll');
  const sourceStart=await sourceViewport.evaluate(element=>element.scrollTop);
  await sourceViewport.hover(); await page.mouse.wheel(0,100);
  await expect.poll(()=>sourceViewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(sourceStart);
  await checkWire();
  await page.mouse.wheel(0,-100);
  await expect.poll(()=>sourceViewport.evaluate(element=>element.scrollTop)).toBe(sourceStart);
  await checkWire();
  const previousScroll = await read.evaluate(e => e.scrollTop);
  await region.click();
  expect(await read.evaluate(e => e.scrollTop)).toBe(previousScroll);
  await page.getByRole('button', { name: 'Divider · Decoration' }).click();
  await expect(page.getByText('No matching content.', { exact: false })).toBeVisible();
  await read.locator('.document-editor p').first().click();
  await expect(region).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await expect(page.getByText('Actions: 0')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Changes' })).not.toContainText('text.replace');
  await expect(page.getByRole('region', { name: 'Change details' })).toContainText('Target: 검토할 문장입니다.');
  const labelBox = await region.locator('span').boundingBox(), selectedBox = await region.boundingBox();
  expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(selectedBox.y);
  const proseFont = await read.locator('.document-editor p').first().evaluate(e => {
    const s = getComputedStyle(e); return [s.fontFamily, s.fontSize, s.letterSpacing, s.lineHeight];
  });
  expect(await page.locator('.review-before-after .review-value').first().evaluate(e => {
    const s = getComputedStyle(e); return [s.fontFamily, s.fontSize, s.letterSpacing, s.lineHeight];
  })).toEqual(proseFont);
  const undoReason = page.getByText('There is no applied change to undo.', { exact: true });
  await expect(undoReason).toHaveCount(0);
  const undoTrigger = page.getByLabel('Undo unavailable', { exact: true });
  await page.mouse.move(0, 0);
  await undoTrigger.hover();
  await expect(undoReason).toHaveText('There is no applied change to undo.');
  await page.mouse.move(0, 0);
  await expect(undoReason).toHaveCount(0);
  await page.getByRole('button', { name: 'Reject', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(undoTrigger).toBeFocused();
  await expect(undoReason).toHaveText('There is no applied change to undo.');
  await page.getByRole('button', { name: 'Approve', exact: true }).focus();
  await expect(undoReason).toHaveCount(0);
  if (screenshots) await page.screenshot({ path: 'tmp/review-v5-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(read.getByText('정정된 문장입니다.', { exact: true })).toBeVisible();
  await expect(page.getByText('Correspondence unavailable.', { exact: false })).toBeVisible();
  await expect(region).toBeDisabled();
  await read.locator('.document-editor p').first().click();
  await expect(page.locator('.review-highlights > div')).toHaveCount(0);
  if (screenshots) await page.screenshot({ path: 'tmp/review-mapless-undo-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(read.getByText('검토할 문장입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'no-map', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'host-stale', exact: true }).click();
  await expect(region).toBeEnabled();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(region).toBeDisabled();
  await expect(page.getByText('Data is out of date.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled();
  await expect(region).toBeDisabled();
  await page.getByRole('button', { name: 'stale', exact: true }).click();
  await expect(page.getByText('Data is out of date.', { exact: false })).toBeVisible();
  await expect(region).toBeDisabled();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'unavailable', exact: true }).click();
  await expect(page.getByText('Data unavailable.')).toBeVisible();
  await page.getByRole('button', { name: 'no-image', exact: true }).click();
  await expect(page.getByText('No image available.', { exact: false })).toBeVisible();
  // Fallback advice stays outside region coordinates in standalone and compare panels.
  await page.getByRole('button', { name: 'Mixed layout', exact: true }).click();
  const sourcesWithoutImages = page.getByRole('region', { name: 'Source page', exact: true });
  await expect(sourcesWithoutImages).toHaveCount(2);
  for (const source of await sourcesWithoutImages.all()) {
    const notice = source.getByText('No image available. Showing regions only.', { exact: true });
    await expect(notice).toBeVisible();
    await expect.poll(async () => {
      const message = await notice.boundingBox();
      const canvas = await source.locator('.review-page').boundingBox();
      return !!message && !!canvas && message.y + message.height <= canvas.y;
    }).toBe(true);
    await expect(source.getByRole('button', { name: 'Sentence · Supported', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Default layout', exact: true }).click();
  await page.getByRole('button', { name: 'no-undo', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'hold', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Refreshing data…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Complete refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.getByText('Widen the window to compare.', { exact: false })).toBeVisible();
  await expect(read).toHaveCount(0);
  if (screenshots) await page.screenshot({ path: 'tmp/review-v5-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Missing/incomplete mappings disable only correspondence, while current proposals remain actionable.
  for (const mode of ['no-map', 'continuation']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('button', { name: /Change 1/ }).click();
    await expect(region).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
    await read.locator('.document-editor p').first().click();
    await expect(page.locator('.review-highlights > div')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(read.getByText('검토할 문장입니다.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  }
  // Reject also succeeds with an incomplete mapping, without applying the proposed text.
  await page.getByRole('button', { name: 'normal', exact: true }).click();
  await page.getByRole('button', { name: 'continuation', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Change details' })).toContainText('Rejected');
  await expect(read.getByText('검토할 문장입니다.', { exact: true })).toBeVisible();
  // Separating map availability must not bypass baseline or target validation.
  for (const mode of ['stale-baseline', 'stale-target']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('button', { name: /Change 1/ }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  }
  // V1 allows arbitrary typed kinds, but the UI must never expose their JSON structure.
  await page.getByRole('button', { name: 'typed-object', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  const before = page.locator('.review-before-after .review-value').first();
  await expect(before.locator('dt')).toHaveText(['Title', 'Count', 'Date', 'Enabled']);
  await expect(before.locator('dd')).toHaveText(['Original title', '1,250', 'Nov 6, 2026', 'No']);
  if (screenshots) await page.screenshot({ path: 'tmp/review-v5-typed-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'typed-array', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(before.getByRole('listitem')).toHaveText(['First item', '1,250', 'Yes', 'No value']);
  await page.getByRole('button', { name: 'typed-unsupported', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.locator('.review-value')).toHaveText(['Structured content preview unavailable.', 'Structured content preview unavailable.']);
  await expect(page.getByRole('region', { name: 'Change details' })).not.toContainText('internal_key');
  // List and detail are independent declarations; only a declared detail can show actions.
  await page.getByRole('button', { name: 'List only', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.locator('.review-panels > section > h3')).toHaveText(['List alone']);
  await expect(page.getByRole('region', { name: 'Change details' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Detail only', exact: true }).click();
  await expect(page.locator('.review-panels > section > h3')).toHaveText(['Detail alone']);
  await expect(page.getByRole('navigation', { name: 'Changes' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Change details' })).toBeVisible();
  await page.getByRole('button', { name: 'normal', exact: true }).click();
  await expect(page.getByText('Select a change to view its details.')).toBeVisible();
  await page.getByRole('button', { name: 'Mixed layout', exact: true }).click();
  await expect(page.locator('.review-panels > section > h3')).toHaveText(['First: changes', 'Second: page', 'Third: details', 'Fourth: compare']);
  await expect(page.getByRole('region', { name: 'Second: page', exact: true }).getByRole('img')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fourth: compare', exact: true }).getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.getByRole('region', { name: 'Third: details', exact: true }).getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Repeated panels', exact: true }).click();
  await expect(page.locator('.review-panels > section > h3')).toHaveText(['First page', 'Second page']);
  const firstRegion = page.getByRole('region', { name: 'First page', exact: true }).getByRole('button', { name: 'Sentence · Supported', exact: true });
  await firstRegion.click();
  await expect(firstRegion).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Second page', exact: true }).getByRole('button', { name: 'Sentence · Supported', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Default layout', exact: true }).click();
  await page.getByRole('button', { name: 'no-pages', exact: true }).click();
  await expect(page.getByText('No source pages available.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Change 1/ }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'uncertain', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  const actionCount = Number((await page.getByText(/^Actions:/).innerText()).split(':')[1]);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Outcome unknown.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  const requestNotice = await page.getByText('Outcome unknown.', { exact: false }).innerText();
  await page.getByRole('button', { name: 'Check request status', exact: true }).click();
  await expect(page.getByText('Outcome unknown.', { exact: false })).toHaveText(requestNotice);
  await expect(page.getByText(/^Actions:/)).toHaveText(`Actions: ${actionCount + 1}`);
  await expect(page.getByText(/^Status checks:/)).toHaveText('Status checks: 1');
  for (const label of ['Other tab', 'Reopen tab', 'Reload client']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText('Outcome unknown.', { exact: false })).toHaveText(requestNotice);
    await page.getByRole('button', { name: /Change 1/ }).click();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expect(page.getByText(/^Actions:/)).toHaveText(`Actions: ${actionCount + 1}`);
  }

  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Resolve request', exact: true }).click();
  await page.getByRole('button', { name: 'Check request status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.getByText(/^Actions:/)).toHaveText(`Actions: ${actionCount + 1}`);

  await page.getByRole('button', { name: 'unverifiable', exact: true }).click();
  await page.getByRole('button', { name: /Change 1/ }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Check request status', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Status checks cannot resolve this outcome. Do not repeat this change.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check request status', exact: true })).toHaveCount(0);
  const resultDocument = page.getByRole('button', { name: 'Open result document', exact: true });
  await page.mouse.move(0, 0);
  await resultDocument.hover();
  await expect(page.getByText('Status checks cannot resolve this outcome. Do not repeat this change. Open the result document and inspect it.', { exact: true })).toBeVisible();
  const statusCount = await page.getByText(/^Status checks:/).innerText();
  await resultDocument.click();
  await expect(page).toHaveTitle('Opened result');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await expect(page.getByText(/^Status checks:/)).toHaveText(statusCount);

}
