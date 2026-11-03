// Protect the development entry's lazy module/CSS/provider connection, not primitive internals.
// pnpm browser:test ui-gallery
async (page, { expect }) => {
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
}
