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
  await page.getByRole('group', { name: 'Example state', exact: true }).getByRole('button', { name: 'Default', exact: true }).click();
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Generated views', exact: true }).click();
  const examples = page.getByRole('region', { name: 'Generated views examples' });
  await expect(examples.getByRole('table')).toHaveCount(2);
  const states = examples.getByRole('group', { name: 'Generated view state', exact: true });
  await states.getByRole('button', { name: 'auth', exact: true }).click();
  await expect(examples.getByText('Authentication required. Check credentials in plugin settings.', { exact: true })).toBeVisible();
  await states.getByRole('button', { name: 'loading-previous', exact: true }).click();
  await expect(examples.getByText('Previous query result · 09:00', { exact: true })).toBeVisible();
  await expect(examples.getByRole('table')).toHaveCount(2);
  await states.getByRole('button', { name: 'inputIssues', exact: true }).click();
  await expect(examples.getByRole('textbox', { name: 'Search text' })).toHaveAttribute('aria-invalid', 'true');
  await examples.getByRole('group', { name: 'View profile', exact: true }).getByRole('button', { name: 'review', exact: true }).click();
  await states.getByRole('button', { name: 'unverifiable', exact: true }).click();
  await expect(examples.getByText('Status checks cannot resolve this outcome. Do not repeat this change.', { exact: false })).toBeVisible();
}
