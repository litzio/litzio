// Content editing in a plugin document view (#1976) against the production HTTP Host:
// in-place edits save through the official write path when the edited block is left,
// structural changes are refused with a notice, saves keep targets and correspondences,
// outside changes conflict without overwriting, and Korean composition saves once.
async (page, {expect, screenshots, pluginFixture, viewChange}) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document', {headers: {Connection: 'close'}})).json();
  const root = initial.allowedRoots[0];
  const separator = root.includes('\\') ? '\\' : '/';
  const documentPath = [root, 'content-edit', 'content.md'].join(separator);
  const largePath = [root, 'content-edit', 'large.md'].join(separator);
  const endnotePath = [root, 'content-edit', 'endnote.md'].join(separator);
  const localWritePath = [root, 'content-edit', 'local-write.md'].join(separator);
  const endnoteTablePath = [root, 'content-edit', 'endnote-table.md'].join(separator);
  const emptyPath = [root, 'content-edit', 'empty.md'].join(separator);
  const read = async file => (await (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(file), {headers: {Connection: 'close'}})).json());
  const opening = await read(documentPath);
  let config = {path: documentPath, edit: true, linked: true, revision: opening.revision, paths: opening.document.blocks.map(block => block.path)};
  let codeRevision = 1;
  // Plugin screen code as a document import screen would write it: a source pane, a linked
  // document view with content editing, the edit state in the header and a Read again action.
  const code = () => `export default function(React){return function Screen({ui}){
    const config=${JSON.stringify(config)};
    const [reload,setReload]=React.useState(0),[selected,setSelected]=React.useState(),[edit,setEdit]=React.useState(),[target,setTarget]=React.useState(),[editing,setEditing]=React.useState(config.edit);
    const [apply,setApply]=React.useState(),[revision,setRevision]=React.useState(config.revision);
    React.useEffect(()=>{globalThis.__viewReload=()=>setReload(value=>value+1);globalThis.__viewTarget=setTarget;globalThis.__viewEditing=setEditing;globalThis.__viewApply=setApply;globalThis.__viewRevision=setRevision;},[]);
    const record=name=>value=>{(globalThis[name]??=[]).push({...value,time:performance.now()});};
    const document={path:config.path,editContent:editing,reloadKey:reload,height:480,target,label:'Converted document',
      onStateChange:record('__viewStates'),onEditStateChange:value=>{setEdit(value);record('__editStates')(value);},
      onSave:record('__saves'),onBlockClick:record('__clicks'),apply,onApplyStateChange:record('__applyStates')};
    const labels={clean:'Saved',unsaved:'Unsaved changes',saving:'Saving',failed:'Not saved',conflict:'Changed elsewhere'};
    const tones={clean:'ok',unsaved:'neutral',saving:'progress',failed:'error',conflict:'warning'};
    const status=edit?React.createElement(ui.Status,{variant:'plain',tone:tones[edit.state],label:labels[edit.state]}):null;
    const items=config.paths.map((path,index)=>({id:String(index),label:'Source '+(index+1),path,colorToken:'--id-color-info',boxes:[{left:16,top:16+index*64,width:160,height:48}]}));
    const source=React.createElement('div',{style:{position:'relative',height:32+items.length*64}},items.map(item=>React.createElement(ui.Button,{key:item.id,'data-linked-item':item.id,'aria-pressed':selected===item.id,
      onClick:()=>setSelected(item.id),style:{position:'absolute',...item.boxes[0],justifyContent:'start'}},item.label)));
    const body=config.linked?React.createElement(ui.LinkedDocumentView,{document,revision,source,sourceLabel:'Source pages',items,selectedId:selected,onSelect:setSelected})
      :React.createElement(ui.DocumentView,document);
    return React.createElement(ui.ScreenLayout,{description:'Correct the converted document in place.',status,actions:React.createElement(ui.Button,{onClick:()=>setReload(value=>value+1)},'Read again')},body);
  }}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({json: {screens: [{plugin: 'fixture.import', id: 'compare', entry: 'screen.jsx', title: 'Compare', icon: 'Columns2', primary: true, code: code(), codeRevision: String(codeRevision)}], receipt: {outcome: 'success'}}}));
  const folder = [root, 'content-edit'].join(separator);
  const open = async () => {
    codeRevision++;
    // The screen's scope is the Explorer's opened folders.
    await page.evaluate(folder => localStorage.setItem('litzio.openFolders.v2', JSON.stringify([folder])), folder);
    await page.reload();
    // The app restores its opened folder before an activity entry opens a screen tab.
    await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready"]').waitFor({state: 'attached'});
    await page.getByTestId('sidebar').getByRole('treeitem', {name: 'content.md', exact: true}).waitFor();
    await page.getByTestId('activity-bar').getByRole('button', {name: 'Compare', exact: true}).click();
    await page.getByTestId('view-workspace').filter({visible: true}).locator('.screen-document-view').waitFor();
  };
  await page.setViewportSize({width: 1440, height: 1000});
  await open();
  const workspace = page.getByTestId('view-workspace').filter({visible: true});
  const view = workspace.locator('.screen-document-view');
  const content = workspace.getByRole('region', {name: 'Converted document content', exact: true});
  const editor = content.locator('.document-editor');
  const paragraph = text => content.locator('p').filter({hasText: text}).first();
  const editStates = () => page.evaluate(() => (globalThis.__editStates ?? []).map(value => value.state));
  const saves = () => page.evaluate(() => globalThis.__saves ?? []);
  const lastEdit = () => page.evaluate(() => globalThis.__editStates?.at(-1));
  const disk = async () => (await read(documentPath)).source;
  const blockKinds = () => editor.evaluate(node => { const kinds = []; node.editor.state.doc.forEach(child => kinds.push(child.type.name + (child.attrs.level ? child.attrs.level : ''))); return kinds.join(','); });
  const notice = page.getByTestId('document-view-refused');
  // Review captures only; the Explorer shows this machine's folder paths.
  const capture = async name => page.screenshot({path: `tmp/document-view-editing-${name}.png`, mask: [page.locator('.sidebar')],
    maskColor: await page.locator('.sidebar').evaluate(node => getComputedStyle(node).backgroundColor)});
  const captureSizes = async name => {
    for (const [width, height, theme] of [[1440, 1000, 'light'], [1920, 1080, 'light'], [1440, 1000, 'dark']]) {
      await page.setViewportSize({width, height});
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await capture(`${name}-${width}-${theme}`);
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.setViewportSize({width: 1440, height: 1000});
  };
  await expect(paragraph('Teh first paragraph')).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  const kinds = await blockKinds();
  // Content editing hides block and document authoring; the header shows the edit state.
  await expect(content.locator('.block-controls')).toHaveCount(0);
  await expect(content.locator('.document-settings')).toHaveCount(0);
  await expect(workspace.locator('.task-header')).toContainText('Saved');
  await expect.poll(lastEdit).toMatchObject({state: 'clean', revision: opening.revision});

  // A linked pair stays selected and in place across this view's own Saves.
  const sourceButton = name => workspace.getByRole('region', {name: 'Source pages', exact: true}).getByRole('button', {name, exact: true});
  await sourceButton('Source 3').click();
  await expect(workspace.locator('[data-testid="linked-document-band"][data-emphasis="selected"]')).toHaveCount(1);
  const bandsBefore = await workspace.getByTestId('linked-document-band').count();
  expect(bandsBefore).toBeGreaterThan(0);
  await page.evaluate(([revision, path]) => globalThis.__viewTarget({revision, path, highlight: true}), [opening.revision, config.paths[2]]);
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();

  // Fix the typo; leaving the block saves it through the Host.
  await paragraph('Teh first paragraph').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('The');
  await expect.poll(lastEdit).toMatchObject({state: 'unsaved'});
  await expect(workspace.locator('.task-header')).toContainText('Unsaved changes');
  const scrollBefore = await content.evaluate(node => node.scrollTop);
  await paragraph('Second paragraph stays').click();
  await expect.poll(async () => (await saves()).length).toBe(1);
  const [first] = await saves();
  expect(first.previousRevision).toBe(opening.revision);
  // The Host describes the block this Save changed, so screen code needs no reread.
  expect(first.blocks).toEqual([{path: config.paths[1], nodes: [expect.objectContaining({path: config.paths[1], type: 'paragraph', text: 'The first paragraph has a typo.'})]}]);
  expect(await disk()).toContain('The first paragraph has a typo.');
  expect((await read(documentPath)).revision).toBe(first.revision);
  await expect.poll(lastEdit).toMatchObject({state: 'clean', revision: first.revision});
  // The editor was not recreated: highlight, outline, bands, scroll and click reports continue.
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();
  await expect(workspace.locator('[data-testid="linked-document-band"][data-emphasis="selected"]')).toHaveCount(1);
  expect(await workspace.getByTestId('linked-document-band').count()).toBe(bandsBefore);
  expect(Math.abs(await content.evaluate(node => node.scrollTop) - scrollBefore)).toBeLessThan(2);
  await paragraph('Closing paragraph').click();
  await expect.poll(() => page.evaluate(() => globalThis.__clicks?.at(-1))).toMatchObject({revision: first.revision, path: config.paths[5]});
  await expect(sourceButton('Source 6')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => globalThis.__viewStates.at(-1))).toMatchObject({state: 'ready', revision: first.revision});

  // Inline math in an empty table cell, saved when the cell's table is left.
  const cell = content.locator('table tr').nth(1).locator('td').nth(1);
  await cell.click();
  await page.keyboard.type('$A=w h$');
  await expect(cell.locator('.katex')).toBeVisible();
  await expect(workspace.locator('.table-tools, [data-testid="table-row-menu"], [data-testid="table-column-menu"]')).toHaveCount(0);
  await paragraph('Closing paragraph').click();
  await expect.poll(async () => (await saves()).length).toBe(2);
  expect(await disk()).toMatch(/\| Area \| \$A=w h\$ \|/);

  // Refused structural changes leave the document unchanged with a short notice, never an error view.
  for (const key of ['Enter', 'Backspace']) {
    await paragraph('Second paragraph stays').click();
    await page.keyboard.press('Home');
    if (key === 'Enter') await page.keyboard.press('End');
    await page.keyboard.press(key === 'Backspace' ? 'Backspace' : 'Enter');
    await expect(notice).toContainText('This view keeps every block as it is.');
    expect(await blockKinds()).toBe(kinds);
    await expect(view).toHaveAttribute('data-state', 'ready');
    if (screenshots && key === 'Enter') await capture('refused-1440-light');
  }
  const paste = text => editor.evaluate((node, text) => {
    const data = new DataTransfer(); data.setData('text/plain', text);
    node.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
  }, text);
  await paragraph('Second paragraph stays').click();
  await paste('Pasted one\n\nPasted two');
  expect(await blockKinds()).toBe(kinds);
  await cell.click();
  await paste('Line one\n\nLine two');
  expect(await blockKinds()).toBe(kinds);
  await expect(view).toHaveAttribute('data-state', 'ready');
  // A Markdown block shortcut keeps the typed text instead of changing the block.
  await paragraph('Closing paragraph').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('# ');
  expect(await blockKinds()).toBe(kinds);
  await expect(paragraph('# Closing paragraph')).toBeVisible();
  // Undo after a Save is saved too.
  for (let step = 0; step < 6 && await paragraph('# Closing paragraph').count(); step++) await page.keyboard.press('Control+z');
  await expect(paragraph('# Closing paragraph')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  await expect.poll(lastEdit).toMatchObject({state: 'clean'});
  const firstParagraph = paragraph('The first paragraph');
  const firstParagraphHasCaret = atEnd => firstParagraph.evaluate((node, atEnd) => {
    const { view, state } = node.closest('.ProseMirror').editor;
    const dom = window.getSelection();
    const selection = state.selection;
    return view.hasFocus() && selection.empty && dom?.isCollapsed && node.contains(dom.anchorNode) &&
      view.posAtDOM(dom.anchorNode, dom.anchorOffset) === selection.from &&
      (!atEnd || selection.$from.parentOffset === selection.$from.parent.content.size);
  }, atEnd);
  await firstParagraph.click();
  await page.keyboard.press('End');
  // Undo restores the selection recorded before typing, which can still point to the previous block.
  await expect.poll(() => firstParagraphHasCaret(true)).toBe(true);
  await page.keyboard.type(' Later.');
  await paragraph('Closing paragraph').click();
  await expect.poll(disk).toContain('has a typo. Later.');
  await expect.poll(lastEdit).toMatchObject({state: 'clean'});
  await firstParagraph.click();
  await expect.poll(() => firstParagraphHasCaret(false)).toBe(true);
  await page.keyboard.press('Control+z');
  await expect(paragraph('has a typo. Later.')).toHaveCount(0);
  await paragraph('Closing paragraph').click();
  await expect.poll(disk).not.toContain('Later.');
  expect(await disk()).toContain('The first paragraph has a typo.');

  // Korean composition: a block change or Ctrl+S during composition saves the committed text once.
  const cdp = await page.context().newCDPSession(page);
  await paragraph('Second paragraph stays').click();
  await page.keyboard.press('End');
  await cdp.send('Input.imeSetComposition', {text: 'ㅎ', selectionStart: 1, selectionEnd: 1});
  await page.waitForFunction(() => document.querySelector('.screen-document-view .document-editor').editor.view.composing);
  await page.keyboard.press('Control+s');
  await cdp.send('Input.imeSetComposition', {text: '한글', selectionStart: 2, selectionEnd: 2});
  await cdp.send('Input.insertText', {text: '한글'});
  await page.waitForFunction(() => !document.querySelector('.screen-document-view .document-editor').editor.view.composing);
  await expect.poll(disk).toContain('Second paragraph stays.한글');
  expect((await disk()).match(/한글/g)).toHaveLength(1);
  const cellText = content.locator('table tr').nth(2).locator('td').nth(1);
  await cellText.click();
  await page.keyboard.press('End');
  await cdp.send('Input.imeSetComposition', {text: '질', selectionStart: 1, selectionEnd: 1});
  await cdp.send('Input.imeSetComposition', {text: '질량', selectionStart: 2, selectionEnd: 2});
  await cdp.send('Input.insertText', {text: '질량'});
  await paragraph('Closing paragraph').click();
  await expect.poll(disk).toMatch(/\| Mass \| m질량 *\|/);
  expect(await editor.evaluate(node => node.editor.state.doc.textContent.match(/질량/g)?.length)).toBe(1);
  await cdp.detach();

  // A reloadKey change while edits are unsaved saves first, then reads again.
  await paragraph('Closing paragraph').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Before reading again.');
  const savesBeforeReload = (await saves()).length;
  await page.evaluate(() => globalThis.__viewReload());
  await expect.poll(async () => (await saves()).length).toBe(savesBeforeReload + 1);
  await expect(paragraph('Closing paragraph. Before reading again.')).toBeVisible();
  expect(await disk()).toContain('Closing paragraph. Before reading again.');
  // The file is still at this view's last Save: the screen's target from the opening stays valid.
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();
  expect(await page.evaluate(() => globalThis.__viewStates.at(-1).state)).toBe('ready');

  // An outside change conflicts: the edit stays, the file is not overwritten, Read again discards.
  const outside = (await disk()).replace('Second paragraph stays.한글', 'Changed by another program.');
  pluginFixture.writeContentEditDocument('content.md', outside);
  await paragraph('Closing paragraph').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Conflicting edit.');
  await paragraph('The first paragraph').click();
  await expect.poll(lastEdit).toMatchObject({state: 'conflict'});
  const conflict = workspace.getByTestId('document-view-conflict');
  await expect(conflict).toContainText('changed outside this view');
  await expect(workspace.locator('.task-header')).toContainText('Changed elsewhere');
  await expect(paragraph('Conflicting edit.')).toBeVisible();
  expect(await disk()).toBe(outside);
  if (screenshots) await captureSizes('conflict');
  await conflict.getByRole('button', {name: 'Read again (discard edits)', exact: true}).click();
  await expect(paragraph('Changed by another program.')).toBeVisible();
  await expect(paragraph('Conflicting edit.')).toHaveCount(0);
  await expect(conflict).toHaveCount(0);
  await expect.poll(lastEdit).toMatchObject({state: 'clean'});
  expect(await disk()).toBe(outside);
  // Another program's revision ends the accepted chain: the opening target is stale now.
  await expect.poll(() => page.evaluate(() => globalThis.__viewStates.at(-1).state)).toBe('stale-target');
  await page.evaluate(revision => globalThis.__viewTarget({revision, path: [5], highlight: true}), (await read(documentPath)).revision);
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();

  // Saving state and the table-cell math, for review.
  if (screenshots) {
    // Hold the Save request until the captures are taken.
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/document', async route => {
      if (route.request().method() === 'POST') await held;
      await route.continue();
    });
    await cell.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' m²');
    await paragraph('Closing paragraph').click();
    await expect(workspace.locator('.task-header')).toContainText('Saving');
    await captureSizes('saving');
    release();
    await expect.poll(lastEdit).toMatchObject({state: 'clean'});
    await page.unroute('**/api/document');
  }

  // Save completes endnotes from their references: removing the only reference would remove its
  // definition, and removing a caption reference would reorder definitions. Content editing
  // refuses both before they apply; no Save request is sent and the file stays byte for byte.
  let documentPosts = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().split('?')[0].endsWith('/api/document')) documentPosts++; });
  const refusesReferenceRemoval = async (file, place, other) => {
    const before = await read(file);
    config = {path: file, edit: true, linked: false, revision: '', paths: []};
    await open();
    await expect(place()).toBeVisible();
    const posts = documentPosts;
    await place().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await expect(notice).toContainText('This view cannot add, remove or move endnote references.');
    await other().click();
    await page.keyboard.press('Control+s');
    await expect.poll(lastEdit).toMatchObject({state: 'clean'});
    const after = await read(file);
    expect(after.source).toBe(before.source);
    expect(after.revision).toBe(before.revision);
    expect(await saves()).toEqual([]);
    expect(documentPosts).toBe(posts);
    return before;
  };
  const endnoteOpening = await refusesReferenceRemoval(endnotePath, () => paragraph('First paragraph with a note'), () => paragraph('Second paragraph'));
  await refusesReferenceRemoval(endnoteTablePath, () => content.getByTestId('table-caption'), () => paragraph('After the table'));
  config = {path: endnotePath, edit: true, linked: false, revision: '', paths: []};
  await open();
  await expect(paragraph('Second paragraph')).toBeVisible();

  // Turning content editing off keeps targets of the revisions this view saved.
  await page.evaluate(([revision, path]) => globalThis.__viewTarget({revision, path, highlight: true}), [endnoteOpening.revision, endnoteOpening.document.blocks[1].path]);
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();
  await paragraph('Second paragraph').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await page.evaluate(() => globalThis.__viewEditing(false));
  await expect.poll(async () => (await saves()).length).toBe(1);
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  expect((await read(endnotePath)).source).toContain('Second paragraph. Edited.');
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__viewStates.at(-1).state)).toBe('ready');

  // HTTP tests inject verification mismatches in the worker. Here use the same
  // correction receipt with real changed disk bytes to exercise the live UI handoff.
  config = {path: localWritePath, edit: true, linked: false, revision: '', paths: []};
  await open();
  await expect(paragraph('Second paragraph.')).toBeVisible();
  if (screenshots) await capture('fast-save-before-1440-light');
  const heldStatus = '**/api/local-write-status?*';
  let correctedRevision, localRevision;
  await page.route(heldStatus, route => {
    const revision = /[?&]revision=([a-f0-9]+)/.exec(route.request().url())?.[1];
    return route.fulfill({json: revision === localRevision && correctedRevision
      ? {state: 'corrected', revision: correctedRevision} : {state: 'pending'}});
  });
  await paragraph('Second paragraph.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Fast.');
  const localResponse = page.waitForResponse(response => response.url().endsWith('/api/document') && response.request().method() === 'POST');
  await paragraph('First paragraph.').click();
  const provisional = await (await localResponse).json();
  expect(provisional.pendingLocalWrite).toBe(true);
  localRevision = provisional.revision;
  await expect.poll(lastEdit).toMatchObject({state: 'clean', revision: localRevision});
  const provisionalFile = await read(localWritePath);
  const editedBlock = provisionalFile.document.blocks.find(block => block.text?.includes('Second paragraph.'));
  const correction = await page.request.post(origin + '/api/document', {headers: {Origin: origin, Connection: 'close'},
    data: {path: localWritePath, revision: localRevision, base: {source: provisionalFile.source},
      paragraphs: [{path: editedBlock.path, content: [{kind: 'text', text: 'Second paragraph. Corrected.'}]}]}});
  expect(correction.ok()).toBe(true);
  correctedRevision = (await correction.json()).revision;
  await expect(page.getByTestId('local-write-correction')).toContainText('The Host checked your save and corrected the file.');
  await expect(paragraph('Second paragraph. Corrected.')).toBeVisible();
  await expect.poll(lastEdit).toMatchObject({state: 'clean', revision: correctedRevision});
  // The quick Save's description named the candidate; the correction arrives as a new revision.
  expect((await saves()).at(-1)).toMatchObject({revision: localRevision, blocks: [expect.objectContaining({path: editedBlock.path})]});
  await expect.poll(() => page.evaluate(() => globalThis.__viewStates.at(-1))).toMatchObject({state: 'ready', revision: correctedRevision});
  if (screenshots) await captureSizes('fast-save-correction');
  await page.unroute(heldStatus);

  const rejectedPath = [root, 'content-edit', 'local-write-rejected.md'].join(separator);
  config = {path: rejectedPath, edit: true, linked: false, revision: '', paths: []};
  await open();
  const beforeReject = await read(rejectedPath);
  const saveResponse = () => page.waitForResponse(response => response.url().endsWith('/api/document') && response.request().method() === 'POST');
  let holdReceipt = true;
  await page.route(heldStatus, route => holdReceipt ? route.fulfill({json:{state:'pending'}}) : route.continue());
  try {
    await paragraph('Second paragraph.').click(); await page.keyboard.press('End'); await page.keyboard.type(' Rejected edit.');
    const posted = saveResponse();
    await page.keyboard.press('Control+s');
    const candidate = await (await posted).json();
    expect(candidate.pendingLocalWrite).toBe(true);
    await expect.poll(lastEdit).toMatchObject({state:'clean', revision:candidate.revision});
    holdReceipt = false;
    await expect.poll(lastEdit).toMatchObject({state:'failed', revision:beforeReject.revision});
    // A refused quick Save takes the view back to the previous revision, as for any other change.
    await expect.poll(() => page.evaluate(() => globalThis.__viewStates.at(-1))).toMatchObject({revision: beforeReject.revision});
    expect((await read(rejectedPath)).source).toBe(beforeReject.source);
    await expect(paragraph('Second paragraph.')).toHaveText('Second paragraph. Rejected edit.');
    await expect(workspace.locator('.task-header')).toContainText('Not saved');
    const error = workspace.getByTestId('document-view-save-error');
    await expect(error).toContainText('Block 2 (paragraph)');
    await expect(error).toContainText('empty paragraph cannot be saved');
    await page.keyboard.type(' Newer text.');
    const retry = saveResponse();
    await page.keyboard.press('Control+s');
    const refused = await retry;
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({error:'empty paragraph cannot be saved', failure:{target:{path:[2],part:0}}});
    expect(refused.request().postDataJSON().revision).toBe(beforeReject.revision);
    expect(refused.request().postDataJSON().base.savedEdits).toBeUndefined();
    await expect(error).toContainText('empty paragraph cannot be saved');
    await expect(paragraph('Second paragraph.')).toHaveText('Second paragraph. Rejected edit. Newer text.');
    const accepted = saveResponse();
    await page.keyboard.press('Control+s');
    expect((await (await accepted).json()).pendingLocalWrite).toBeUndefined();
    await expect.poll(lastEdit).toMatchObject({state:'clean'});
    expect((await read(rejectedPath)).source).toContain('Second paragraph. Rejected edit. Newer text.');
  } finally { await page.unroute(heldStatus); }

  // Screen code's correction shown before its write (#1995): only the changed blocks are replaced,
  // input and correspondences wait for the write, and the written file continues the same editor.
  const applyPath = [root, 'content-edit', 'apply.md'].join(separator);
  const applyOpening = await read(applyPath);
  config = {path: applyPath, edit: true, linked: true, revision: applyOpening.revision, paths: applyOpening.document.blocks.map(block => block.path)};
  await open();
  const applyStates = () => page.evaluate(() => (globalThis.__applyStates ?? []).map(({time, ...value}) => value));
  const bands = workspace.getByTestId('linked-document-band');
  await expect.poll(() => bands.count()).toBeGreaterThan(0);
  // Element references, not attributes: the editor rewrites attributes it did not render.
  await editor.evaluate(node => { globalThis.__applyEditor = node; });
  const sameEditor = () => editor.evaluate(node => node === globalThis.__applyEditor);
  const third = () => paragraph('Third paragraph stays');
  await third().evaluate(node => { globalThis.__applyKept = node; });
  const keptBlock = () => third().evaluate(node => node === globalThis.__applyKept);
  // Join the two halves into one heading, as a document import correction would.
  const join = viewChange(applyPath, (sdk, document) => sdk.convertBlock(sdk.mergeParagraphWithPrevious(document, [3]), [2], {block: 'heading', level: 2}));
  expect(join.revision).toBe(applyOpening.revision);
  await page.evaluate(([revision, change]) => globalThis.__viewApply({request: 1, revision, change}), [join.revision, join.change]);
  await expect(content.locator('h2').filter({hasText: 'First part of a sentencesecond part of it.'})).toBeVisible();
  expect(await applyStates()).toEqual([{request: 1, state: 'pending', revision: applyOpening.revision}]);
  expect((await read(applyPath)).revision).toBe(applyOpening.revision);
  expect(await sameEditor()).toBe(true);
  expect(await keptBlock(), 'blocks outside the change are not redrawn').toBe(true);
  await expect(view).toHaveAttribute('data-applying', 'true');
  // Input waits for the write without turning the editor read-only (which would redraw every block).
  await third().click();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await expect(third()).toHaveText('Third paragraph stays.');
  await expect(bands).toHaveCount(0);
  await expect.poll(lastEdit).toMatchObject({state: 'saving', revision: applyOpening.revision});
  if (screenshots) await captureSizes('apply-pending');
  // A second correction pressed while the first waits for its write is refused; the first stays shown.
  const second = viewChange(applyPath, (sdk, document) => sdk.convertBlock(document, [4], {block: 'heading', level: 3}));
  await page.evaluate(([revision, change]) => globalThis.__viewApply({request: 'second', revision, change}), [second.revision, second.change]);
  await expect.poll(async () => (await applyStates()).at(-1)).toMatchObject({request: 'second', state: 'refused', revision: applyOpening.revision});
  expect((await applyStates()).filter(value => value.request === 1)).toEqual([{request: 1, state: 'pending', revision: applyOpening.revision}]);
  await expect(content.locator('h2').filter({hasText: 'First part of a sentencesecond part of it.'})).toBeVisible();
  await expect(content.locator('h3')).toHaveCount(0);
  await expect(view).toHaveAttribute('data-applying', 'true');
  // The write ends: the view reads the written file in the background and continues from it.
  const joined = join.write();
  await page.evaluate(([revision, change, saved]) => globalThis.__viewApply({request: 1, revision, change, saved}), [join.revision, join.change, joined]);
  await expect.poll(applyStates).toContainEqual({request: 1, state: 'saved', revision: joined});
  await expect(view).not.toHaveAttribute('data-applying', 'true');
  expect(await sameEditor()).toBe(true);
  await expect.poll(() => page.evaluate(() => globalThis.__viewStates.at(-1))).toMatchObject({state: 'ready', revision: joined});
  await expect.poll(lastEdit).toMatchObject({state: 'clean', revision: joined});
  const joinedFile = await read(applyPath);
  config.paths = joinedFile.document.blocks.map(block => block.path);
  await page.evaluate(revision => globalThis.__viewRevision(revision), joined);
  await expect.poll(() => bands.count()).toBeGreaterThan(0);
  if (screenshots) await captureSizes('apply-saved');
  // A content edit after the change saves against the written file.
  await third().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited after.');
  await paragraph('Closing paragraph').click();
  await expect.poll(async () => (await saves()).length).toBe(1);
  const [afterChange] = await saves();
  expect(afterChange.previousRevision).toBe(joined);
  expect(afterChange.blocks).toEqual([{path: joinedFile.document.blocks[2].path, nodes: [expect.objectContaining({text: 'Third paragraph stays. Edited after.'})]}]);
  expect((await read(applyPath)).source).toContain('## First part of a sentencesecond part of it.\n\nThird paragraph stays. Edited after.');
  // A refused write puts the view back and says why; the file stays as it was.
  const beforeFailure = await read(applyPath);
  const convert = viewChange(applyPath, (sdk, document) => sdk.convertBlock(document, [3], {block: 'heading', level: 3}));
  await page.evaluate(([revision, change]) => globalThis.__viewApply({request: 2, revision, change}), [convert.revision, convert.change]);
  await expect(content.locator('h3').filter({hasText: 'Edited after.'})).toBeVisible();
  await page.evaluate(([revision, change]) => globalThis.__viewApply({request: 2, revision, change, failed: 'The file changed before the correction was written.'}), [convert.revision, convert.change]);
  await expect(workspace.getByTestId('document-view-apply-error')).toContainText('The file changed before the correction was written.');
  if (screenshots) await captureSizes('apply-failed');
  await expect(content.locator('h3')).toHaveCount(0);
  await expect(third()).toHaveText('Third paragraph stays. Edited after.');
  expect(await sameEditor()).toBe(true);
  expect((await applyStates()).at(-1)).toEqual({request: 2, state: 'failed', revision: beforeFailure.revision, message: 'The file changed before the correction was written.'});
  await expect.poll(lastEdit).toMatchObject({state: 'clean', revision: beforeFailure.revision});
  expect((await read(applyPath)).source).toBe(beforeFailure.source);
  // Another revision than the view's is refused without showing anything.
  await page.evaluate(change => globalThis.__viewApply({request: 3, revision: 'f'.repeat(64), change}), convert.change);
  await expect.poll(async () => (await applyStates()).at(-1)).toMatchObject({request: 3, state: 'refused', revision: beforeFailure.revision});
  await expect(content.locator('h3')).toHaveCount(0);
  // A change arriving during an input method composition waits for it to end and keeps the composed text.
  const ime = await page.context().newCDPSession(page);
  await paragraph('Closing paragraph').click();
  await page.keyboard.press('End');
  await ime.send('Input.imeSetComposition', {text: 'ㄱ', selectionStart: 1, selectionEnd: 1});
  await page.waitForFunction(() => document.querySelector('.screen-document-view .document-editor').editor.view.composing);
  const composing = (await applyStates()).length;
  await page.evaluate(([revision, change]) => globalThis.__viewApply({request: 4, revision, change}), [convert.revision, convert.change]);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await applyStates()).length).toBe(composing);
  await ime.send('Input.imeSetComposition', {text: '가나', selectionStart: 2, selectionEnd: 2});
  await ime.send('Input.insertText', {text: '가나'});
  await ime.detach();
  // After the composition the paragraph holds unsaved text, so the change is refused and nothing is lost.
  await expect.poll(async () => (await applyStates()).at(-1)).toMatchObject({request: 4, state: 'refused'});
  await expect(paragraph('Closing paragraph')).toHaveText('Closing paragraph.가나');
  await expect(content.locator('h3')).toHaveCount(0);

  // A document without blocks takes no input: nothing it could hold can be saved.
  config = {path: emptyPath, edit: true, linked: false, revision: '', paths: []};
  await open();
  await expect(view).toHaveAttribute('data-state', 'ready');
  await expect(editor).toHaveAttribute('contenteditable', 'false');

  // ADR-0024: a complex table's merged cells show as in a document tab, and the text of a cell's
  // paragraph and list item is edited in place and saved through the full Save when the block is left.
  const complexPath = [root, 'content-edit', 'complex-table.md'].join(separator);
  const complexBefore = (await read(complexPath)).source;
  config = {path: complexPath, edit: true, linked: false, revision: '', paths: []};
  await page.evaluate(() => { globalThis.__editStates = []; });
  await open();
  const grid = content.locator('[data-block="table"]');
  await expect(grid.locator('th[colspan="2"]')).toHaveText('Range');
  await expect(grid.locator('td[rowspan="2"] > p')).toHaveText(['Output', 'rated']);
  await grid.locator('td > ol > li', {hasText: /^Peak$/}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' value');
  await grid.locator('td > p', {hasText: /^230 V$/}).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' AC');
  await paragraph('Closing paragraph').click();
  await expect.poll(lastEdit).toMatchObject({state: 'clean'});
  expect((await read(complexPath)).source).toBe(complexBefore.replace('<li>Peak</li>', '<li>Peak value</li>').replace('<p>230 V</p>', '<p>230 V AC</p>'));
  if (screenshots) await captureSizes('complex-table');
  // The table is the last block and its last cell is a list: the view adds no paragraph and keeps the
  // list's nesting, so Tab there leaves the editor by the browser's focus order without a notice.
  const lastPath = [root, 'content-edit', 'complex-table-last.md'].join(separator);
  const lastBefore = (await read(lastPath)).source;
  config = {path: lastPath, edit: true, linked: false, revision: '', paths: []};
  await open();
  await content.locator('td > ol > li', {hasText: /^Mean$/}).click();
  await expect.poll(() => editor.evaluate(node => node.editor.view.hasFocus() && node.editor.state.selection.$from.parent.textContent === 'Mean')).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => editor.evaluate(node => node.contains(document.activeElement))).toBe(false);
  await expect(notice).toHaveCount(0);
  expect((await read(lastPath)).source).toBe(lastBefore);

  // About 2,000 blocks, manual review runs only (no pass/fail on time): opening read-only and
  // with content editing, typing and Save.
  if (!screenshots) return;
  const measure = async edit => {
    config = {path: largePath, edit, linked: false, revision: '', paths: []};
    const started = Date.now();
    await open();
    await expect(paragraph('Synthetic passage 1999')).toBeAttached({timeout: 60_000});
    const openMs = Date.now() - started;
    if (!edit) return {openMs};
    await paragraph('Synthetic passage 1001 ').click();
    await page.keyboard.press('End');
    const latencies = await page.evaluate(async () => {
      const node = document.querySelector('.screen-document-view .document-editor');
      const results = [];
      for (let index = 0; index < 10; index++) {
        const before = node.editor.state.doc.content.size;
        const started = performance.now();
        node.editor.view.dom.dispatchEvent(new InputEvent('beforeinput', {inputType: 'insertText', data: 'x', bubbles: true, cancelable: true}));
        document.execCommand('insertText', false, 'x');
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        if (node.editor.state.doc.content.size === before) throw new Error('Typing did not reach the editor');
        results.push(performance.now() - started);
      }
      return results;
    });
    const saveStarted = await page.evaluate(() => performance.now());
    await paragraph('Synthetic passage 1 ').click();
    await expect.poll(async () => (await saves()).length, {timeout: 60_000}).toBe(1);
    const saveMs = (await saves())[0].time - saveStarted;
    const sorted = [...latencies].sort((a, b) => a - b);
    return {openMs, typingMedianMs: sorted[5], typingMaxMs: sorted.at(-1), saveMs};
  };
  const readOnly = await measure(false);
  const editing = await measure(true);
  // A correction shown before its write (#1995): merging two early paragraphs moves every later
  // block, the most a rebase has to relabel. Shown = until the merged block is on screen; settled =
  // from reporting the written revision until the view continues from that file.
  const measureApply = async () => {
    config = {path: largePath, edit: true, linked: false, revision: '', paths: []};
    await open();
    await expect(paragraph('Synthetic passage 1999')).toBeAttached({timeout: 60_000});
    const correction = viewChange(largePath, (sdk, document) => sdk.mergeParagraphWithPrevious(document, [12]));
    const shownMs = await page.evaluate(([revision, change]) => new Promise(resolve => {
      const started = performance.now();
      globalThis.__viewApply({request: 'large', revision, change});
      const check = () => [...document.querySelectorAll('.screen-document-view p')].some(node => node.textContent === change.blocks[0].text)
        ? resolve(performance.now() - started) : requestAnimationFrame(check);
      requestAnimationFrame(check);
    }), [correction.revision, correction.change]);
    const writeStarted = Date.now();
    const written = correction.write();
    const writeMs = Date.now() - writeStarted;
    const settleStarted = await page.evaluate(([revision, change, saved]) => {
      globalThis.__viewApply({request: 'large', revision, change, saved});
      return performance.now();
    }, [correction.revision, correction.change, written]);
    await expect.poll(() => page.evaluate(() => globalThis.__applyStates?.at(-1)?.state), {timeout: 60_000}).toBe('saved');
    const settledMs = (await page.evaluate(() => globalThis.__applyStates.at(-1).time)) - settleStarted;
    return {shownMs, writeMs, settledMs};
  };
  const apply = [await measureApply(), await measureApply()];
  return {large: {blocks: 2000, readOnly, editing, apply}};
}
