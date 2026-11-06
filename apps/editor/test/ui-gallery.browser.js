// Protect the development entry's lazy module/CSS/provider connection, not primitive internals.
// pnpm browser:test ui-gallery
async (page, { expect, screenshots }) => {
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/ui-gallery');
  await expect(page.getByRole('heading', { name: 'Litzio UI gallery' })).toBeVisible();
  await expect(page.locator('[data-testid="ui-gallery"]')).toHaveCSS('overflow-y', 'auto');
  const trigger = page.getByRole('button', { name: 'Open dialog', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Example dialog' });
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
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
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Generated views', exact: true }).click();
  const examples = page.getByRole('region', { name: 'Generated views examples' });
  const table = page.getByRole('region', {name:'Table — 예시: 열별 정렬·필터',exact:true}).first();
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
  if (screenshots) {
    await page.setViewportSize({width:1440,height:1000});
    await table.evaluate(el=>el.scrollIntoView({block:'start'})); await page.screenshot({path:'tmp/d3-table-1440.png'});
    await page.evaluate(async()=>{const {i18n}=await import('/src/i18n.ts');await i18n.changeLanguage('ko');});
    await page.setViewportSize({width:640,height:1000});
    await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Dark',exact:true}).click();
    await table.evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:'tmp/d3-table-640.png'});
    await page.evaluate(async()=>{const {i18n}=await import('/src/i18n.ts');await i18n.changeLanguage('en');});
  }

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
}
