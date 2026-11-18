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
  const fused = page.locator('.linked-document-fused-fill');
  const alignedEdges = () => fused.evaluate(path => {
    const host = path.closest('.linked-document-panes');
    const origin = host.getBoundingClientRect();
    const pane = host.querySelector('.linked-document-source');
    const source = pane.querySelector('[data-linked-item="2"]');
    const box = source.getBoundingClientRect();
    const block = host.querySelectorAll('.tiptap > p')[1].getBoundingClientRect();
    const pad = host.querySelector('.linked-document-outline-measure').getBoundingClientRect();
    const scale = .75;
    const contains = (x,y) => path.isPointInFill(new DOMPoint(x-origin.left,y-origin.top));
    const aligned = (x,top,bottom) => contains(x,top+1) && contains(x,bottom-1) &&
      !contains(x,top-1) && !contains(x,bottom+1);
    return aligned(box.right+pad.width*scale-2,box.top-pad.height*scale,box.bottom+pad.height*scale) &&
      aligned(block.left-pad.width+2,block.top-pad.height,block.bottom+pad.height);
  });
  const clipping = () => fused.evaluate(path => {
    const host = path.closest('.linked-document-panes');
    const source = host.querySelector('.linked-document-source');
    const preview = host.querySelector('.screen-document-view-scroll');
    const clip = group => document.getElementById(group.getAttribute('clip-path').slice(5,-1));
    const [sourceClip,,documentClip] = clip(path.parentElement).children;
    const paint = clip(path.parentElement.parentElement).firstElementChild;
    const canvas = path.ownerSVGElement.getBoundingClientRect();
    const matchesViewport = (rect, pane) => {
      const box = pane.getBoundingClientRect();
      const {x,y,width,height} = rect.getBBox();
      return Math.abs(x + canvas.left - box.left - pane.clientLeft) < 1 &&
        Math.abs(y + canvas.top - box.top - pane.clientTop) < 1 &&
        width === pane.clientWidth && height === pane.clientHeight;
    };
    const outline = new Path2D(paint.getAttribute('d'));
    const context = document.createElement('canvas').getContext('2d');
    const contains = (x,y) => context.isPointInPath(outline,x,y,'evenodd');
    const excludesScrollbars = (pane, rect) => {
      const {x,y,width,height} = rect.getBBox();
      const vertical = pane.offsetWidth - 2*pane.clientTop - pane.clientWidth;
      const left = pane.clientLeft - pane.clientTop;
      const horizontal = pane.offsetHeight - 2*pane.clientTop - pane.clientHeight;
      return (!left || !contains(x-left/2,y+height/2)) &&
        (vertical === left || !contains(x+width+(vertical-left)/2,y+height/2)) &&
        (!horizontal || !contains(x+width/2,y+height+horizontal/2));
    };
    return paint.getAttribute('clip-rule') === 'evenodd' && matchesViewport(sourceClip,source) &&
      matchesViewport(documentClip,preview) && excludesScrollbars(source,sourceClip) && excludesScrollbars(preview,documentClip);
  });
  await expect(band(2)).toHaveAttribute('data-emphasis','quiet');
  await expect(band(2)).toHaveCSS('stroke','none');
  const quietOpacity = await band(2).evaluate(path => Number(getComputedStyle(path).getPropertyValue('--opacity-linked-band-quiet')));
  await expect(band(2)).toHaveCSS('fill-opacity', String(quietOpacity));
  await expect(band(16)).toHaveCount(0);

  await linkedItem(2).hover();
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  await expect(band(2)).toHaveCSS('stroke','none');
  await expect(fused).toHaveCount(0);
  await sourcePane.focus();
  await page.keyboard.press('Tab');
  await expect(linkedItem(1)).toBeFocused();
  await expect(band(1)).toHaveAttribute('data-emphasis','hover');
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');

  await linkedPreview.locator('.tiptap > p').nth(1).hover();
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  await linkedPreview.focus();
  const matchingAction = linkedPreview.getByRole('button',{name:'Source section 1',exact:true});
  await page.keyboard.press('Tab');
  await expect(matchingAction).toBeFocused();
  await expect(band(1)).toHaveAttribute('data-emphasis','hover');
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
  await expect(fused).toBeVisible();

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
  await expect.poll(alignedEdges).toBe(true);
  await expect.poll(clipping).toBe(true);
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

  const branchToggle = page.getByRole('button',{name:'Source branches',exact:true});
  await branchToggle.click();
  await expect(band(2)).toHaveCount(2);
  await expect(band('2-detail')).toHaveCount(1);
  await expect(band('2-detail')).toHaveCSS('visibility','hidden');
  await expect(fused).toHaveCount(1);
  const selectedOpacity = await fused.evaluate(path => Number(getComputedStyle(path).getPropertyValue('--opacity-linked-band-selected')));
  await expect(fused).toHaveCSS('fill-opacity',String(selectedOpacity));
  await expect.poll(() => fused.evaluate(path => {
    const host = path.closest('.linked-document-panes');
    const branches = [...host.querySelectorAll('[data-testid="linked-document-band"]')].filter(band =>
      ['2','2-detail'].includes(band.dataset.id));
    const first = branches[0].getAttribute('d').match(/-?(?:\d*\.)?\d+/g).map(Number);
    const overlap = new DOMPoint(first[6]-2,(first[7]+first[9])/2);
    const border = path.nextElementSibling;
    const inner = document.getElementById(border.getAttribute('mask').slice(5,-1)).lastElementChild;
    return branches.length === 3 && branches.every(band => band.isPointInFill(overlap) &&
      getComputedStyle(band).visibility === 'hidden') && path.isPointInFill(overlap) && inner.isPointInFill(overlap);
  })).toBe(true);
  const captureThemes = async state => {
    for (const theme of ['light','dark']) {
      await page.getByRole('button',{name:theme==='light'?'Light':'Dark',exact:true}).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await page.screenshot({path:`tmp/linked-document-view/after-1440-${theme}-${state}.png`});
    }
  };
  if (screenshots) await captureThemes('branches');
  await branchToggle.click();
  await sourcePane.hover();
  const scrollIntoBox = await linkedItem(2).evaluate(node => node.offsetTop+12);
  await page.mouse.wheel(0,scrollIntoBox);
  await expect.poll(() => band(2).evaluate(path => {
    const host = path.closest('.linked-document-panes');
    const pane = host.querySelector('.linked-document-source');
    const source = pane.querySelector('[data-linked-item="2"]').getBoundingClientRect();
    const viewportTop = pane.getBoundingClientRect().top + pane.clientTop;
    const start = path.getPointAtLength(0);
    const fill = host.querySelector('.linked-document-fused-fill');
    return source.top < viewportTop && source.bottom > viewportTop &&
      Math.abs(start.y + host.getBoundingClientRect().top - viewportTop) < 1 &&
      fill?.isPointInFill(new DOMPoint(start.x+2,start.y+1)) &&
      !fill.isPointInFill(new DOMPoint(start.x+2,start.y-1));
  })).toBe(true);
  await expect.poll(clipping).toBe(true);
  if (screenshots) await captureThemes('clipped');
  await sourcePane.hover();
  await page.mouse.wheel(0,-scrollIntoBox);

  await linkedPreview.locator('.tiptap > p').first().click();
  await expect(linkedItem(1)).toHaveAttribute('aria-pressed','true');
  await linkedItem(2).focus();
  await page.keyboard.press('Space');
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');
  await linkedPreview.focus();
  await page.keyboard.press('Tab');
  await expect(matchingAction).toBeFocused();
  await expect(matchingAction).toHaveCSS('opacity','1');
  await page.keyboard.press('Enter');
  await expect(linkedItem(1)).toHaveAttribute('aria-pressed','true');

  await linkedPreview.hover();
  await page.mouse.wheel(0,400);
  await expect(band(1)).toHaveAttribute('data-direction','document-above');
  await expect(fused).toHaveCount(0);
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
  await linkedItem(2).click();
  await linkedPreview.hover();
  await page.mouse.wheel(0,-400);
  await expect(fused).toBeVisible();
  await expect.poll(clipping).toBe(true);
  await page.setViewportSize({width:1440,height:700});
  await expect.poll(async () => {
    const geometry = await fillGeometry();
    return geometry.fitted && Math.abs(geometry.source - geometry.view) < 2 && geometry.view < 480;
  }).toBe(true);
  await expect.poll(alignedEdges).toBe(true);
  await expect.poll(clipping).toBe(true);
  await expect(band(9)).toHaveCount(0);
  await page.setViewportSize({width:1440,height:1000});
  await expect(band(9)).toBeAttached();
  await page.setViewportSize({width:640,height:700});
  await expect.poll(async () => {
    const geometry = await fillGeometry();
    return geometry.fitted && geometry.stacked && Math.abs(geometry.source - geometry.view) < 2 &&
      geometry.source > 0 && geometry.view > 0;
  }).toBe(true);
  await expect(fused).toHaveCount(0);
  await fill.click();

  await page.setViewportSize({width:640,height:1000});
  await expect(page.getByText('Widen the window to compare side by side.')).toBeVisible();
  await expect(bands).toHaveCount(0);
  await linkedItem(2).click();
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.linked-document-outline[data-side="source"]')).toBeVisible();
  await expect(page.locator('.linked-document-outline[data-side="document"]')).toBeVisible();
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
    await linkedItem(2).click();
    await expect(fused).toBeVisible();
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
