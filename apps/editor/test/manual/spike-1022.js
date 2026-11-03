// Manual visual comparison, deliberately outside the stable regression suite.
// Run through a temporary apps/editor/test/spike1022.browser.js copy with pnpm browser:test spike1022.
async (page, { openPath }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'spike-1022', 'converter-control.md'].join(sep);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const captures = [];
  const observations = [];
  for (const mode of ['frame', 'gutter', 'containers']) {
    await page.goto(`${origin}/?spike1022=${mode}`);
    await openPath(page, file);
    const expand = page.getByRole('button', { name: 'Expand Explorer', exact: true });
    if (await expand.isVisible()) await expand.click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByTestId('theme').selectOption('light');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.evaluate(() => document.fonts.ready);
    const doc = page.locator('[data-document-tab][data-active="true"] .document-editor');
    const targets = [
      ['paragraph', doc.locator('p').filter({hasText: 'This design note develops'}).first()],
      ['nested-list', doc.locator('li p').filter({hasText: 'Inductance changes'}).first()],
      ['admonition', doc.locator('.admonition-body').filter({hasText: 'Keep the power stage disabled'}).first()],
    ];
    for (const [name, target] of targets) {
      await target.click();
      await page.keyboard.type('x');
      await page.keyboard.press('Enter');
      observations.push(await doc.evaluate(el => {
        const ed = el.editor;
        const node = ed.state.doc.child(ed.state.selection.$from.index(0));
        return { action: 'typing+Enter', kind: node.type.name, indicator: !!document.querySelector('.spike1022-frame, .spike1022-gutter'), hover: !!document.querySelector('.block-hover-outline') };
      }));
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      await target.click();
      await page.keyboard.type(' ');
      await page.keyboard.press('Backspace');
      await page.mouse.move(0, 0);
      await target.evaluate(el => el.scrollIntoView({block:'center'}));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      observations.push(await doc.evaluate(el => {
        const ed = el.editor;
        const index = ed.state.selection.$from.index(0);
        return { action: 'capture', kind: ed.state.doc.child(index).type.name,
          indicator: !!document.querySelector('.spike1022-frame, .spike1022-gutter'),
          hover: !!document.querySelector('.block-hover-outline') };
      }));
      const shot = `docs/design/assets/spike-1022/${mode}-${name}-light.png`;
      await page.screenshot({path:shot, caret:"initial"}); captures.push(shot);
    }
    if (mode === 'gutter') {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByTestId('theme').selectOption('dark');
      await page.keyboard.press('Escape');
      await page.getByTestId('settings-dialog').waitFor({state:'detached'});
      await targets[1][1].click();
      await page.keyboard.type(' '); await page.keyboard.press('Backspace');
      await page.mouse.move(0,0);
      await targets[1][1].evaluate(el => el.scrollIntoView({block:'center'}));
      await page.screenshot({path:'docs/design/assets/spike-1022/gutter-nested-list-dark.png', caret:'initial'});
      captures.push('docs/design/assets/spike-1022/gutter-nested-list-dark.png');
    }
  }
  return { captures, observations, viewport: '1440x1000', fixture: 'apps/editor/samples/en/converter-control.md (scratch copy)', saved: false };
}
