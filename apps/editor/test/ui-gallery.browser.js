// Protect the development entry's lazy module/CSS/provider connection, not primitive internals.
// pnpm browser:test ui-gallery
async (page, { expect, screenshots }) => {
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/ui-gallery');
  await expect(page.getByRole('heading', { name: 'Litzio UI gallery' })).toBeVisible();
  await expect(page.locator('[data-testid="ui-gallery"]')).toHaveCSS('overflow-y', 'auto');
  const navigation = page.getByRole('navigation', { name: 'Gallery elements' });
  await expect(navigation.getByRole('button', {name:'Controls',exact:true})).toHaveAttribute('aria-current','page');
  await navigation.getByRole('button',{name:'Surfaces',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Button · Input · icons',exact:true})).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Open dialog', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Example dialog' });
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await navigation.getByRole('button',{name:'Controls',exact:true}).click();
  // ChoiceGroup owns required-single state; buttons retain native Tab/Enter/Space.
  const choices = page.getByRole('group', { name: 'Example numbering', exact: true });
  const automatic = choices.getByRole('button', { name: 'Automatic', exact: true });
  const fixed = choices.getByRole('button', { name: 'Fixed', exact: true });
  await automatic.focus();
  await page.keyboard.press('Tab');
  await expect(fixed).toBeFocused();
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(fixed).toHaveAttribute('aria-pressed', 'true');
  await expect(automatic).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(fixed).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Example state', exact: true }).getByRole('button', { name: 'Disabled', exact: true }).click();
  await expect(automatic).toBeDisabled();
  await expect(fixed).toBeDisabled();
  await page.getByRole('group', { name: 'Example state', exact: true }).getByRole('button', { name: 'Default', exact: true }).click();
  await navigation.getByRole('button',{name:'Screen parts',exact:true}).click();
  if (screenshots) for (const width of [1440,640]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
    await page.getByRole("heading",{name:"Screen parts",exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-${width}-${theme}.png`});
    await page.getByRole("figure",{name:"Long time labels",exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-long-${width}-${theme}.png`});
    await page.getByRole("table").scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-table-${width}-${theme}.png`});
  }
  const cards = page.locator('.screen-summary');
  const boxes = await cards.evaluateAll(nodes => nodes.map(n => ({height:n.getBoundingClientRect().height, label:n.firstElementChild.getBoundingClientRect().top,value:n.querySelector('strong').getBoundingClientRect().top})));
  expect(boxes[0]).toEqual(boxes[1]);
  for (const width of [1440,640]) {
  await page.setViewportSize({width,height:1000});
  const ticks = page.getByRole('figure',{name:'Long time labels',exact:true}).locator('text').filter({hasText:'2026-11-13T00:'});
  await expect(ticks.first()).toContainText('2026-11-13T00:00:00Z');
  await expect(ticks.last()).toContainText('2026-11-13T00:59:00Z');
  await expect.poll(async () => {
    const box = await page.getByRole('figure',{name:'Long time labels',exact:true}).boundingBox();
    const last = await ticks.last().boundingBox();
    return last.x + last.width <= box.x + box.width;
  }).toBe(true);
  const bounds = await ticks.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
  for(let i=1;i<bounds.length;i++) expect(bounds[i].left).toBeGreaterThanOrEqual(bounds[i-1].right);
  const frame = await page.getByRole('figure',{name:'Long time labels',exact:true}).boundingBox();
  expect(bounds[0].left).toBeGreaterThanOrEqual(frame.x);
  expect(bounds.at(-1).right).toBeLessThanOrEqual(frame.x + frame.width);
  }
  const range = page.getByRole('slider', {name:'Visible range 1',exact:true});
  await range.focus(); await page.keyboard.press('ArrowRight');
  await expect(range).toHaveAttribute('aria-valuenow','1');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  const chart = page.getByRole('figure',{name:'Measurements',exact:true});
  await expect(chart.locator('.recharts-line')).toBeVisible();
  await chart.locator('.recharts-line-dot').last().hover();
  await expect(chart.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await chart.getByRole('application').focus(); await page.keyboard.press('ArrowRight');
  await expect(chart.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await page.getByRole('button',{name:'Switch chart',exact:true}).click();
  await expect(chart.locator('.recharts-bar')).toBeVisible();
  await expect(page.getByRole('figure',{name:'Empty measurements',exact:true})).toContainText('No data');
  await navigation.getByRole('button',{name:'Tables',exact:true}).click();
  const table = page.getByRole('region', {name:'Table — 예시: 열별 정렬·필터',exact:true}).first();
  await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Dark',exact:true}).click();
  await page.evaluate(() => { window.__openedLinks = []; window.open = (...args) => { window.__openedLinks.push(args); return null; }; });
  const link = table.getByRole('link', { name: 'Item 1', exact: true });
  await link.click();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__openedLinks)).toEqual([['https://example.test/issues/1','_blank','noopener'],['https://example.test/issues/1','_blank','noopener']]);
  await expect(table.getByRole('link', { name: 'Item 2', exact: true })).toHaveAttribute('href','http://example.test/issues/2');
  for (const n of [3,4,5,6,7,8]) {
    await expect(table.getByRole('cell',{name:`Item ${n}`,exact:true})).toBeVisible();
    await expect(table.getByRole('link',{name:`Item ${n}`,exact:true})).toHaveCount(0);
  }
  if (screenshots) {
    await page.setViewportSize({width:1440,height:1000});
    await link.focus();
    await page.screenshot({path:'tmp/view-link-1440.png'});
    await page.evaluate(async () => { const {i18n} = await import('/src/i18n.ts'); await i18n.changeLanguage('ko'); });
    await page.setViewportSize({width:640,height:1000});
    await link.focus();
    await page.screenshot({path:'tmp/view-link-ko-dark-640.png'});
    await page.evaluate(async () => { const {i18n} = await import('/src/i18n.ts'); await i18n.changeLanguage('en'); });
  }
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  const condition = page.locator('.data-table-filter select').first();
  await expect(condition).toHaveValue('values');
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('61 / 61');
  await expect(table.getByRole('button',{name:'Filter name',exact:true})).toHaveAttribute('aria-pressed','false');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await page.locator('.data-table-filter').getByLabel('Item 1',{exact:true}).uncheck();
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('60 / 61');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await expect(condition).toHaveValue('values');
  await expect(page.locator('.data-table-filter').getByLabel('Item 1',{exact:true})).not.toBeChecked();

  // Native popup pixels are reviewed separately. Protect the shared paired roles.
  const option = condition.locator('option').last();
  await expect(option).toHaveCSS('background-color', await page.locator('[data-slot="popover-content"]').evaluate(el=>getComputedStyle(el).backgroundColor));
  await expect(option).toHaveCSS('color', await page.locator('.ui-gallery').evaluate(el=>getComputedStyle(el).color));
  await condition.selectOption('empty');
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await condition.selectOption('contains');
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('61 / 61');
  await expect(table.getByRole('button',{name:'Filter name',exact:true})).toHaveAttribute('aria-pressed','false');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await condition.selectOption('contains');
  await page.locator('.data-table-filter').getByRole('textbox',{name:'Contains text',exact:true}).fill('Item 1');
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  // The two empty name rows must not survive a new text condition.
  await expect(table.getByRole('status')).toHaveText('11 / 61');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await expect(condition).toHaveValue('contains');
  await expect(page.locator('.data-table-filter').getByLabel('Include empty values',{exact:true})).not.toBeChecked();
  await page.locator('.data-table-filter').getByLabel('Include empty values',{exact:true}).check();
  await condition.selectOption('values');
  await condition.selectOption('contains');
  await expect(page.locator('.data-table-filter').getByLabel('Include empty values',{exact:true})).toBeChecked();
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('13 / 61');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await expect(condition).toHaveValue('contains');
  await expect(page.locator('.data-table-filter').getByLabel('Include empty values',{exact:true})).toBeChecked();
  await page.locator('.data-table-filter').getByRole('button',{name:'Cancel',exact:true}).click();

  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await table.getByRole('button',{name:'score',exact:true}).click();
  await table.getByRole('button',{name:'score',exact:true}).click();
  await expect(table.locator('tbody tr').first()).toContainText('100');
  await table.getByRole('button',{name:'Filter score',exact:true}).click();
  const filter = page.locator('[data-slot="popover-content"]');
  await expect(filter.getByLabel('Include empty values',{exact:true})).not.toBeChecked();
  await filter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('61 / 61');
  await expect(table.getByRole('button',{name:'Filter score',exact:true})).toHaveAttribute('aria-pressed','false');
  await table.getByRole('button',{name:'Filter score',exact:true}).click();
  await filter.getByLabel('Minimum',{exact:true}).fill('99');
  await filter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('status')).toHaveText('1 / 61');
  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table.locator('tbody tr').first()).toContainText('100');


  await navigation.getByRole('button',{name:'Document view',exact:true}).click();
  const documentView=page.getByRole('region',{name:'Document preview content',exact:true});
  await expect(documentView).toContainText('Document view example');
  await expect(documentView.getByRole('table')).toContainText('18');
  const reads=await page.getByLabel('Document reads',{exact:true}).textContent();
  await page.getByRole('button',{name:'Toggle unrelated folder',exact:true}).click();
  await expect(page.getByRole('button',{name:'Toggle unrelated folder',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.screen-document-view')).toHaveAttribute('data-state','ready');
  await expect(page.getByLabel('Document reads',{exact:true})).toHaveText(reads);
  await page.getByRole('button',{name:'Toggle stale target',exact:true}).click();
  await expect(page.locator('.screen-document-view')).toHaveAttribute('data-state','stale-target');
  await expect(page.getByTestId('document-view-highlight')).toHaveCount(0);

}
