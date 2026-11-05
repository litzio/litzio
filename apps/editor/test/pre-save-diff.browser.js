async (page, { openPath, activeDocument, screenshots = false, removeTabFixture, expect }) => {
  const check = (ok, why) => { if (!ok) throw new Error(why); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`)).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const root = loaded.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'document-tabs', 'technical-1.md'].join(sep);
  await openPath(page, file);
  await activeDocument(page).locator(".document-title-input").fill("Converter report");
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  const editor = () => activeDocument(page).locator('.document-editor');
  const read = async () => (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`)).json());
  const records = () => page.evaluate(async () => (await import('/src/recovery-storage.ts')).recoveryStorage.list());
  const dialog = () => page.getByTestId('save-comparison');
  const menu = () => page.getByRole('button', { name: 'File actions', exact: true });
  const compare = async () => {
    await menu().click();
    await page.getByRole('menuitem', { name: 'Changes before saving', exact: true }).click();
    await dialog().waitFor();
  };
  const close = async () => { await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'detached' }); };
  const layouts = [];
  const capture = async name => {
    for (const language of ['en', 'ko']) for (const width of [640, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async language => { await (await import('/src/i18n.ts')).i18n.changeLanguage(language); await document.fonts.ready; }, language);
      await page.getByRole(name === 'comparison' ? 'heading' : 'menuitem', {
        name: language === 'ko' ? '저장 전 변경 내용 보기' : 'Changes before saving', exact: true,
      }).waitFor();
      const geometry = await page.getByRole(name === 'comparison' ? 'dialog' : 'menu').evaluate(node => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, width: node.clientWidth, scroll: node.scrollWidth, viewport: innerWidth };
      });
      check(geometry.scroll <= geometry.width && geometry.left >= 0 && geometry.right <= width, `${name} overflow: ${JSON.stringify(geometry)}`);
      layouts.push({ name, language, ...geometry });
      if (screenshots) await page.screenshot({ path: `tmp/pre-save-diff/${name}-${language}-${width}.png` });
    }
    await page.evaluate(async () => (await import('/src/i18n.ts')).i18n.changeLanguage('en'));
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  await menu().click();
  check(await page.getByRole('menuitem', { name: 'Changes before saving', exact: true }).isDisabled(), 'Clean document can compare');
  await page.keyboard.press('Escape');
  await editor().locator('h1').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Preview. 미리보기. ');
  // Wait only for the existing recovery recorder to settle before observing its invariance.
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await records()).some(record => record.recoveryText.includes('Preview.'))) break;
    if (attempt === 99) throw new Error('Applied edit was not recorded');
    await page.waitForTimeout(50);
  }
  const disk = await read();
  const beforeRecords = JSON.stringify(await records());
  const before = await editor().evaluate(node => ({ document: node.editor.getJSON(), selection: node.editor.state.selection.toJSON(), undo: node.editor.can().undo() }));
  await menu().click(); await capture('menu'); await page.keyboard.press('Escape');
  let preview;
  const url = '**/api/document-source?recovery=1';
  const observe = async route => { const response = await route.fetch(); preview = await response.json(); await route.fulfill({ response }); };
  await page.route(url, observe);
  await compare();
  await dialog().getByRole('button', { name: 'Source', exact: true }).click();
  await dialog().getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  check((await dialog().innerText()).includes('Canonical formatting changes are included.'), 'Canonical changes are hidden');
  check(await dialog().locator('mark').count() > 0, 'Missing word highlights');
  await dialog().getByRole('button', { name: 'Next change', exact: true }).click();
  check(await dialog().locator('[data-change-start="1"]').evaluate(node => node === document.activeElement), 'Next did not focus change');
  const requestStarted = Date.now();
  const visualResponse = page.waitForResponse(response => response.url().endsWith('/api/document-compare'));
  await dialog().getByRole('button', { name: 'Visual', exact: true }).click();
  await visualResponse;
  const responseReady = Date.now();
  const visual = dialog().getByTestId('visual-comparison');
  await visual.locator('.document-editor').nth(1).waitFor({ state: 'attached' });
  const twoEditorsReady = Date.now();
  check(await visual.locator('.document-editor').count() === 2, 'Visual must own two full snapshots');
  check(await visual.locator('.document-title-input').count() === 2, 'Preview lost the Read title components');
  check(await visual.locator('.document-title-input').first().inputValue() === 'Converter report', 'Preview title changed');
  const snapshots = await visual.locator('.document-editor').evaluateAll(nodes => nodes.map(node => JSON.stringify(node.editor.getJSON())));
  const instances = await visual.evaluateHandle(root => Array.from(root.querySelectorAll('.document-editor'), node => node.editor));
  await dialog().getByRole('button', { name: 'Next change', exact: true }).click();
  check(await visual.locator('[data-visual-change="1"]').first().evaluate(node => node === document.activeElement), 'Visual next did not reveal the paired change');
  await page.keyboard.type('No input'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+s');
  await page.evaluate(() => navigator.clipboard.writeText('No pasted input'));
  await page.keyboard.press('Control+v');
  check(JSON.stringify(await visual.locator('.document-editor').evaluateAll(nodes => nodes.map(node => JSON.stringify(node.editor.getJSON())))) === JSON.stringify(snapshots), 'Read preview mutated');
  const fold = visual.getByRole('button', { name: /Unchanged .* blocks ▸/ }).first();
  await fold.waitFor(); await page.keyboard.press("Tab");
  check(await fold.evaluate(node => node === document.activeElement), "Tab did not reach the context disclosure");
  await page.keyboard.press("Enter");
  const collapse = visual.getByRole('button', { name: /Unchanged .* blocks ▾/ }).first();
  check(await collapse.evaluate(node => node === document.activeElement), "Disclosure lost keyboard focus on expansion");
  await page.keyboard.press("Space"); await fold.waitFor();
  check(await fold.evaluate(node => node === document.activeElement), "Disclosure lost keyboard focus on collapse");
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    const positions = await visual.locator('[data-visual-change="1"]').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width}; }));
    check(positions.length === 2 && (width === 640 ? positions[0].y < positions[1].y : Math.abs(positions[0].y - positions[1].y) < 2), 'Changed blocks lost correspondence');
    if (screenshots) for (const theme of ['light','dark']) {
      await page.evaluate(async theme => (await import('/src/theme.ts')).applyTheme(theme,false), theme);
      await page.screenshot({ path: `tmp/pre-save-diff/visual-${width}-${theme}.png` });
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async () => (await import('/src/theme.ts')).applyTheme('light',false));
  await dialog().getByRole('button', { name: 'Source', exact: true }).click();
  await expect.poll(() => instances.evaluate(editors => editors.every(editor => editor.isDestroyed))).toBe(true);
  await instances.dispose();
  await capture('comparison');
  await page.keyboard.press('Control+s');
  check((await read()).revision === disk.revision && (await read()).source === disk.source, 'Comparison or shortcut wrote disk');
  check(JSON.stringify(await records()) === beforeRecords, 'Comparison changed recovery records');
  await close();
  check(await menu().evaluate(node => node === document.activeElement), 'Menu focus not restored');
  const after = await editor().evaluate(node => ({ document: node.editor.getJSON(), selection: node.editor.state.selection.toJSON(), undo: node.editor.can().undo() }));
  check(JSON.stringify(before) === JSON.stringify(after), 'Comparison changed editor, selection or history');
  await page.unroute(url, observe);
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
  check((await read()).source === preview.markdown, 'Preview differs from real Save');
  const equation = editor().locator('[data-block="equation"]').first();
  await equation.hover(); await equation.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('equation-edit-source').click();
  await page.getByTestId('equation-latex').fill('x + 41');
  await compare();
  await dialog().getByText('0 changes', { exact: true }).waitFor();
  check(!(await dialog().innerText()).includes('x + 41'), 'Unapplied draft entered preview');
  await close();
  check(await page.getByTestId('equation-latex').inputValue() === 'x + 41', 'Comparison lost property draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editor().evaluate(node => node.editor.commands.insertContentAt(1, 'Next edit. '));
  // Command center reuses the same command and captures the acknowledged Save checkpoint.
  await page.keyboard.press('Control+Slash');
  await page.getByRole('combobox').fill('Changes before saving');
  await page.getByRole('option', { name: /Changes before saving/ }).click();
  await dialog().getByRole('button', { name: 'Source', exact: true }).click();
  await dialog().getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  check(!(await dialog().innerText()).includes('The file changed outside Litzio.'), 'Acknowledged revision treated as external');
  await close();
  // A failed Visual request keeps the source comparison and does not touch the session.
  await page.route('**/api/document-compare', route => route.fulfill({ status: 503, json: { error: 'Preview refused by test.' } }), { times: 1 });
  await compare();
  await dialog().getByText('Visual unavailable: Preview refused by test.. Use Source comparison.', { exact: true }).waitFor();
  await dialog().getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  await close();
  // An opaque equation can parse natively but fail the Read NodeView preview.
  await page.route('**/api/document-source?recovery=1', async route => {
    const response = await route.fetch(); const body = await response.json();
    body.markdown += '\n\n```{math}\n\\unknowncommand{}\n```\n';
    await route.fulfill({ response, json: body });
  }, { times: 1 });
  await compare();
  await dialog().getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  check((await dialog().innerText()).includes('Equation preview unavailable:'), 'NodeView failure lost its reason');
  check(await dialog().getByRole('button', { name: 'Visual', exact: true }).isDisabled(), 'Failed preview still offered Visual');
  await close();
  // Close while the request is held, then require the actual fetch to abort.
  let held;
  const hold = route => { held = route; };
  await page.route('**/api/document-compare', hold);
  await compare(); await expect.poll(() => !!held).toBe(true);
  const aborted = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/document-compare') });
  await close(); await held.continue().catch(() => {});
  check((await aborted).failure().errorText.includes('ERR_ABORTED'), 'Closing did not abort comparison request');
  await page.unroute('**/api/document-compare', hold);
  const external = await read();
  const target = external.document.blocks.find(block => block.block === 'paragraph');
  const written = await page.request.post(`${origin}/api/document`, { data: { path: file, revision: external.revision,
    base: { source: external.source }, paragraphs: [{ path: target.path, content: [{ kind: 'text', text: 'External version.' }] }] } });
  check(written.ok(), 'External write failed');
  await compare();
  await dialog().getByText('The file changed outside Litzio. Comparing with the current disk file; Save will still report a conflict.', { exact: true }).waitFor();
  await close();
  await page.getByTestId('save').click();
  await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor();
  check((await read()).source.includes('External version.'), 'Comparison acknowledged external write');
  // Actual Core refusal keeps its structured location and gives no false empty diff.
  await editor().evaluate(node => { const e = node.editor; e.view.dispatch(e.state.tr.delete(1, e.state.doc.firstChild.nodeSize - 1)); });
  await compare(); await dialog().getByRole('alert').waitFor();
  check((await dialog().getByRole('alert').innerText()).includes('Block 1 (heading)'), 'Preview refusal lost Save location');
  check((await dialog().innerText()).includes('The file changed outside Litzio.'), 'Collection failure concealed external revision change');
  check(await dialog().getByRole('region', { name: 'Source differences' }).count() === 0, 'Refusal showed successful diff');
  await close(); await editor().evaluate(node => node.editor.commands.undo());
  removeTabFixture();
  await compare();
  await dialog().getByText('File missing. All content Save would write is shown as added.', { exact: true }).waitFor();
  await close();
  return { layouts, timing: { requestMs: responseReady - requestStarted, responseToTwoEditorsMs: twoEditorsReady - responseReady } };
}
