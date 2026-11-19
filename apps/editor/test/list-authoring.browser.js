// Run with pnpm browser:test list-authoring.
// Edits list items with the keyboard (Enter, Tab, Enter on an empty item), inserts a numbered
// list from the slash menu, joins the line after a list into its last item with Backspace
// (#1821), also right after Home on a paragraph with inline atoms, saves the scratch Markdown
// files, and reloads them.
async (page, { openDocument, withBlockHover }) => {
  await page.unrouteAll();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready');

  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const scratch = (name) => [root, 'tmp', 'list-authoring', name].join(separator);
  const markdown = async (name = 'lists.md') => {
    const response = await page.request.get(`${origin}/document/${name}?path=${encodeURIComponent(scratch(name))}`, { headers: { Connection: "close" } });
    if (response.status() !== 200) throw new Error(`Prepare ${scratch(name)} first`);
    return (await response.text()).replaceAll('\r\n', '\n');
  };
  const fresh = '---\nlitzio: 1\n---\n\n# Lists\n\nIntro paragraph.\n\n- Wire\n- Power\n\nDone.\n';
  if (await markdown() !== fresh) throw new Error('Scratch document is not a fresh list fixture');
  const inlineParagraph = '**Bold** and *italic*, [manual](https://a.example), $x$[^n], {cite}`Alpha`, {eq}`eq-a`.';
  const inlineTail = ['', '```{math}', ':label: eq-a', '', 'a = b', '```', '', 'Guard.', '', '[^n]: Note.', ''];
  const inlineFresh = ['---', 'litzio: 1', '---', '', '# Lists', '', '- Outer', '  - Middle', '    - Deep', '', inlineParagraph, ...inlineTail].join('\n');
  if (await markdown('list-inline.md') !== inlineFresh) throw new Error('Scratch document is not a fresh inline list fixture');

  const openScratch = async (name = 'lists.md') => {
    await openDocument(page, scratch(name));
    await page.waitForFunction((name) =>
      document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready' &&
      document.querySelector('[data-testid="current-file"]')?.getAttribute('title')?.includes(name), name);
  };
  // Place the caret after a text block's content, like continuous-editing; keys are real.
  const caretAtEnd = async (text) => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate((element, text) => {
    const editor = element.editor;
    let position;
    editor.state.doc.descendants((node, pos) => {
      if (position === undefined && node.isTextblock && node.textContent === text) position = pos + 1 + node.content.size;
    });
    if (position === undefined) throw new Error(`Missing text block ${text}`);
    editor.commands.setTextSelection(position);
    editor.view.focus();
  }, text);
  // Top-level blocks as nested text, plus the caret's text block and offset.
  const shape = async () => page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(element => {
    const { state } = element.editor;
    const show = node => node.isTextblock ? JSON.stringify(node.textContent)
      : `${node.type.name}[${node.content.content.map(show).join(',')}]`;
    const { $from } = state.selection;
    return { doc: state.doc.content.content.map(show).join(' '), caret: `${JSON.stringify($from.parent.textContent)}@${$from.parentOffset}` };
  });
  const sameShape = (actual, doc, caret) => actual.doc === doc && actual.caret === caret;

  await openScratch();
  const editor = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  const list = editor.locator('ul[data-block="list"]').first();
  await list.waitFor({state:'visible'});
  const openedEditable = await list.locator(':scope > li').count() === 2;

  // Enter after "Wire" starts a new item; Tab nests it below "Wire".
  await caretAtEnd('Wire');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Check');
  await page.keyboard.press('Tab');
  const nested = list.locator(':scope > li').first().locator('ul[data-block="list"] > li');
  await nested.waitFor({state:'visible'});
  const tabNested = await nested.count() === 1 && await nested.innerText() === 'Check';
  // Hovering a nested item uses the top-level list's gutter extent, never the inner item.
  await withBlockHover(page, async () => {
    await nested.hover();
    const extent = page.getByTestId('block-hover-outline');
    await extent.waitFor();
    const listBox = await list.boundingBox(), extentBox = await extent.boundingBox();
    const gaps = await extent.evaluate(n => {
      const probe = document.createElement('span');
      probe.style.padding = 'var(--space-block-hover-block) var(--space-block-hover-inline)';
      n.append(probe); const style = getComputedStyle(probe);
      const result = {inline:parseFloat(style.paddingLeft), block:parseFloat(style.paddingTop)};
      probe.remove(); return result;
    });
    const expectedExtent = {x:listBox.x - gaps.inline, y:listBox.y - gaps.block,
      width:listBox.width + 2 * gaps.inline, height:listBox.height + 2 * gaps.block};
    if (!['x','y','width','height'].every(k => Math.abs(expectedExtent[k] - extentBox[k]) < 0.1)) {
      throw new Error(`Nested item hover must outline the top-level list: ${JSON.stringify({listBox,extentBox})}`);
    }
  });

  // Enter twice after "Power": the empty item leaves the list as a paragraph.
  // Backspace on that empty line removes it and returns to the end of "Power" without
  // adding an item (#1821); Enter twice leaves the list again.
  await caretAtEnd('Power');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const emptyLine = await shape();
  await page.keyboard.press('Backspace');
  const backspacedEmptyLine = await shape();
  const emptyLineRemoved = emptyLine.doc.includes('"Power"]] "" "Done."') &&
    sameShape(backspacedEmptyLine, emptyLine.doc.replace('"Power"]] "" "Done."', '"Power"]] "Done."'), '"Power"@5');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('After list');
  const exitedList = await list.locator(':scope > li').count() === 2 &&
    await editor.locator(':scope .document-editor > p', {hasText:'After list'}).count() === 1;

  // The slash menu inserts a numbered list after the intro.
  await caretAtEnd('Intro paragraph.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/numbered');
  await page.getByRole('menu', {name:'Insert block'}).getByRole('menuitem', {name:'Numbered list', exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Enter');
  await page.keyboard.type('First');
  const numbered = editor.locator('ol[data-block="list"] > li');
  await numbered.waitFor({state:'visible'});
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent?.trim() === 'Unsaved changes');

  // Below a numbered list whose last item has a nested list, Backspace at the start of a
  // written line appends its text to the visually last item (#1821). Typed at a person's
  // speed, Home and Backspace fall inside history's 500 ms grouping window, yet the join is
  // its own Undo step: one Undo restores the separate line with its typed text.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Inner');
  await page.keyboard.press('Tab');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await page.keyboard.type('Tail', {delay:110});
  await page.waitForTimeout(110);
  await page.keyboard.press('Home');
  await page.waitForTimeout(110);
  const writtenLine = await shape();
  await page.keyboard.press('Backspace');
  const joined = await shape();
  const joinedDoc = writtenLine.doc.replace('"Inner"]]]] "Tail" bulletList', '"InnerTail"]]]] bulletList');
  const joinedLastItem = writtenLine.doc.includes('orderedList[listItem["First",orderedList[listItem["Inner"]]]] "Tail" bulletList') &&
    sameShape(joined, joinedDoc, '"InnerTail"@5');
  await page.keyboard.press('Control+z');
  const undone = await shape();
  await page.keyboard.press('Control+Shift+z');
  const redone = await shape();
  const joinUndoRedo = undone.doc === writtenLine.doc && redone.doc === joinedDoc;

  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor({state:'attached'});
  if (await page.getByTestId('status').getAttribute('data-operation') !== 'saved') {
    throw new Error(`Save failed: ${await page.locator('body').innerText()}`);
  }
  const saved = await markdown();
  const expected = [
    '---', 'litzio: 1', '---', '',
    '# Lists',
    '',
    'Intro paragraph.',
    '',
    '1.  First',
    '',
    '    1.  InnerTail',
    '',
    '*   Wire',
    '',
    '    *   Check',
    '*   Power',
    '',
    'After list',
    '',
    'Done.',
    '',
  ].join('\n');

  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready');
  await openScratch();
  const reloaded = page.locator('[data-document-tab][data-active=true]').getByTestId('document-editor');
  await reloaded.locator('ul[data-block="list"]').first().waitFor({state:'visible'});
  const reopened = await shape();
  const reloadedNested = await reloaded.locator('ul[data-block="list"] ul[data-block="list"] > li').innerText() === 'Check';

  // A click in a paragraph holding inline atoms, then Home and Backspace with no pause: the
  // Backspace can arrive before Home's selectionchange. The join still uses the moved caret
  // and keeps every inline node and the endnote definition through Save and reopen (#1821).
  await openScratch('list-inline.md');
  const inlineEditor = page.locator('[data-document-tab][data-active=true] .document-editor');
  await inlineEditor.locator(':scope > p').filter({hasText:'Bold'}).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  const inlineJoined = await shape();
  const inlineAtoms = await inlineEditor.evaluate(element => {
    const names = [];
    element.editor.state.doc.descendants(node => { if (node.isInline && !node.isText) names.push(node.type.name); });
    return names.join(',');
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent?.trim() === 'Unsaved changes');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor({state:'attached'});
  const inlineSaved = await markdown('list-inline.md');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.getAttribute('data-operation') === 'ready');
  await openScratch('list-inline.md');
  await page.locator('[data-document-tab][data-active=true] .document-editor ul').first().waitFor({state:'visible'});
  const inlineReopened = await shape();
  const inlineExpected = ['---', 'litzio: 1', '---', '', '# Lists', '', '*   Outer', '', '    *   Middle', '',
    '        *   Deep' + inlineParagraph, ...inlineTail].join('\n');

  const result = {
    openedEditable,
    tabNested,
    emptyLineRemoved,
    exitedList,
    joinedLastItem,
    joinUndoRedo,
    savedAsCanonicalMarkdown: saved === expected,
    reopenedSameLists: reopened.doc === redone.doc,
    reloadedNested,
    inlineAtomsKept: inlineAtoms === 'inlineMath,footnoteReference,citation,crossReference' &&
      inlineJoined.caret.startsWith('"DeepBold and italic') && inlineJoined.caret.endsWith('@4'),
    inlineSavedCanonical: inlineSaved === inlineExpected,
    inlineReopenedSame: inlineReopened.doc === inlineJoined.doc,
  };
  const failed = Object.entries(result).filter(([, value]) => value !== true);
  if (failed.length > 0) throw new Error(`List authoring failed: ${JSON.stringify({result, saved, emptyLine, backspacedEmptyLine, writtenLine, joined, undone, redone, reopened, inlineJoined, inlineAtoms, inlineSaved, inlineReopened})}`);
  return result;
}
