// Opt-in spike: actual model call, save/reopen, manual refresh and identical rendering.
async (page, { expect, screenshots }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/dynamic-ui-spike');
  const panel = page.getByRole('complementary', { name: '비서 패널' });
  const saved = page.getByRole('article', { name: '저장된 뷰' });
  const calls = [];
  page.on('request', request => { if (request.url().includes('/api/view-spike')) calls.push(request.postDataJSON()?.action); });
  const generated = page.waitForResponse(r => r.url().includes('/api/view-spike') && r.request().postDataJSON()?.action === 'proposal', { timeout: 90000 });
  await panel.getByRole('button', { name: '생성', exact: true }).click();
  const response = await generated;
  const proposal = await response.json();
  expect(proposal.error).toBeNull();
  await expect(panel.getByRole('table')).toBeVisible();
  await expect(panel.getByRole('img')).toBeVisible();
  const before = await panel.locator('.view-panels').innerText();
  if (screenshots) await page.screenshot({ path: 'tmp/dynamic-ui/captures/01-generated-1440.png' });
  const pathInput = saved.getByRole('textbox');
  await pathInput.fill((await pathInput.inputValue()).replace('report.view.json', 'demo-' + Date.now() + '.view.json'));
  await saved.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  if (screenshots) await page.screenshot({ path: 'tmp/dynamic-ui/captures/02-saved-1440.png' });
  const afterGeneration = calls.filter(a => a === 'proposal').length;
  await saved.getByRole('button', { name: '다시 열기' }).click();
  await expect(page.getByRole('status')).toContainText('수동 새로고침 대기');
  await expect(saved.getByRole('cell')).toHaveCount(0);
  await saved.getByRole('button', { name: '새로고침' }).click();
  await expect(page.getByRole('status')).toContainText('수동 새로고침 완료');
  expect(await saved.locator('.view-panels').innerText()).toBe(before);
  expect(calls.filter(a => a === 'proposal').length).toBe(afterGeneration);
  if (screenshots) await page.screenshot({ path: 'tmp/dynamic-ui/captures/03-reopened-1440.png' });
  await page.getByRole('button', { name: '설정 카테고리 시험' }).click();
  await expect(page.getByRole('region', { name: '설정 비교' }).getByRole('cell', { name: 'Beta (fixture)', exact: true })).toBeVisible();
  if (screenshots) await page.screenshot({ path: 'tmp/dynamic-ui/captures/04-settings-1440.png', fullPage: true });
  return { file: await pathInput.inputValue(), generated: proposal, identicalText: before, actions: calls };
}
