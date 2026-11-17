// Shared correspondence bands through the registered screen component and synthetic gallery.
// pnpm browser:test linked-document-view [--screenshots]
async (page, { expect, screenshots }) => {
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/ui-gallery');
  const navigation = page.getByRole('navigation', {name:'Gallery elements'});
  await page.setViewportSize({width:1440,height:1000});
  await navigation.getByRole('button', {name:'Linked document view', exact:true}).click();
  const sourcePane = page.getByRole('region', {name:'Source material', exact:true});
  const linkedPreview = page.getByRole('region', {name:'Document preview content', exact:true});
  const linkedItem = id => sourcePane.getByRole('button', {name:`Source section ${id}`, exact:true});
  const bands = page.getByTestId('linked-document-band');
  const band = id => bands.and(page.locator(`[data-id="${id}"]`));
  await expect(band(2)).toHaveAttribute('data-emphasis','quiet');
  await expect(band(2)).toHaveCSS('stroke','none');
  await expect(band(2)).toHaveCSS('fill-opacity','0.025');
  await expect(band(16)).toHaveCount(0);

  await linkedItem(2).hover();
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  await linkedPreview.locator('.tiptap > p').nth(1).hover();
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  if (screenshots) {
    await page.getByRole('button',{name:'Light',exact:true}).click();
    await linkedItem(2).hover();
    await expect(band(2)).toHaveAttribute('data-emphasis','hover');
    await page.screenshot({path:'tmp/linked-document-view/after-1440-light-hover.png'});
  }
  const gutterPoint = await band(2).evaluate(path => {
    const box = path.closest('.linked-document-panes').getBoundingClientRect();
    const d = path.getAttribute('d').match(/-?(?:\d*\.)?\d+/g).map(Number);
    return { x: box.left+(d[0]+d[6])/2, y:box.top+(d[1]+d[7]+d[9]+d[15])/4 };
  });
  await page.mouse.move(gutterPoint.x,gutterPoint.y);
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  await page.mouse.click(gutterPoint.x,gutterPoint.y);
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');
  await expect(band(2)).toHaveAttribute('data-emphasis','selected');

  await page.getByRole('button',{name:'Source scale 1',exact:true}).click();
  await expect.poll(() => band(2).evaluate(path => {
    const host = path.closest('.linked-document-panes');
    const origin = host.getBoundingClientRect();
    const source = host.querySelector('.linked-document-source [data-linked-item="2"]').getBoundingClientRect();
    const block = host.querySelectorAll('.tiptap > p')[1].getBoundingClientRect();
    const pad = host.querySelector('.linked-document-outline-measure').getBoundingClientRect();
    const d = path.getAttribute('d').match(/-?(?:\d*\.)?\d+/g).map(Number);
    return Math.max(...[
      origin.left+d[0]-(source.right+pad.width*.75),
      origin.top+d[1]-(source.top-pad.height*.75),
      origin.top+d[15]-(source.bottom+pad.height*.75),
      origin.left+d[6]-(block.left-pad.width),
      origin.top+d[7]-(block.top-pad.height),
      origin.top+d[9]-(block.bottom+pad.height),
    ].map(Math.abs));
  })).toBeLessThan(1);
  if (screenshots) {
    await page.getByRole('button',{name:'Light',exact:true}).click();
    await expect(band(2)).toHaveAttribute('data-emphasis','selected');
    await page.screenshot({path:'tmp/linked-document-view/after-1440-light-selected.png'});
    await page.getByRole('button',{name:'Dark',exact:true}).click();
    await page.screenshot({path:'tmp/linked-document-view/after-1440-dark-selected.png'});
    await linkedItem(3).hover();
    await expect(band(3)).toHaveAttribute('data-emphasis','hover');
    await page.screenshot({path:'tmp/linked-document-view/after-1440-dark-hover.png'});
  }

  await linkedPreview.locator('.tiptap > p').first().click();
  await expect(linkedItem(1)).toHaveAttribute('aria-pressed','true');
  await linkedItem(2).focus();
  await page.keyboard.press('Space');
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');
  await linkedPreview.focus();
  const matchingAction = linkedPreview.getByRole('button',{name:'Source section 1',exact:true});
  await page.keyboard.press('Tab');
  await expect(matchingAction).toBeFocused();
  await expect(matchingAction).toHaveCSS('opacity','1');
  await page.keyboard.press('Enter');
  await expect(linkedItem(1)).toHaveAttribute('aria-pressed','true');

  await linkedPreview.hover();
  await page.mouse.wheel(0,400);
  await expect(band(1)).toHaveAttribute('data-direction','document-above');
  await expect(band(2)).toHaveCount(0);
  if (screenshots) {
    await page.getByRole('button',{name:'Dark',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(bands.and(page.locator('[data-emphasis="hover"]'))).toHaveCount(0);
    await page.screenshot({path:'tmp/linked-document-view/after-1440-dark-offscreen.png'});
    await page.getByRole('button',{name:'Light',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await page.screenshot({path:'tmp/linked-document-view/after-1440-light-offscreen.png'});
  }
  await page.getByRole('button',{name:'Use another revision',exact:true}).click();
  await expect(bands).toHaveCount(0);
  await expect(linkedPreview.getByRole('button',{name:'Source section 1',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Use another revision',exact:true}).click();
  await expect(band(1)).toHaveAttribute('data-direction','document-above');

  const fill = page.getByRole('button',{name:'Fill available height',exact:true});
  const fillGeometry = () => linkedPreview.evaluate(node => {
    const panes = node.closest('.linked-document-panes');
    const source = panes.querySelector('.linked-document-source').getBoundingClientRect();
    const view = node.getBoundingClientRect();
    const bottom = panes.closest('.screen-layout').getBoundingClientRect().bottom;
    return { source: source.height, view: view.height, fitted: Math.abs(view.bottom - bottom) < 2,
      stacked: source.bottom <= view.top };
  });
  await fill.click();
  await expect.poll(async () => {
    const geometry = await fillGeometry();
    return geometry.fitted && Math.abs(geometry.source - geometry.view) < 2 && geometry.view > 480;
  }).toBe(true);
  await expect(band(9)).toBeAttached();
  await page.setViewportSize({width:1440,height:700});
  await expect.poll(async () => {
    const geometry = await fillGeometry();
    return geometry.fitted && Math.abs(geometry.source - geometry.view) < 2 && geometry.view < 480;
  }).toBe(true);
  await expect(band(9)).toHaveCount(0);
  await page.setViewportSize({width:1440,height:1000});
  await expect(band(9)).toBeAttached();
  await page.setViewportSize({width:640,height:700});
  await expect.poll(async () => {
    const geometry = await fillGeometry();
    return geometry.fitted && geometry.stacked && Math.abs(geometry.source - geometry.view) < 2 &&
      geometry.source > 0 && geometry.view > 0;
  }).toBe(true);
  await fill.click();

  await page.setViewportSize({width:640,height:1000});
  await expect(page.getByText('Widen the window to compare side by side.')).toBeVisible();
  await expect(bands).toHaveCount(0);
  await linkedItem(2).click();
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');
  expect(await linkedPreview.evaluate(node=> {
    const source = node.closest('.linked-document-panes').querySelector('.linked-document-source');
    return source.getBoundingClientRect().bottom <= node.getBoundingClientRect().top &&
      source.scrollWidth <= source.clientWidth + 1 && node.scrollWidth <= node.clientWidth + 1;
  })).toBe(true);

  if (screenshots) {
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'1,200 blocks',exact:true}).click();
    await expect(linkedPreview.locator('.tiptap > p')).toHaveCount(1200);
    await expect(band(2)).toBeAttached();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('Long Tasks API unavailable');
      const durations = [];
      const observer = new PerformanceObserver(list => durations.push(...list.getEntries().map(entry => entry.duration)));
      observer.observe({type:'longtask'});
      window.linkedBandPerformance = { observer, durations };
    });
    // Run two independent, continuous wheel sweeps after the entire synthetic document has rendered.
    for (const pane of [sourcePane, linkedPreview]) {
      await pane.hover();
      for (let step = 0; step < 12; step++) await page.mouse.wheel(0,180);
    }
    const measurements = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const { observer, durations } = window.linkedBandPerformance;
      durations.push(...observer.takeRecords().map(entry => entry.duration));
      observer.disconnect();
      return { longTasksMs:durations, sourceTop:document.querySelector('.linked-document-source').scrollTop,
        documentTop:document.querySelector('.screen-document-view-scroll').scrollTop,
        visibleBands:document.querySelectorAll('[data-testid="linked-document-band"]').length };
    });
    expect(measurements.sourceTop).toBeGreaterThan(0);
    expect(measurements.documentTop).toBeGreaterThan(0);
    expect(measurements.visibleBands).toBeGreaterThan(0);
    expect(measurements.longTasksMs.filter(duration => duration > 50), JSON.stringify(measurements)).toEqual([]);

    await page.evaluate(()=>localStorage.setItem('litzio.uiLanguage','ko'));
    await page.reload();
    await page.setViewportSize({width:640,height:1340});
    await navigation.getByRole('button',{name:'Linked document view',exact:true}).click();
    await expect(page.getByText('나란히 비교하려면 창을 넓히세요.')).toBeVisible();
    const original = page.getByRole('region',{name:'원본 자료',exact:true});
    await expect(page.getByRole('region',{name:'문서 미리 보기 content',exact:true}).locator('.tiptap > p')).toHaveCount(24);
    await original.getByRole('button',{name:'원본 구역 2',exact:true}).click();
    await expect(original.getByRole('button',{name:'원본 구역 2',exact:true})).toHaveAttribute('aria-pressed','true');
    for (const theme of ['light','dark']) {
      await page.getByRole('button',{name:theme==='light'?'Light':'Dark',exact:true}).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await page.screenshot({path:`tmp/linked-document-view/after-640-ko-${theme}.png`});
    }
    await page.evaluate(()=>localStorage.removeItem('litzio.uiLanguage'));
    return { sampleBlocks: 1200, ...measurements };
  }
}
