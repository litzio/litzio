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
  const bandEnds = scale => band(2).evaluate((path, scale) => {
    const host = path.closest('.linked-document-panes');
    const origin = host.getBoundingClientRect();
    const pane = host.querySelector('.linked-document-source');
    const preview = host.querySelector('.screen-document-view-scroll');
    const source = pane.querySelector('[data-linked-item="2"]').getBoundingClientRect();
    const block = preview.querySelectorAll('.tiptap > p')[1].getBoundingClientRect();
    const pad = host.querySelector('.linked-document-outline-measure').getBoundingClientRect();
    const left = pane.getBoundingClientRect(), right = preview.getBoundingClientRect();
    const sourceEdge = left.left + pane.clientLeft + pane.clientWidth;
    const documentEdge = right.left + preview.clientLeft;
    const sourceJoin = source.right + pad.width*scale, documentJoin = block.left - pad.width;
    const sourceTop = source.top - pad.height*scale, sourceBottom = source.bottom + pad.height*scale;
    const documentTop = block.top - pad.height, documentBottom = block.bottom + pad.height;
    const geometry = path.getAttribute('d');
    const commands = geometry.match(/[MCHVZ]/g).join('');
    if (commands !== 'MHCHVHCHZ') return false;
    const coordinates = geometry.match(/-?(?:\d*\.)?\d+/g).map(Number);
    const x = value => value-origin.left;
    const y = value => value-origin.top;
    const middle = x((left.right + right.left)/2);
    const expected = [
      x(sourceJoin), y(sourceTop), x(left.right),
      middle, y(sourceTop), middle, y(documentTop), x(right.left), y(documentTop),
      x(documentJoin), y(documentBottom), x(right.left),
      middle, y(documentBottom), middle, y(sourceBottom), x(left.right), y(sourceBottom), x(sourceJoin),
    ];
    return Math.abs(left.width-right.width) < 1 && sourceEdge-sourceJoin > 20 && documentEdge < documentJoin &&
      coordinates.length === expected.length && coordinates.every((value, index) => Math.abs(value-expected[index]) < 1);
  }, scale);
  const alignedEdges = () => fused.evaluate(path => {
    const host = path.closest('.linked-document-panes');
    const origin = host.getBoundingClientRect();
    const pane = host.querySelector('.linked-document-source');
    const preview = host.querySelector('.screen-document-view-scroll');
    const source = pane.querySelector('[data-linked-item="2"]');
    const box = source.getBoundingClientRect();
    const block = host.querySelectorAll('.tiptap > p')[1].getBoundingClientRect();
    const pad = host.querySelector('.linked-document-outline-measure').getBoundingClientRect();
    const scale = .75;
    const contains = (x,y) => path.isPointInFill(new DOMPoint(x-origin.left,y-origin.top));
    const aligned = (x,top,bottom) => contains(x,top+1) && contains(x,bottom-1) &&
      !contains(x,top-1) && !contains(x,bottom+1);
    const sourceJoin = box.right+pad.width*scale, documentJoin = block.left-pad.width;
    const sourceEdge = pane.getBoundingClientRect().left+pane.clientLeft+pane.clientWidth;
    const documentEdge = preview.getBoundingClientRect().left+preview.clientLeft;
    return [sourceJoin-2, (sourceJoin+sourceEdge)/2, sourceEdge-1].every(x =>
      aligned(x,box.top-pad.height*scale,box.bottom+pad.height*scale)) &&
      [documentJoin+2, (documentJoin+documentEdge)/2, documentEdge+1].every(x =>
        aligned(x,block.top-pad.height,block.bottom+pad.height));
  });
  const clipping = (requireHorizontal = false) => fused.evaluate((path, requireHorizontal) => {
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
    const clipsScrollbars = (pane, rect, needsHorizontal = false) => {
      const {x,y,width,height} = rect.getBBox();
      const vertical = pane.offsetWidth - 2*pane.clientTop - pane.clientWidth;
      const left = pane.clientLeft - pane.clientTop;
      const horizontal = pane.offsetHeight - 2*pane.clientTop - pane.clientHeight;
      return (!left || contains(x-left/2,y+height/2)) &&
        (vertical === left || contains(x+width+(vertical-left)/2,y+height/2)) &&
        (horizontal > 0 ? !contains(x+width/2,y+height+horizontal/2) : !needsHorizontal);
    };
    return paint.getAttribute('clip-rule') === 'evenodd' && matchesViewport(sourceClip,source) &&
      matchesViewport(documentClip,preview) && clipsScrollbars(source,sourceClip,requireHorizontal) && clipsScrollbars(preview,documentClip);
  }, requireHorizontal);
  await expect(band(2)).toHaveAttribute('data-emphasis','quiet');
  await expect(band(2)).toHaveCSS('stroke','none');
  const quietOpacity = await band(2).evaluate(path => Number(getComputedStyle(path).getPropertyValue('--opacity-linked-band-quiet')));
  await expect(band(2)).toHaveCSS('fill-opacity', String(quietOpacity));
  await expect.poll(() => bandEnds(1)).toBe(true);
  await expect(band(16)).toHaveCount(0);

  await linkedItem(2).hover();
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  await expect(band(2)).toHaveCSS('stroke','none');
  await expect(fused).toHaveCount(0);
  await expect.poll(() => bandEnds(1)).toBe(true);
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
  const gutterOf = () => band(2).evaluate(path => {
    const origin = path.ownerSVGElement.getBoundingClientRect();
    const d = path.getAttribute('d').match(/-?(?:\d*\.)?\d+/g).map(Number);
    return { x: origin.left+(d[2]+d[7])/2, y:origin.top+(d[1]+d[8]+d[10]+d[17])/4 };
  });
  const gutterPoint = await gutterOf();
  await page.mouse.move(gutterPoint.x,gutterPoint.y);
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  const sourceLead = await linkedItem(2).evaluate(button => {
    const pane = button.closest('.linked-document-source');
    const box = button.getBoundingClientRect();
    const edge = pane.getBoundingClientRect().left + pane.clientLeft + pane.clientWidth;
    return { x: (box.right + edge) / 2, y: (box.top + box.bottom) / 2 };
  });
  await page.mouse.move(sourceLead.x,sourceLead.y);
  await expect(band(2)).toHaveAttribute('data-emphasis','hover');
  await page.mouse.click(sourceLead.x,sourceLead.y);
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');
  await expect(band(2)).toHaveAttribute('data-emphasis','selected');
  await expect(fused).toBeVisible();
  await sourcePane.getByText('Source section 1', { exact: true }).click();
  await expect(linkedItem(1)).toHaveAttribute('aria-pressed','true');
  // Choosing a source box moves the document pair level with it; aim at the redrawn band.
  await expect.poll(() => bandEnds(1)).toBe(true);
  const movedGutter = await gutterOf();
  await page.mouse.click(movedGutter.x,movedGutter.y);
  await expect(linkedItem(2)).toHaveAttribute('aria-pressed','true');

  const scrollbar = await sourcePane.evaluate((pane, y) => {
    const box = pane.getBoundingClientRect();
    const track = box.left + pane.clientLeft + pane.clientWidth;
    const width = box.right - pane.clientTop - track;
    return { x: track + width / 2, y, width };
  }, sourceLead.y);
  expect(scrollbar.width).toBeGreaterThan(0);
  await expect.poll(() => fused.evaluate((path, point) => {
    const origin = path.ownerSVGElement.getBoundingClientRect();
    const local = new DOMPoint(point.x-origin.left, point.y-origin.top);
    const clip = group => document.getElementById(group.getAttribute('clip-path').slice(5,-1));
    const paint = clip(path.parentElement.parentElement).firstElementChild;
    const context = document.createElement('canvas').getContext('2d');
    return path.isPointInFill(local) &&
      [...clip(path.parentElement).children].some(rect => rect.isPointInFill(local)) &&
      context.isPointInPath(new Path2D(paint.getAttribute('d')),local.x,local.y,'evenodd');
  }, scrollbar)).toBe(true);
  await page.mouse.move(scrollbar.x,scrollbar.y);
  await page.mouse.down();
  await page.mouse.move(scrollbar.x,scrollbar.y+60,{steps: 4});
  await page.mouse.up();
  await expect.poll(() => sourcePane.evaluate(pane => pane.scrollTop)).toBeGreaterThan(0);
  await sourcePane.evaluate(pane => pane.scrollTo(0,0));

  await page.getByRole('button',{name:'Source scale 1',exact:true}).click();
  await expect.poll(() => bandEnds(.75)).toBe(true);
  await expect.poll(alignedEdges).toBe(true);
  await expect.poll(clipping).toBe(true);
  await sourcePane.evaluate(pane => { pane.firstElementChild.style.minWidth = `${pane.clientWidth + 64}px`; });
  await expect.poll(() => clipping(true)).toBe(true);
  await sourcePane.evaluate(pane => pane.firstElementChild.style.removeProperty('min-width'));
  await expect.poll(() => sourcePane.evaluate(pane => pane.scrollWidth === pane.clientWidth)).toBe(true);
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
    const overlap = new DOMPoint(first[7]-2,(first[8]+first[10])/2);
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
  // Set the partially clipped position exactly, regardless of native wheel granularity.
  await linkedItem(2).evaluate(node => node.closest('.linked-document-source').scrollTo(0,node.offsetTop+12));
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
  await sourcePane.evaluate(pane => pane.scrollTo(0,0));

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

  // Choosing a source box places its document pair at the same visible height (#1760).
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Source scale 0.75',exact:true}).click();
  await expect(bands.first()).toBeAttached();
  const sourceTop = id => linkedItem(id).evaluate(node => {
    const pane = node.closest('.linked-document-source');
    return node.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientTop;
  });
  const documentTop = id => linkedPreview.evaluate((view, index) => view.querySelectorAll('.tiptap > p')[index].getBoundingClientRect().top -
    view.getBoundingClientRect().top - view.clientTop, id - 1);
  const levelGap = async id => Math.abs(await sourceTop(id) - await documentTop(id));
  const showSource = (id, top) => linkedItem(id).evaluate((node, top) => node.closest('.linked-document-source').scrollTo(0, node.offsetTop - top), top);
  const documentScroll = () => linkedPreview.evaluate(view => ({ top: view.scrollTop, end: view.scrollHeight - view.clientHeight, height: view.clientHeight }));
  await linkedPreview.evaluate(view => view.scrollTo(0, 0));
  await showSource(15, 120);
  expect(await documentTop(15)).toBeGreaterThan((await documentScroll()).height);
  await linkedItem(15).click();
  await expect.poll(() => levelGap(15)).toBeLessThan(1);
  await showSource(8, 100);
  expect(await documentTop(8)).toBeLessThan(0);
  await linkedItem(8).click();
  await expect.poll(() => levelGap(8)).toBeLessThan(1);
  await showSource(10, 300);
  const insideTop = await documentTop(10);
  expect(insideTop).toBeGreaterThan(0);
  expect(insideTop).toBeLessThan((await documentScroll()).height);
  expect(await levelGap(10)).toBeGreaterThan(8);
  await linkedItem(10).click();
  await expect(linkedItem(10)).toHaveAttribute('aria-pressed','true');
  await expect.poll(() => levelGap(10)).toBeLessThan(1);
  await expect(fused).toBeVisible();
  if (screenshots) {
    await page.getByRole('button',{name:'Light',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await page.screenshot({path:'tmp/linked-document-view/after-1440-light-level.png'});
  }
  // A difference within 8px does not move the document.
  const settled = (await documentScroll()).top;
  await sourcePane.evaluate(pane => { pane.scrollTop += 5; });
  await linkedItem(10).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await documentScroll()).top).toBe(settled);
  // After the user scrolls the document, choosing the same box again (a new request) realigns it.
  await linkedPreview.hover();
  await page.mouse.wheel(0,200);
  await expect.poll(() => levelGap(10)).toBeGreaterThan(8);
  await linkedItem(10).click();
  await expect.poll(() => levelGap(10)).toBeLessThan(1);
  // The document end limits the movement; the source is extended so its last box can reach the top.
  const sourceContent = await sourcePane.evaluate(pane => {
    const content = pane.firstElementChild, height = content.style.height;
    content.style.height = `${content.offsetHeight + 2000}px`;
    return height;
  });
  await showSource(24, 16);
  await linkedItem(24).click();
  await expect.poll(async () => {
    const view = await documentScroll();
    return Math.abs(view.top - view.end) < 1 && await documentTop(24) > await sourceTop(24) + 8;
  }).toBe(true);
  // While held, the placement follows viewport height changes; user scrolling releases it.
  const fillToggle = page.getByRole('button',{name:'Fill available height',exact:true});
  await fillToggle.click();
  await expect.poll(async () => (await documentScroll()).height).toBeGreaterThan(480);
  await expect.poll(async () => { const view = await documentScroll(); return Math.abs(view.top - view.end) < 1; }).toBe(true);
  await page.setViewportSize({width:1440,height:700});
  await expect.poll(async () => {
    const view = await documentScroll(), top = await documentTop(24);
    return view.height < 480 && Math.abs(view.top - view.end) < 1 && top >= 0 && top < view.height;
  }).toBe(true);
  await page.setViewportSize({width:1440,height:1000});
  await expect.poll(async () => (await documentScroll()).height).toBeGreaterThan(480);
  await linkedPreview.hover();
  await page.mouse.wheel(0,-200);
  await expect.poll(async () => { const view = await documentScroll(); return view.end - view.top; }).toBeGreaterThan(100);
  const released = (await documentScroll()).top;
  await page.setViewportSize({width:1440,height:700});
  await expect.poll(async () => (await documentScroll()).height).toBeLessThan(480);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await documentScroll()).top).toBe(released);
  await page.setViewportSize({width:1440,height:1000});
  await fillToggle.click();
  await expect.poll(async () => (await documentScroll()).height).toBeLessThanOrEqual(480);
  await sourcePane.evaluate((pane, height) => { pane.firstElementChild.style.height = height; }, sourceContent);
  // Source scale 0.75 keeps the same visible-pixel contract.
  await page.getByRole('button',{name:'Source scale 1',exact:true}).click();
  await showSource(12, 200);
  await linkedItem(12).click();
  await expect.poll(() => levelGap(12)).toBeLessThan(1);
  await sourcePane.evaluate(pane => pane.scrollTo(0,0));
  await linkedPreview.evaluate(view => view.scrollTo(0,0));

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
