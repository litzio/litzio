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
  await navigation.getByRole('button', {name:'Query lifetime',exact:true}).click();
  const lifecycle=page.getByRole('region',{name:'예시: View lifecycle',exact:true});
  const replacement=lifecycle.getByTestId('plugin-query-view').first();
  await expect(replacement.getByLabel('Text',{exact:true})).toHaveValue('alpha');
  await replacement.getByRole('button',{name:'Search',exact:true}).click();
  await expect(replacement.getByText('Loading data…',{exact:true})).toBeVisible();
  await lifecycle.getByRole('button',{name:'Replace definition',exact:true}).click();
  await expect(replacement.getByLabel('Text',{exact:true})).toHaveValue('beta');
  await lifecycle.getByRole('button',{name:'Resolve previous query',exact:true}).click();
  await expect(replacement.locator('tbody tr')).toHaveCount(0);
  await replacement.getByRole('button',{name:'Search',exact:true}).click();
  await expect(replacement.getByRole('cell',{name:'beta',exact:true})).toBeVisible();
  await lifecycle.getByRole('button',{name:'Toggle availability',exact:true}).click();
  await expect(replacement.getByRole('button',{name:'Search',exact:true})).toBeDisabled();
  await expect(replacement.getByRole('cell',{name:'beta',exact:true})).toBeVisible();
  await expect(replacement).toContainText('Previous query result');
  await navigation.getByRole('button',{name:'Tables',exact:true}).click();
  const examples = page.getByRole('region', { name: 'Plugin views examples' });
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
  // Native popup pixels are reviewed separately. Protect the shared paired roles.
  const option = condition.locator('option').last();
  await expect(option).toHaveCSS('background-color', await page.locator('[data-slot="popover-content"]').evaluate(el=>getComputedStyle(el).backgroundColor));
  await expect(option).toHaveCSS('color', await page.locator('.ui-gallery').evaluate(el=>getComputedStyle(el).color));
  await condition.selectOption('empty');
  await page.locator('.data-table-filter').getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(0);
  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await table.getByRole('button',{name:'score',exact:true}).click();
  await table.getByRole('button',{name:'score',exact:true}).click();
  await expect(table.locator('tbody tr').first()).toContainText('100');
  await table.getByRole('button',{name:'Filter score',exact:true}).click();
  const filter = page.locator('[data-slot="popover-content"]');
  await filter.getByLabel('Minimum',{exact:true}).fill('99');
  await filter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('status')).toHaveText('1 / 61');
  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table.locator('tbody tr').first()).toContainText('100');

  await navigation.getByRole('button',{name:'Plugin views',exact:true}).click();
  await expect(examples.getByRole('table')).toHaveCount(2);
  const states = examples.getByRole('group', { name: 'Generated view state', exact: true });
  await states.getByRole('button', { name: 'Authentication required', exact: true }).click();
  await expect(examples.getByText('Authentication required. Check credentials in plugin settings.', { exact: true })).toBeVisible();
  await states.getByRole('button', { name: 'Loading (previous data)', exact: true }).click();
  await expect(examples.getByText('Previous query result · 09:00', { exact: true })).toBeVisible();
  await expect(examples.getByRole('table')).toHaveCount(2);
  await states.getByRole('button', { name: 'Field errors', exact: true }).click();
  await expect(examples.getByRole('textbox', { name: 'Search text' })).toHaveAttribute('aria-invalid', 'true');
  await examples.getByRole('group', { name: 'View profile', exact: true }).getByRole('button', { name: 'review', exact: true }).click();
  await states.getByRole('button', { name: 'Cannot verify request', exact: true }).click();
  await expect(examples.getByText('Status checks cannot resolve this outcome. Do not repeat this change.', { exact: false })).toBeVisible();
  await examples.getByRole('group', { name: 'View profile', exact: true }).getByRole('button', { name: 'query', exact: true }).click();

}
