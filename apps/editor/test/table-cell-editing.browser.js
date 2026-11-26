// Run with pnpm browser:test table-cell-editing.
// Edits header and body cells of a Markdown table, saves and reloads a real file, and checks that
// cells keep applied, pasted and removed formatting, Enter exits the table, and read-only cells stay unchanged.
// Files are scratch copies under the repository's ignored tmp/ directory; prepare them first
// (see docs/test/TEST_GUIDE.md). The scenario writes those copies only.
async (page, { openPath, expect, screenshots }) => {
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const dir = [root, 'tmp', 'table-cell-editing'].join(separator);
  const technical = [dir, 'technical-document.md'].join(separator);
  const mixed = [dir, 'mixed-table.md'].join(separator);
  const markdown = async (file, name) => {
    const response = await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(file)}`, { headers: { Connection: "close" } });
    if (response.status() !== 200) throw new Error(`Prepare ${file} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const open = async file => {
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await openPath(page, file);
  };
  const save = async () => {
    await page.getByRole('button', {name:'Save', exact:true}).click();
    await page.getByText('Saved', {exact:true}).filter({visible:true}).waitFor();
  };
  const table = page.locator('[data-document-tab][data-active=true] [data-block="table"]');
  const cell = text => table.locator('[data-table-cell]', {hasText: new RegExp(`^${text}$`)});
  const typeAtEnd = async (text, suffix) => {
    await cell(text).click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
  };
  const selectCell = async text => {
    await cell(text).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.waitForFunction(text => {
      const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
      const s = e.state.selection;
      return s.$from.node(-1).type.name === 'tableCell' && e.state.doc.textBetween(s.from, s.to) === text;
    }, text);
  };

  const before = await markdown(technical, 'technical-document.md');
  if (!before.includes('| Port | Type |') || before.includes('Port name')) {
    throw new Error('Scratch document is not a fresh technical-document.md copy');
  }
  const result = {};
  await open(technical);
  const rows = await table.locator('tr').count();
  await typeAtEnd('Port', ' name');
  await typeAtEnd('AC', '-side');
  await selectCell('AC-side');
  await page.keyboard.press('ControlOrMeta+b');
  result.boldApplied = await cell('AC-side').locator('strong').innerText() === 'AC-side';

  // Formatted text copied from a paragraph keeps its marks in a cell.
  await page.locator('[data-document-tab][data-active=true] .document-editor strong', {hasText: 'DC-link voltage'}).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.waitForFunction(() => {
    const e = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    return e.state.doc.textBetween(e.state.selection.from, e.state.selection.to) === 'DC-link voltage';
  });
  await page.keyboard.press('ControlOrMeta+c');
  await typeAtEnd('DC', ' ');
  await page.keyboard.press('ControlOrMeta+v');
  result.formattedPaste = await cell('DC DC-link voltage').locator('strong').innerText() === 'DC-link voltage';
  result.structureUnchanged = await table.locator('tr').count() === rows;
  await page.keyboard.press('Enter');
  await page.keyboard.type('After table.');
  result.enterExitsTable = await page.locator('[data-document-tab][data-active=true] .document-editor > p').filter({hasText:'After table.'}).count() === 1;
  await save();

  await open(technical);
  const saved = await markdown(technical, 'technical-document.md');
  result.savedAndReloaded = await cell('Port name').count() === 1 &&
    await cell('AC-side').locator('strong').count() === 1 && await cell('DC DC-link voltage').locator('strong').count() === 1;
  result.canonicalMarkdown = /:::\{table\}\n\n\| Port name \| Type +\|\n\| -+ \| -+ \|\n\| U +\| \*\*AC-side\*\* +\|\n\| P +\| DC \*\*DC-link voltage\*\* \|\n:::\n\nAfter table\.\n$/.test(saved);
  result.otherSemanticsKept = saved.includes('See [Figure](#fig-control) and {eq}`eq-current`.') &&
    saved.includes(':label: eq-current') && saved.includes(':name: fig-control');
  result.headerCellsStayHeaders = await table.locator('th[data-table-cell]').count() === 2;

  // Editing text inside a formatted cell loaded from disk keeps its marks.
  await typeAtEnd('AC-side', ' revised');
  result.existingFormattedCellEdited = await cell('AC-side revised').locator('strong').innerText() === 'AC-side revised';
  await save();
  await open(technical);
  result.existingFormattedCellReloaded = await cell('AC-side revised').locator('strong').innerText() === 'AC-side revised';

  await open(mixed);
  // An existing formatted cell is editable, and its formatting can be removed.
  await selectCell('bold');
  await page.keyboard.press('ControlOrMeta+b');
  result.boldRemoved = await cell('bold').locator('strong').count() === 0;
  await save();
  result.formattingRemovedOnDisk = /\| U +\| bold +\| \*\*V\*\* +\|/.test(await markdown(mixed, 'mixed-table.md'));
  // A cell hard break and table-owned paragraphs travel through the real Save, Read and Visual comparison.
  const notes = table.locator('[data-table-note]');
  const addNote = async text => {
    // Note editing uses the existing text caret and history.
    await table.locator('[data-table-cell]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add table note', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.type.name === 'tableNote');
    await page.keyboard.type(text);
  };
  if (screenshots) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('view-read').click();
    await expect(table.getByRole('button', { name: 'Table properties', exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'tmp/1973-captures/before-1440-light.png' });
    await page.getByTestId('view-visual').click();
  }
  await cell('U').click();
  await page.keyboard.press('End');
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  // Exercise the browser event sequence without claiming OS IME behavior.
  const composing = await editor.evaluate(el => {
    const view = el.editor.view, dom = view.dom, before = view.state.doc;
    const composition = (type, data) => dom.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
    composition('compositionstart', '');
    composition('compositionupdate', '한');
    const active = view.composing;
    dom.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', shiftKey: true, isComposing: true, bubbles: true, cancelable: true,
    }));
    const unchanged = view.state.doc.eq(before);
    composition('compositionend', '');
    return { active, unchanged };
  });
  expect(composing).toEqual({ active: true, unchanged: true });
  await expect.poll(() => editor.evaluate(el => el.editor.view.composing)).toBe(false);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line two');
  await expect(table.locator('[data-table-cell]').filter({ hasText: /^U\s*Line two$/ }).locator('br')).toHaveCount(1);
  await addNote('a. Nominal value');
  await addNote('b. Measured at full load');
  await expect(notes).toHaveText(['a. Nominal value', 'b. Measured at full load']);
  await notes.last().click();
  await page.keyboard.press('End');
  if (screenshots) {
    await page.evaluate(() => document.fonts.ready);
    await table.screenshot({ path: 'tmp/1973-captures/editing-1440.png', caret: 'initial' });
  }
  await page.keyboard.type('.');
  await expect(notes.last()).toHaveText('b. Measured at full load.');
  await page.getByRole('button', { name: 'File actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Changes before saving', exact: true }).click();
  const dialog = page.getByTestId('save-comparison');
  await dialog.getByRole('button', { name: 'Visual', exact: true }).click();
  const diff = dialog.getByTestId('visual-comparison');
  await expect(diff.locator('[data-table-note]').filter({ hasText: 'Measured at full load.' })).toBeVisible();
  await expect(diff.locator('[data-table-cell] br')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await save();
  await open(mixed);
  await expect(notes).toHaveText(['a. Nominal value', 'b. Measured at full load.']);
  await expect(table.locator('[data-table-cell]').filter({ hasText: /^U\s*Line two$/ }).locator('br')).toHaveCount(1);
  const readView = async () => {
    await page.getByTestId('view-read').click();
    await expect(notes).toHaveText(['a. Nominal value', 'b. Measured at full load.']);
    await expect(table.locator('[data-table-cell] br')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'Table properties', exact: true })).toHaveCount(0);
  };
  await readView();
  for (const [width, height, theme] of [[1440, 900, 'light'], [1920, 1080, 'light'], [1440, 900, 'dark']]) {
    if (!screenshots) break;
    await page.setViewportSize({ width, height });
    await page.evaluate(theme => localStorage.setItem('litzio.theme', theme), theme);
    await page.reload();
    await readView();
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: 'tmp/1973-captures/' + width + '-' + theme + '.png' });
  }
  await page.getByTestId('view-visual').click();
  await notes.last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(notes).toHaveText(['a. Nominal value']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(notes).toHaveText(['a. Nominal value']);
  await save();
  await open(mixed);
  await expect(notes).toHaveText(['a. Nominal value']);

  // External HTML's cell BR is meaningful input. The clipboard is used as in a normal paste.
  await table.getByTestId('table-caption').click();
  await page.keyboard.press('Enter');
  await page.evaluate(async () => {
    const html = '<table><tr><th>Check</th></tr><tr><td>Upper<br>Lower</td></tr></table>';
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]);
  });
  await page.keyboard.press('ControlOrMeta+v');
  const pasted = table.locator('[data-table-cell]').filter({ hasText: /^Upper\s*Lower$/ });
  await expect(pasted.locator('br')).toHaveCount(1);
  await save();
  await open(mixed);
  await expect(pasted.locator('br')).toHaveCount(1);

  // Whole-table copy uses the editor's typed HTML and must carry table-owned notes.
  await table.first().hover();
  await table.first().locator('.block-metadata').click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.node?.type.name === 'table');
  await page.keyboard.press('ControlOrMeta+c');
  await table.last().getByLabel('Table caption', { exact: true }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(table).toHaveCount(3);
  await expect(table.last().locator('[data-table-note]')).toHaveText('a. Nominal value');
  await expect(table.last().locator('[data-table-cell] br')).toHaveCount(1);
  // ADR-0024: a complex table shows its merged cells, header rows and cell blocks, and the text of its
  // paragraphs and list items is edited in place. Its grid and blocks stay: Backspace at a paragraph's
  // start joins nothing, and it has no row tools. Save and reopen keep it.
  const complex = [dir, 'complex-table.md'].join(separator);
  const complexBefore = await markdown(complex, 'complex-table.md');
  await open(complex);
  await expect(table.locator('th[colspan="2"]')).toHaveText('Range');
  await expect(table.locator('td[rowspan="2"] > p')).toHaveText(['Output', 'rated']);
  await expect(table.locator('td > ol > li')).toHaveText(['Peak', 'Mean']);
  await typeAtEnd('230 V', ' AC');
  await expect(table.locator('.table-row-handle, .table-column-handle')).toHaveCount(0);
  await table.locator('td > ol > li', {hasText: /^Mean$/}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' value');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('over 10 min');
  await table.locator('td[rowspan="2"] > p', {hasText: /^rated$/}).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(table.locator('td[rowspan="2"] > p')).toHaveText(['Output', 'rated']);
  await save();
  const complexSaved = await markdown(complex, 'complex-table.md');
  result.complexTableSavesCellText = complexSaved === complexBefore.replace('<td><p>230 V</p></td>', '<td><p>230 V AC</p></td>')
    .replace('<li>Mean</li>', '<li>Mean value<br>over 10 min</li>');
  await open(complex);
  await expect(table.locator('td > ol > li').last()).toHaveText(/^Mean value\s*over 10 min$/);
  await expect(table.locator('th[colspan="2"]')).toHaveText('Range');
  // The last cell starts with a list; Tab there leaves the table instead of adding a row.
  await table.locator('td > ol > li').last().click();
  await page.waitForFunction(() => document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection.$from.parent.textContent.startsWith('Mean value'));
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => {
    const {$from} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
    return $from.depth === 1 && $from.parent.textContent === 'Closing paragraph.';
  });
  await open(complex);
  // Litzio's own clipboard moves the whole table: cut it, paste it after the closing paragraph,
  // then save and reopen with its merged cells, header rows, cell blocks, caption and note.
  const gridSource = source => source.slice(source.indexOf(':::{table}'), source.indexOf(':::\n', source.indexOf(':::{table}') + 1));
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(node => {
    let at = -1;
    node.editor.state.doc.forEach((child, offset) => { if (child.type.name === 'table') at = offset; });
    node.editor.chain().setNodeSelection(at).focus().run();
  });
  // The native cut reads the browser selection: wait until the engine's table selection is drawn in a focused editor.
  await page.waitForFunction(() => {
    const {view, state} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor;
    return state.selection.node?.type.name === 'table' && view.hasFocus() && document.getSelection()?.containsNode(view.nodeDOM(state.selection.from), true);
  });
  await page.keyboard.press('ControlOrMeta+x');
  await expect(table).toHaveCount(0);
  await page.locator('[data-document-tab][data-active=true] .document-editor > p', {hasText: 'Closing paragraph.'}).click();
  await page.keyboard.press('End');
  await page.waitForFunction(() => {
    const {$from} = document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.state.selection;
    return $from.parent.textContent === 'Closing paragraph.' && $from.parentOffset === $from.parent.content.size;
  });
  await page.keyboard.press('ControlOrMeta+v');
  await expect(table.locator('th[colspan="2"]')).toHaveText('Range');
  const order = () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(node => {
    const kinds = []; node.editor.state.doc.forEach(child => kinds.push(child.type.name)); return kinds.join(',');
  });
  await expect.poll(order).toBe('paragraph,paragraph,table');
  const written = page.waitForResponse(response => response.url().split('?')[0].endsWith('/api/document') && response.request().method() === 'POST');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  expect((await written).status()).toBe(200);
  const moved = await markdown(complex, 'complex-table.md');
  result.complexTableMoves = moved.indexOf('Closing paragraph.') < moved.indexOf(':::{table}') && gridSource(moved) === gridSource(complexSaved);
  await open(complex);
  await expect(table.locator('td[rowspan="2"] > p')).toHaveText(['Output', 'rated']);
  await expect(table.locator('[data-table-note]')).toHaveText('a. Measured at rated load.');

  result.consoleErrors = problems;
  const failed = Object.entries(result).filter(([key, value]) => key !== 'consoleErrors' && value !== true);
  if (failed.length > 0 || problems.length > 0) throw new Error(`Table cell editing failed: ${JSON.stringify(result)}`);
  return result;
}
