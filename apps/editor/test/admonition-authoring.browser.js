// Run with pnpm browser:test admonition-authoring.
// Edits simple admonition bodies through the real Editor, saves and reloads a scratch file, and
// checks that variants, inline semantics, unsupported admonitions and surrounding blocks survive.
// The file is a scratch copy under the repository's ignored tmp/ directory; prepare it first with
// `pnpm browser:prepare` (see docs/test/TEST_GUIDE.md). The scenario writes that copy only.
async (page, { openPath, expect, screenshots }) => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const fixture = name => [root, 'tmp', 'admonition-authoring', name].join(separator);
  const file = fixture('authoring.md');
  const source = async (path, name) => {
    const response = await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(path)}`, { headers: { Connection: "close" } });
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return response.body();
  };
  const markdown = async () => (await source(file, 'authoring.md')).toString().replaceAll('\r\n', '\n');
  const open = async () => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, file);
  };
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  const admonitions = () => editor.locator('aside[data-block="admonition"]');
  const callouts = fixture('callouts.md');
  const insertHere = editor.getByText('Try inserting here.', {exact:true});
  if (screenshots) {
    await openPath(page, callouts);
    await page.setViewportSize({width:1440, height:1000});
    await expect(admonitions()).toHaveCount(10);
    const capture = async (theme, name) =>
      page.screenshot({path:`tmp/1743/after-${theme}-${name}.png`, caret:'initial'});
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', {name:'Settings', exact:true}).click();
      await page.getByTestId('theme').selectOption(theme);
      await page.keyboard.press('Escape');
      await page.getByTestId('settings-dialog').waitFor({state:'detached'});
      await page.evaluate(() => document.fonts.ready);
      await admonitions().first().evaluate(node => node.scrollIntoView({block:'start'}));
      await capture(theme, 'visible-kinds');
      await admonitions().nth(5).evaluate(node => node.scrollIntoView({block:'start'}));
      await capture(theme, 'other-kinds');
      await admonitions().nth(5).hover();
      await page.getByRole('button', {name:/Move .* block 6$/}).click();
      await expect(page.getByRole('menu', {name:'Block actions'})).toBeVisible();
      await capture(theme, 'block-menu');
      await page.keyboard.press('Escape');
      await insertHere.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' /admonition');
      await expect(page.getByRole('menu', {name:'Insert block'})).toBeVisible();
      await capture(theme, 'slash-menu');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+z');
    }
    await page.getByRole('button', {name:'Settings', exact:true}).click();
    await page.getByTestId('theme').selectOption('light');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  }

  const kinds = ['Note', 'Tip', 'Important', 'Warning', 'Danger'];
  const allKinds = [...kinds, 'Hint', 'See also', 'Attention', 'Caution', 'Error'];
  const labels = () => admonitions().locator('.admonition-label');
  const save = async () => {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  };
  const editEnd = async () => {
    await insertHere.click();
    await page.keyboard.press('End');
  };
  const readCallouts = () => source(callouts, 'callouts.md');
  const original = await readCallouts();
  await openPath(page, callouts);
  await expect(labels()).toHaveText(allKinds);
  // Force a real write and then restore the trailing paragraph in a second write.
  await editEnd();
  await page.keyboard.type(' Temporary');
  await save();
  const changed = await readCallouts();
  expect(changed.toString()).toBe(original.toString().replace('Try inserting here.', 'Try inserting here. Temporary'));
  await editor.getByText('Try inserting here. Temporary', {exact:true}).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('Try inserting here.');
  await save();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await openPath(page, callouts);
  await expect(labels()).toHaveText(allKinds);
  expect((await readCallouts()).equals(original)).toBe(true);

  for (const [kind, query] of kinds.map((kind, index) => [kind, ['참고', 'tip', '중요', 'warning', 'danger'][index]])) {
    await editEnd();
    await page.keyboard.type(' /');
    await page.keyboard.insertText(query);
    const row = page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:kind, exact:true});
    await row.click();
    await page.keyboard.type(`Inserted ${kind}.`);
    const inserted = admonitions().filter({hasText:`Inserted ${kind}.`});
    await expect(inserted).toHaveAttribute('data-variant', kind.toLowerCase());
    await expect(inserted.locator('.admonition-label')).toHaveText(kind);
  }
  await admonitions().nth(5).hover();
  const handle = page.getByRole('button', {name:'Move Callout block 6', exact:true});
  await handle.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', {name:'Block actions'});
  await expect(menu.getByRole('separator', {name:'Type'})).toBeVisible();
  const choices = menu.getByRole('menuitemradio');
  await expect(choices).toHaveText(['Hint', ...kinds]);
  await expect(choices.first()).toBeDisabled();
  await expect(choices.first()).toBeChecked();
  await expect(menu.getByRole('menuitem', {name:'Move up'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const note = menu.getByRole('menuitemradio', {name:'Note'});
  await expect(note).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(admonitions().nth(5).locator('.admonition-label')).toHaveText('Note');
  await save();
  const edited = (await readCallouts()).toString();
  expect(edited).not.toContain(':::{hint}');
  for (const [index, kind] of kinds.entries()) {
    const tag = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'][index];
    expect(edited).toContain(`> [!${tag}]\n> Inserted ${kind}.`);
  }

  const selectText = async needle => {
    await page.evaluate(needle => {
      const instance = document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor;
      let range;
      instance.state.doc.descendants((node, position) => {
        if (range || !node.isText) return;
        const index = node.text.indexOf(needle);
        if (index >= 0) range = { from: position + index, to: position + index + needle.length };
      });
      if (!range) throw new Error(`text not found: ${needle}`);
      instance.commands.setTextSelection(range);
      instance.view.focus();
    }, needle);
    await page.getByTestId('selection-toolbar').waitFor();
  };

  const before = await markdown();
  if (!before.startsWith('---\nlitzio: 1\n---\n\n# Admonition authoring')) throw new Error('Scratch document is not a fresh authoring.md copy');
  const result = {};
  await open();
  result.admonitionCount = await admonitions().count() === 3;
  result.variantsInitially = JSON.stringify(await admonitions().evaluateAll(nodes => nodes.map(node => node.dataset.variant))) ===
    JSON.stringify(['warning', 'note', 'tip']);

  await selectText('Before');
  await page.keyboard.type('After');
  await selectText('simple');
  await page.getByRole('button', {name:'Bold', exact:true}).click();

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  const saved = await markdown();
  result.canonicalMarkdown = saved === [
    '---', 'litzio: 1', '---', '',
    '# Admonition authoring',
    '',
    'Intro paragraph.',
    '',
    '> [!WARNING]',
    '> After **bold** and *italic*, [manual](https://a.example), $x$\\',
    '> after the break.',
    '',
    '> [!NOTE]',
    '> A **simple** note.',
    '',
    '> [!TIP]',
    '> A tip is a standard kind and stays editable.',
    '',
    'End paragraph.',
    '',
  ].join('\n');

  await open();
  const blocks = admonitions();
  result.reloadedVariants = JSON.stringify(await blocks.evaluateAll(nodes => nodes.map(node => node.dataset.variant))) ===
    JSON.stringify(['warning', 'note', 'tip']);
  result.reloadedInlineSemantics = await blocks.nth(0).locator('strong').count() === 1 &&
    await blocks.nth(0).locator('em').count() === 1 &&
    await blocks.nth(0).locator('a[href="https://a.example"]').count() === 1 &&
    await blocks.nth(0).getByTestId('inline-math').count() === 1 &&
    await blocks.nth(0).locator('br').count() === 1 &&
    await blocks.nth(1).locator('strong', {hasText:'simple'}).count() === 1;
  result.otherBlocksPreserved = await editor.locator('h1', {hasText:'Admonition authoring'}).count() === 1 &&
    await editor.locator('p.paragraph', {hasText:'Intro paragraph.'}).count() === 1 &&
    await editor.locator('p.paragraph', {hasText:'End paragraph.'}).count() === 1;

  const savedBeforeInvalidEdit = await markdown();
  await page.evaluate(() => {
    const instance = document.querySelector('[data-document-tab][data-active=true] .ProseMirror').editor;
    let position;
    instance.state.doc.descendants((node, pos) => {
      if (position === undefined && node.type.name === 'inlineMath') position = pos;
    });
    if (position === undefined) throw new Error('inline math not found');
    instance.view.dispatch(instance.state.tr.setNodeAttribute(position, 'value', `${String.fromCharCode(10)}x`));
  });
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.getByText('Save failed', {exact:true}).filter({visible:true}).waitFor();
  result.failedEditDidNotWrite = await markdown() === savedBeforeInvalidEdit;

  result.consoleErrors = problems.filter(message => !message.includes('Failed to load resource'));
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || result.consoleErrors.length > 0) {
    throw new Error(`Admonition authoring failed: ${JSON.stringify(result)}\n${saved}`);
  }
  return result;
}
