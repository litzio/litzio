// Manual review only: run temporarily as quiet-document with --screenshots, then restore.
// Seed diagram.svg beside the checkout-local template (phase 1 retains relative assets).
// Creates one checkout-local user template via the real UI. Delete both named fixtures afterwards.
async (page, { expect }) => {
  await page.evaluate(() => localStorage.setItem('litzio.uiLanguage', 'ko'));
  await page.reload();
  await page.locator('.document-editor').waitFor();
  await page.keyboard.press('Control+Slash');
  await page.getByRole('combobox').fill('템플릿으로 저장');
  await page.getByRole('option', { name: '템플릿으로 저장…', exact: true }).click();
  const save = page.getByRole('dialog', { name: '템플릿으로 저장…', exact: true });
  await save.getByLabel('이름', { exact: true }).fill('기술 검증 보고서 936');
  await save.getByLabel('설명', { exact: true }).fill('제어 구조와 수식, 표를 검토하는 기술 검증 문서입니다.');
  await save.getByRole('button', { name: '저장', exact: true }).click();
  await expect(save).toBeHidden();
  for (const [width, theme] of [[1440, 'light'], [640, 'dark']]) {
    await page.setViewportSize({width, height:1000});
    await page.evaluate(theme => localStorage.setItem('litzio.theme', theme), theme);
    await page.reload();
    await page.locator('.document-editor').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path:`docs/design/assets/template-gallery-936/after-document-${width}.png`});
    await page.getByTestId('sidebar').getByRole('button', {name:'템플릿 갤러리', exact:true}).click();
    await expect(page.locator('.template-card-preview')).toHaveCount(3);
    await page.screenshot({path:`docs/design/assets/template-gallery-936/after-gallery-${width}.png`});
    await page.getByRole('button', {name:'기술 검증 보고서 936 미리보기',exact:true}).hover();
    const preview = page.getByRole('dialog', {name:'문서 미리보기',exact:true});
    await expect(preview.locator('.document-editor')).toBeVisible();
    await page.screenshot({path:`docs/design/assets/template-gallery-936/after-preview-${width}.png`});
    const region = preview.getByRole('region', {name:'미리보기 내용',exact:true});
    await region.focus();
    await region.press('End');
    await expect.poll(() => region.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await expect.poll(() => region.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(2);
    await page.screenshot({path:`docs/design/assets/template-gallery-936/after-preview-scrolled-${width}.png`});
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
  }
}
