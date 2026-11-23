// Litzio clipboard labels on paste and drop: conflicts, move vs copy, and Save/Reload.
async (page, { showNotifications, openPath, reloadDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
  const placesFile = [root, 'tmp', 'clipboard-places', 'places.md'].join(separator);
  await openPath(page, placesFile);
  await editor.locator('[data-block="table"]').waitFor();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const state = () => editor.evaluate(el => ({
    doc: JSON.stringify(el.editor.getJSON(), (key, value) => ['sourcePath', 'original', 'sourceCell'].includes(key) ? undefined : value),
    selection: [el.editor.state.selection.from, el.editor.state.selection.to],
  }));
  const select = (text, whole = false) => editor.evaluate((el, args) => {
    const editor = el.editor;
    let from;
    editor.state.doc.forEach((node, pos) => { if (node.textContent === args.text) from = pos + 1; });
    if (from === undefined) throw new Error(`Missing ${args.text}`);
    editor.commands.setTextSelection({from, to: args.whole ? from + args.text.length : from}); editor.view.focus();
  }, {text, whole});
  const notice = page.getByTestId('notice');
  const syntheticPaste = html => editor.evaluate((el, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html); data.setData('text/plain', 'Plain fallback');
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, html);
  // A drop at the start of the "Omega." paragraph, from outside the editor's own drag.
  const syntheticDrop = async (type, value) => {
    const box = await editor.locator('p').filter({hasText:'Omega.'}).boundingBox();
    await editor.evaluate((el, args) => {
      const data = new DataTransfer();
      data.setData(args.type, args.value);
      el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
    }, {type, value, x:box.x + 1, y:box.y + box.height / 2});
  };
  const textPaste = text => editor.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, text);
  const changedFrom = before => page.waitForFunction(doc => JSON.stringify(document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.getJSON(),
    (key, value) => ['sourcePath', 'original', 'sourceCell'].includes(key) ? undefined : value) !== doc, before.doc);
  const result = {};

  // Litzio's own clipboard keeps a Table label: a paste whose explicit label repeats another
  // explicit label (a copy in the same document, a section label, an Equation label, or twice in
  // the paste) is refused before it changes the document (#1847).
  const tableAt = () => editor.evaluate(el => {
    let at;
    el.editor.state.doc.forEach((node, offset) => { if (node.type.name === 'table' && at === undefined) at = offset; });
    return at;
  });
  const tableLabels = () => editor.evaluate(el => {
    const labels = [];
    el.editor.state.doc.forEach(node => { if (node.type.name === 'table') labels.push(node.attrs.label); });
    return labels;
  });
  // The engine's own clipboard HTML for the labelled table, with another label.
  const tableClipboard = (label, times = 1) => editor.evaluate((el, args) => {
    const view = el.editor.view;
    let from, to;
    view.state.doc.forEach((node, offset) => { if (node.type.name === 'table' && from === undefined) { from = offset; to = offset + node.nodeSize; } });
    const one = view.serializeForClipboard(view.state.doc.slice(from, to)).dom.innerHTML;
    return one.replaceAll('tab-data', args.label).repeat(args.times);
  }, {label, times});
  // The engine's own clipboard HTML for blocks built from JSON, without touching the document.
  const clipboardOf = content => editor.evaluate((el, content) => {
    const view = el.editor.view, doc = view.state.doc;
    const Slice = doc.slice(0, 0).constructor, Fragment = doc.content.constructor;
    return view.serializeForClipboard(new Slice(Fragment.fromArray(content.map(json => view.state.schema.nodeFromJSON(json))), 0, 0)).dom.innerHTML;
  }, content);
  const tableJSON = label => editor.evaluate((el, label) => {
    let table;
    el.editor.state.doc.forEach(node => { if (node.type.name === 'table' && !table) table = node.toJSON(); });
    return JSON.parse(JSON.stringify({...table, attrs: {...table.attrs, label}}, (key, value) => key === 'sourcePath' ? null : key === 'sourceCell' ? '' : value));
  }, label);
  const headingJSON = text => ({type: 'heading', attrs: {level: 2}, content: [{type: 'text', text}]});
  const equationJSON = label => ({type: 'equation', attrs: {latex: 'x', label}});
  const refusedTable = async (paste, message) => {
    await notice.waitFor({state:'detached', timeout:10000});
    await select('Omega.');
    const before = await state();
    await paste();
    const after = await state();
    assert(after.doc === before.doc && after.selection.join() === before.selection.join(), `${message}: a refused Table paste keeps the document and selection`);
    await showNotifications(page);
    await notice.filter({hasText:'Pasting would reuse a label that already names another target.'}).waitFor({state:'visible'});
  };
  const labelRefusal = (label, times) => async () => {
    const html = await tableClipboard(label, times);
    assert(html.includes(`${label}`) && html.includes('data-litzio-type'), `Typed clipboard HTML carries the label: ${html}`);
    await syntheticPaste(html);
  };
  await editor.evaluate((el, at) => { el.editor.commands.setNodeSelection(at); el.editor.view.focus(); }, await tableAt());
  await page.keyboard.press('Control+c');
  await refusedTable(() => page.keyboard.press('Control+v'), 'same document copy');
  await refusedTable(labelRefusal('tab-sec'), 'section label');
  await refusedTable(labelRefusal('tab-twin', 2), 'twice in the paste');
  // An Equation label (here an unsaved one) and a Table label refuse each other the same way.
  await notice.waitFor({state:'detached', timeout:10000});
  await select('Omega.');
  const beforeEquation = await state();
  await syntheticPaste(await clipboardOf([equationJSON('eq-x')]));
  await changedFrom(beforeEquation);
  await refusedTable(labelRefusal('eq-x'), 'Equation label');
  await refusedTable(async () => syntheticPaste(await clipboardOf([equationJSON('tab-data')])), 'Equation taking a Table label');
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeEquation.doc, 'One Undo removes the pasted Equation');
  assert(JSON.stringify(await tableLabels()) === JSON.stringify(['tab-data']), 'Refused Table pastes add no table');
  // A copy drop adds labels as a paste does and is refused the same way (#1851): an actual
  // Ctrl drag of a selection holding the labelled Table, and Litzio's clipboard HTML dropped
  // with a section label. A move drop (no Ctrl) keeps one Table and is not refused.
  const outlineTypes = () => editor.evaluate(el => { const types = []; el.editor.state.doc.forEach(node => types.push(node.type.name === 'paragraph' ? node.textContent : node.type.name)); return types.join('|'); });
  const dragTableRange = async copy => {
    await editor.evaluate(el => {
      let from, to;
      el.editor.state.doc.forEach((node, offset) => {
        if (node.textContent === 'LeftRIGHT') from = offset + 1;
        if (node.type.name === 'paragraph' && node.textContent === 'See.') to = offset + 4;
      });
      el.editor.commands.setTextSelection({from, to}); el.editor.view.focus();
    });
    await page.evaluate(() => { window.__tableDrops = []; document.addEventListener('drop', event => window.__tableDrops.push({trusted: event.isTrusted, ctrl: event.ctrlKey}), {capture: true, once: true}); });
    const from = await editor.locator('p').filter({hasText:'LeftRIGHT'}).boundingBox();
    const to = await editor.locator('p').filter({hasText:'Omega.'}).boundingBox();
    const before = await state();
    await page.mouse.move(from.x + 10, from.y + from.height / 2); await page.mouse.down();
    if (copy) await page.keyboard.down('Control');
    await page.mouse.move(to.x + 3, to.y + to.height / 2, {steps: 20}); await page.mouse.up();
    if (copy) await page.keyboard.up('Control');
    const drops = await page.evaluate(() => window.__tableDrops);
    assert(drops.length === 1 && drops[0].trusted && drops[0].ctrl === copy, `Expected an actual ${copy ? 'copy' : 'move'} drop: ${JSON.stringify(drops)}`);
    return before;
  };
  await notice.waitFor({state:'detached', timeout:10000});
  const beforeCopyDrop = await dragTableRange(true);
  const afterCopyDrop = await state();
  assert(afterCopyDrop.doc === beforeCopyDrop.doc && afterCopyDrop.selection.join() === beforeCopyDrop.selection.join(), 'A refused copy drop keeps the document and selection');
  await showNotifications(page);
  await notice.filter({hasText:'Pasting would reuse a label that already names another target.'}).waitFor({state:'visible'});
  await refusedTable(async () => syntheticDrop('text/html', await tableClipboard('tab-sec')), 'dropped clipboard with a section label');
  await notice.waitFor({state:'detached', timeout:10000});
  const beforeMoveDrop = await dragTableRange(false);
  await changedFrom(beforeMoveDrop);
  assert(JSON.stringify(await tableLabels()) === JSON.stringify(['tab-data']), 'A move drop keeps one labelled Table');
  assert((await outlineTypes()).includes('|table|SeeOmega.|'), `The move drop moves the Table: ${await outlineTypes()}`);
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeMoveDrop.doc, 'One Undo restores the move drop');
  // Only explicit labels are compared: a heading's automatic ID is left to Save, as on master.
  // A Table followed by a heading with its ID, and a Table pasted after a paragraph moved between
  // a section label and its heading, paste (the ordered pairs also save below).
  await notice.waitFor({state:'detached', timeout:10000});
  await select('Omega.');
  const beforeMove = await state();
  await editor.evaluate(el => {
    const {state} = el.editor;
    let target, paragraph, at;
    state.doc.forEach((node, offset) => {
      if (node.type.name === 'labelTarget') target = offset + node.nodeSize;
      if (node.textContent === 'LeftRIGHT') { paragraph = node; at = offset; }
    });
    el.editor.view.dispatch(state.tr.delete(at, at + paragraph.nodeSize).insert(target, paragraph));
  });
  const moved = await editor.evaluate(el => { const types = []; el.editor.state.doc.forEach(node => types.push(node.type.name === 'paragraph' ? node.textContent : node.type.name)); return types.slice(0, 4).join('|'); });
  assert(moved === 'heading|labelTarget|LeftRIGHT|heading', `The paragraph moves between the section label and its heading: ${moved}`);
  await select('Omega.');
  const beforeSection = await state();
  await syntheticPaste(await tableClipboard('section'));
  await changedFrom(beforeSection);
  await editor.evaluate(el => el.editor.commands.undo());
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeMove.doc, 'Undo restores the moved paragraph and the pasted Table');
  // A Table label equal to a heading's automatic ID pastes, and Save refuses it as on master.
  await select('Omega.');
  const beforeHeadingId = await state();
  await syntheticPaste(await tableClipboard('places'));
  await changedFrom(beforeHeadingId);
  // The scenario's only expected HTTP 400 (console-errors.ts): this Save of places.md.
  const refusedSave = page.waitForResponse(response => response.url().split('?')[0].endsWith('/api/document') && response.request().method() !== 'GET');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  const refusedResponse = await refusedSave;
  assert(refusedResponse.status() === 400 && (refusedResponse.request().postData() ?? '').includes(JSON.stringify(placesFile).slice(1, -1)),
    `The refused Save is places.md's: ${refusedResponse.status()} ${(refusedResponse.request().postData() ?? '').slice(0, 300)}`);
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor();
  assert(await page.getByTestId('status').getAttribute('data-operation') === 'save-failed', 'Save refuses a Table label equal to a heading ID');
  assert((await page.locator('body').innerText()).includes('Duplicate label'), `Save names the duplicate label: ${await page.locator('body').innerText()}`);
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeHeadingId.doc, 'One Undo removes the Table Save refused');
  // A document that already holds two tables with one label still takes plain text and external
  // HTML, as before: only labels a paste adds are checked.
  await select('Omega.');
  const beforeDuplicate = await state();
  await editor.evaluate(el => {
    let table, omega;
    el.editor.state.doc.forEach((node, offset) => {
      // A copy without session locators, as the engine's own clipboard makes it.
      if (node.type.name === 'table' && !table) table = JSON.parse(JSON.stringify(node.toJSON(), (key, value) => key === 'sourcePath' ? null : key === 'sourceCell' ? '' : value));
      if (node.textContent === 'Omega.') omega = offset;
    });
    el.editor.commands.insertContentAt(omega, table);
  });
  assert(JSON.stringify(await tableLabels()) === JSON.stringify(['tab-data', 'tab-data']), 'The setup holds two tables with one label');
  for (const paste of [() => textPaste('plain words'), () => syntheticPaste('<p>html words</p>'),
    () => syntheticDrop('text/plain', 'dropped words'), async () => syntheticDrop('text/html', await tableClipboard('tab-other'))]) {
    await select('Omega.');
    const before = await state();
    await paste();
    await changedFrom(before);
    await editor.evaluate(el => el.editor.commands.undo());
    assert((await state()).doc === before.doc, 'One Undo restores a paste beside duplicate labels');
  }
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeDuplicate.doc, 'One Undo removes the duplicate setup');
  // Labels no other explicit label names paste with their labels, and the document saves and
  // reloads: a Table or Equation followed by a heading whose automatic ID equals its label (as
  // on master), and a Table with a distinct label.
  await notice.waitFor({state:'detached', timeout:10000});
  for (const content of [[await tableJSON('later'), headingJSON('Later')], [equationJSON('eqlater'), headingJSON('Eqlater')]]) {
    await select('Omega.');
    const before = await state();
    await syntheticPaste(await clipboardOf(content));
    await changedFrom(before);
  }
  await select('Omega.');
  const beforeTableNew = await state();
  await syntheticPaste(await tableClipboard('tab-new'));
  await changedFrom(beforeTableNew);
  // A dropped Table whose label nothing else names keeps it (#1851).
  await select('Omega.');
  const beforeTableDrop = await state();
  await syntheticDrop('text/html', await tableClipboard('tab-drop'));
  await changedFrom(beforeTableDrop);
  assert(JSON.stringify(await tableLabels()) === JSON.stringify(['tab-data', 'later', 'tab-new', 'tab-drop']), `The pasted Tables keep their labels: ${JSON.stringify(await tableLabels())}`);
  const tablePasted = await state();
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor();
  assert(await page.getByTestId('status').getAttribute('data-operation') === 'saved', `Labelled Table paste Save failed: ${await page.locator('body').innerText()}`);
  const placesDisk = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(placesFile)}`, { headers: { Connection: "close" } })).json()).source;
  assert(['tab-data', 'later', 'tab-new', 'tab-drop', 'eqlater'].every(label => placesDisk.includes(`:label: ${label}`) || placesDisk.includes(`:name: ${label}`)) &&
    placesDisk.includes('## Later') && placesDisk.includes('## Eqlater'), `Pasted labels and headings are saved: ${JSON.stringify(placesDisk)}`);
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  assert((await state()).doc === tablePasted.doc, 'Reload must retain the pasted labelled Table');
  result.tableLabelPaste = true;

  return result;
}
