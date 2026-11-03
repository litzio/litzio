// Manual evidence only: copy to apps/editor/test/spike-1041-capture.browser.js,
// run pnpm browser:test spike-1041-capture, then remove the temporary copy.
async (page, { expect }) => {
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/ui-gallery');
  await page.getByRole('group', { name: 'Category', exact: true }).getByRole('button', { name: 'Spike #1041', exact: true }).click();
  await expect(page.locator('.spike-report .document-editor')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const [width, theme] of [[1440, 'Light'], [1440, 'Dark'], [640, 'Light']]) {
    await page.setViewportSize({ width, height: width === 640 ? 2400 : 1500 });
    await page.getByRole('group', { name: 'Theme', exact: true }).getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await page.locator('.ui-gallery').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `docs/design/assets/spike-1041/${width}-${theme.toLowerCase()}.png` });
  }
}


