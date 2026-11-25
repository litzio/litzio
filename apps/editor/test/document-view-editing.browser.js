// Content editing in a plugin document view (#1976) against the production HTTP Host:
// in-place edits save through the official write path when the edited block is left,
// structural changes are refused with a notice, saves keep targets and correspondences,
// outside changes conflict without overwriting, and Korean composition saves once.
async (page, {expect, screenshots, pluginFixture}) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document', {headers: {Connection: 'close'}})).json();
  const root = initial.allowedRoots[0];
  const separator = root.includes('\\') ? '\\' : '/';
  const documentPath = [root, 'content-edit', 'content.md'].join(separator);
  const largePath = [root, 'content-edit', 'large.md'].join(separator);
  const endnotePath = [root, 'content-edit', 'endnote.md'].join(separator);
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
    React.useEffect(()=>{globalThis.__viewReload=()=>setReload(value=>value+1);globalThis.__viewTarget=setTarget;globalThis.__viewEditing=setEditing;},[]);
    const record=name=>value=>{(globalThis[name]??=[]).push({...value,time:performance.now()});};
    const document={path:config.path,editContent:editing,reloadKey:reload,height:480,target,label:'Converted document',
      onStateChange:record('__viewStates'),onEditStateChange:value=>{setEdit(value);record('__editStates')(value);},
      onSave:record('__saves'),onBlockClick:record('__clicks')};
    const labels={clean:'Saved',unsaved:'Unsaved changes',saving:'Saving',failed:'Not saved',conflict:'Changed elsewhere'};
    const tones={clean:'ok',unsaved:'neutral',saving:'progress',failed:'error',conflict:'warning'};
    const status=edit?React.createElement(ui.Status,{variant:'plain',tone:tones[edit.state],label:labels[edit.state]}):null;
    const items=config.paths.map((path,index)=>({id:String(index),label:'Source '+(index+1),path,colorToken:'--id-color-info',boxes:[{left:16,top:16+index*64,width:160,height:48}]}));
    const source=React.createElement('div',{style:{position:'relative',height:32+items.length*64}},items.map(item=>React.createElement(ui.Button,{key:item.id,'data-linked-item':item.id,'aria-pressed':selected===item.id,
      onClick:()=>setSelected(item.id),style:{position:'absolute',...item.boxes[0],justifyContent:'start'}},item.label)));
    const body=config.linked?React.createElement(ui.LinkedDocumentView,{document,revision:config.revision,source,sourceLabel:'Source pages',items,selectedId:selected,onSelect:setSelected})
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
  await paragraph('The first paragraph').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Later.');
  await paragraph('Closing paragraph').click();
  await expect.poll(disk).toContain('has a typo. Later.');
  await paragraph('The first paragraph').click();
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

  // A document without blocks takes no input: nothing it could hold can be saved.
  config = {path: emptyPath, edit: true, linked: false, revision: '', paths: []};
  await open();
  await expect(view).toHaveAttribute('data-state', 'ready');
  await expect(editor).toHaveAttribute('contenteditable', 'false');

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
  return {large: {blocks: 2000, readOnly, editing}};
}
