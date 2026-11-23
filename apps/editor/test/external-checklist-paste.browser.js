// Checklists in external clipboard HTML (#1893), apart from external-html-paste: a rendered GFM
// checklist keeps each item's check state, items with no text are still items, and checkboxes on
// only some items refuse the whole paste with the document and selection kept.
async (page, { showNotifications, openPath }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  await openPath(page, [root, 'tmp', 'external-checklist-paste', 'checklist.md'].join(separator));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const state = () => editor.evaluate(el => ({
    doc: JSON.stringify(el.editor.getJSON(), (key, value) => ['sourcePath', 'original', 'sourceCell'].includes(key) ? undefined : value),
    selection: [el.editor.state.selection.from, el.editor.state.selection.to],
  }));
  // The caret at the start of the "Omega." paragraph.
  const select = () => editor.evaluate(el => {
    let from;
    el.editor.state.doc.forEach((node, pos) => { if (node.textContent === 'Omega.') from = pos + 1; });
    el.editor.commands.setTextSelection(from); el.editor.view.focus();
  });
  const notice = page.getByTestId('notice');
  const syntheticPaste = html => editor.evaluate((el, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html); data.setData('text/plain', 'Plain fallback');
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, html);
  const source = async () => {
    await page.getByTestId('view-source').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="source-view"] pre')?.textContent.includes('Omega.'));
    const text = (await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    return text;
  };
  const original = await source();
  const result = {};

  // Pasted before "Omega." and undone; Source shows Core's Markdown in place of "Omega.".
  const cases = {
    // A rendered GFM checklist (GitHub's markup) keeps each item's check state.
    checklist: ['<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled> Todo</li>' +
      '<li class="task-list-item"><p><input type="checkbox" class="task-list-item-checkbox" checked disabled> Done</p></li></ul>',
      '*   [ ] Todo\n*   [x] Done\n\nOmega.\n'],
    // Checklist items with no text, inside a wrapper with no text, are still items.
    emptyChecklist: ['<p>Inspection</p><div><ul><li><input type="checkbox" checked></li><li><input type="checkbox"></li></ul></div><p>End</p>',
      'Inspection\n\n*   [x]\n*   [ ]\n\nEndOmega.\n'],
    emptyChecklistOnly: ['<div><ul><li><input type="checkbox"></li></ul></div>', '*   [ ]\n\nOmega.\n'],
  };
  for (const [name, [html, expected]] of Object.entries(cases)) {
    await select();
    const before = await state();
    await notice.waitFor({state:'detached', timeout:10000});
    await syntheticPaste(html);
    assert(await notice.count() === 0, `${name}: a checklist paste needs no notice`);
    const markdown = await source();
    assert(markdown === original.replace('Omega.\n', expected), `${name}: ${JSON.stringify(markdown)}`);
    await editor.evaluate(el => el.editor.commands.undo());
    assert((await state()).doc === before.doc, `${name}: one Undo restores the document`);
    result[name] = true;
  }

  // Checkboxes on only some items of a list refuse the whole paste.
  const reason = 'checkboxes are supported only on every item of a bullet list';
  await select();
  const before = await state();
  await syntheticPaste('<ul><li><input type="checkbox" checked> Done</li><li>Plain</li></ul>');
  await showNotifications(page);
  await notice.filter({hasText:`Nothing was pasted: ${reason}. The clipboard and your selection are kept.`}).waitFor({state:'visible'});
  const after = await state();
  assert(after.doc === before.doc && after.selection.join() === before.selection.join(), `${reason}: document and selection must stay`);
  result.refused = true;
  return result;
}
