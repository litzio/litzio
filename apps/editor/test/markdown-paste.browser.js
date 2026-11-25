// Clipboard text read by Core, including literal paste, restricted editing places,
// linkification, history and composition.
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
  const markdownFile = [root, 'tmp', 'markdown-paste', 'markdown.md'].join(separator);
  await openPath(page, markdownFile);
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
  const messageBody = notice.locator('p').first();
  const syntheticPaste = html => editor.evaluate((el, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html); data.setData('text/plain', 'Plain fallback');
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, html);
  const source = async marker => {
    await page.getByTestId('view-source').click();
    await page.waitForFunction(marker => document.querySelector('[data-testid="source-view"] pre')?.textContent.includes(marker), marker);
    const text = (await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    return text;
  };
  const result = {};

  const outline = () => editor.evaluate(el => {
    const blocks = [];
    el.editor.state.doc.forEach(node => {
      const marks = new Set();
      node.descendants(child => child.marks.forEach(mark => marks.add(mark.type.name)));
      blocks.push([node.type.name + (node.attrs.level ?? ''), node.textContent, [...marks].join()].join('|'));
    });
    return blocks;
  });
  const caretIn = (text, offset = 0) => editor.evaluate((el, args) => {
    let from;
    el.editor.state.doc.descendants((node, pos) => { if (from === undefined && node.isTextblock && node.textContent === args.text) from = pos + 1; });
    if (from === undefined) throw new Error(`Missing ${args.text}`);
    el.editor.commands.setTextSelection(from + args.offset); el.editor.view.focus();
  }, {text, offset});
  const textPaste = text => editor.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
  }, text);
  const writeText = text => page.evaluate(text => navigator.clipboard.writeText(text), text);
  const changedFrom = before => page.waitForFunction(doc => JSON.stringify(document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.getJSON(),
    (key, value) => ['sourcePath', 'original', 'sourceCell'].includes(key) ? undefined : value) !== doc, before.doc);
  const owner = '# 측정시스템 분석 구술평가\n\n## 발표 흐름\n\n**MSA 목적 → 변동 요인 → 판정 기준**\n\n' +
    '1. **MSA 목적:** 측정값을 믿을 수 있는지 확인한다.\n2. **반복성:** 같은 사람이 같은 부품을 여러 번 잰다.\n' +
    '3. **재현성:** 다른 사람이 같은 부품을 잰다.\n4. **편의:** 기준값과 평균의 차이를 본다.\n' +
    '5. **선형성:** 범위 전체에서 편의가 변하는지 본다.\n6. **판정:** %GRR이 10% 이하이면 적합하다.\n\n' +
    '## 구술 대본\n\n오늘은 **측정시스템 분석**의 목적부터 말씀드리겠습니다.\n\n측정값의 변동에는 **부품 변동**과 **측정 변동**이 섞여 있습니다.\n';
  await notice.waitFor({state:'detached', timeout:10000});
  await select('Alpha.', true);
  const beforeMarkdown = await state();
  await writeText(owner);
  await page.keyboard.press('Control+v');
  await changedFrom(beforeMarkdown);
  const markdownPasted = await state();
  const pastedOutline = await outline();
  const list = pastedOutline[4] ?? '';
  assert(JSON.stringify([...pastedOutline.slice(0, 4), ...pastedOutline.slice(5, 8)]) === JSON.stringify(['heading1|Markdown|', 'heading1|측정시스템 분석 구술평가|',
    'heading2|발표 흐름|', 'paragraph|MSA 목적 → 변동 요인 → 판정 기준|bold', 'heading2|구술 대본|',
    'paragraph|오늘은 측정시스템 분석의 목적부터 말씀드리겠습니다.|bold', 'paragraph|측정값의 변동에는 부품 변동과 측정 변동이 섞여 있습니다.|bold']) &&
    list.startsWith('orderedList|MSA 목적: 측정값을') && list.endsWith('|bold') && await editor.locator('ol > li').count() === 6,
    `Markdown text must paste as headings, a numbered list and bold text: ${JSON.stringify(pastedOutline)}`);
  assert(await notice.count() === 0, 'Supported Markdown pastes without a notice');
  await page.keyboard.press('Control+z');
  const markdownUndone = await state();
  assert(markdownUndone.doc === beforeMarkdown.doc && markdownUndone.selection.join() === beforeMarkdown.selection.join(),
    `One Undo must restore the Markdown paste: ${JSON.stringify({beforeMarkdown, markdownUndone})}`);
  await page.keyboard.press('Control+Shift+z');
  assert((await state()).doc === markdownPasted.doc, 'Redo must restore the whole Markdown paste');
  const markdownPreview = await source('구술 대본');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor();
  assert(await page.getByTestId('status').getAttribute('data-operation') === 'saved', `Markdown paste Save failed: ${await page.locator('body').innerText()}`);
  const markdownDisk = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(markdownFile)}`, { headers: { Connection: "close" } })).json()).source.replaceAll('\r\n', '\n');
  // Core's canonical write of the same Markdown in place of "Alpha.".
  const markdownSaved = '---\nlitzio: 1\n---\n\n# Markdown\n\n# 측정시스템 분석 구술평가\n\n## 발표 흐름\n\n**MSA 목적 → 변동 요인 → 판정 기준**\n\n' +
    '1.  **MSA 목적:** 측정값을 믿을 수 있는지 확인한다.\n2.  **반복성:** 같은 사람이 같은 부품을 여러 번 잰다.\n' +
    '3.  **재현성:** 다른 사람이 같은 부품을 잰다.\n4.  **편의:** 기준값과 평균의 차이를 본다.\n' +
    '5.  **선형성:** 범위 전체에서 편의가 변하는지 본다.\n6.  **판정:** %GRR이 10% 이하이면 적합하다.\n\n' +
    '## 구술 대본\n\n오늘은 **측정시스템 분석**의 목적부터 말씀드리겠습니다.\n\n측정값의 변동에는 **부품 변동**과 **측정 변동**이 섞여 있습니다.\n\n' +
    'Inline `mono` text.\n\n```\ncode\n```\n\n:::{table}\n\n| A | B |\n| - | - |\n| c | d |\n:::\n\nOmega.\n';
  assert(markdownDisk === markdownPreview && markdownDisk === markdownSaved, `Markdown paste must save Core's canonical Markdown: ${JSON.stringify(markdownDisk)}`);
  // Reload hands focus back to File actions late; the keyboard steps below must not race it.
  await reloadDocument(page);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  assert((await state()).doc === markdownPasted.doc, 'Reload must retain the pasted Markdown structure');
  result.markdownSaveReload = true;

  // Ctrl+Shift+V keeps the characters; text without Markdown syntax pastes exactly as before.
  const pasteBoth = async text => {
    await select('Omega.');
    const before = await state();
    await writeText(text);
    const paste = async key => {
      await page.keyboard.press(key);
      await changedFrom(before);
      const pasted = await outline();
      await page.keyboard.press('Control+z');
      assert((await state()).doc === before.doc, `One Undo restores the ${key} paste`);
      return pasted;
    };
    return {plain: await paste('Control+Shift+v'), auto: await paste('Control+v')};
  };
  const literal = await pasteBoth('# 제목 **굵게**\n1. 항목');
  assert(JSON.stringify(literal.plain.slice(-2)) === JSON.stringify(['paragraph|# 제목 **굵게**|', 'paragraph|1. 항목Omega.|']) &&
    JSON.stringify(literal.auto.slice(-3)) === JSON.stringify(['heading1|제목 굵게|bold', 'orderedList|항목|', 'paragraph|Omega.|']),
    `Ctrl+Shift+V must paste Markdown characters as they are: ${JSON.stringify(literal)}`);
  const prose = await pasteBoth('첫 줄입니다.\n둘째 줄 (5 * 3) - 1입니다.\n\n셋째 문단.');
  assert(JSON.stringify(prose.auto) === JSON.stringify(prose.plain) && prose.auto.includes('paragraph|둘째 줄 (5 * 3) - 1입니다.|'),
    `Text without Markdown syntax must paste as plain text did: ${JSON.stringify(prose)}`);
  result.markdownPlainPaste = true;

  // Code blocks and inline code keep pasted Markdown as characters.
  for (const [text, at, expected] of [['# 제목\n**굵게**', () => caretIn('code'), 'codeBlock|# 제목\n**굵게**code|'],
    ['# 제목 **굵게**', () => caretIn('Inline mono text.', 'Inline m'.length), 'paragraph|Inline m# 제목 **굵게**ono text.|code']]) {
    await at();
    const before = await state();
    await textPaste(text);
    const after = await outline();
    assert(after.includes(expected), `Code places keep pasted Markdown literal: ${JSON.stringify(after)}`);
    await editor.evaluate(el => el.editor.commands.undo());
    assert((await state()).doc === before.doc, 'One Undo restores a literal code paste');
  }
  result.markdownCode = true;

  // A table cell takes inline Markdown, and refuses blocks as it refuses the same structure from external HTML.
  await caretIn('c');
  const beforeCell = await state();
  await textPaste('**굵게** 글');
  const cellInline = (await state()).doc;
  assert(cellInline.includes('{"type":"text","marks":[{"type":"bold"}],"text":"굵게"},{"type":"text","text":" 글c"}'), `A table cell keeps inline Markdown: ${cellInline}`);
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeCell.doc, 'One Undo restores the table cell paste');
  const refusedInCell = async paste => {
    await notice.waitFor({state:'detached', timeout:10000});
    await caretIn('c');
    const before = await state();
    await paste();
    await showNotifications(page);
    const message = await messageBody.innerText();
    const after = await state();
    assert(after.doc === before.doc && after.selection.join() === before.selection.join(), `Blocks in a table cell are refused: ${message}`);
    return message;
  };
  const cellMarkdown = await refusedInCell(() => textPaste('# 제목\n\n문단'));
  const cellHTML = await refusedInCell(() => syntheticPaste('<h1>제목</h1><p>문단</p>'));
  assert(cellMarkdown && cellMarkdown === cellHTML, `Blocks in a table cell follow the external HTML rule: ${JSON.stringify({cellMarkdown, cellHTML})}`);
  result.markdownTableCell = true;

  // Endnotes take the existing clipboard label plan: a second paste of label 1 with other content is renamed.
  await select('Omega.');
  const beforeNotes = await state();
  await textPaste('첫 문장[^1].\n\n[^1]: 첫 주석.');
  // The caret stays after the first paste, before "Omega.".
  await textPaste('둘째 문장[^1].\n\n[^1]: 둘째 주석.');
  const notes = await editor.evaluate(el => {
    const found = [];
    el.editor.state.doc.descendants(node => {
      if (['footnoteReference', 'footnoteDefinition'].includes(node.type.name)) found.push(`${node.type.name}:${node.attrs.label}:${node.textContent}`);
    });
    return found;
  });
  assert(JSON.stringify(notes) === JSON.stringify(['footnoteReference:1:', 'footnoteReference:2:', 'footnoteDefinition:1:첫 주석.', 'footnoteDefinition:2:둘째 주석.']),
    `Pasted Markdown endnotes keep their definitions under distinct labels: ${JSON.stringify(notes)}`);
  await editor.evaluate(el => { el.editor.commands.undo(); el.editor.commands.undo(); });
  assert((await state()).doc === beforeNotes.doc, 'Two Undo steps restore two endnote pastes');
  result.markdownEndnotes = true;

  // All or nothing: text Core does not read as a whole (a checkbox on a numbered item, link reference
  // definitions, comments, block breaks, a leading thematic break before a definition), or whose
  // conversion names a cross-reference target (a section or Table label), pastes exactly as Ctrl+Shift+V
  // does, without a notice; never as nothing.
  await notice.waitFor({state:'detached', timeout:10000});
  for (const text of ['**지원** 문단\n\n1. [ ] 할 일', '**a** [x][r]\n\n[r]: https://example.com/r', '**a**\n\n% 주석\n\nb', '**a**\n\n+++\n\nb',
    '---\n> [r]: https://example.com/r\n---\n\n**b**', '(clause)=\n# Power quality\n\nSee {ref}`clause`.',
    ':::{table}\n:name: tab-data\n\n| B |\n| - |\n| y |\n:::']) {
    const both = await pasteBoth(text);
    assert(JSON.stringify(both.auto) === JSON.stringify(both.plain) && both.auto.some(block => block.includes(text.split('\n')[0])),
      `Text Core does not read as a whole pastes as plain text: ${JSON.stringify(both)}`);
    assert(await notice.count() === 0, `No notice for a plain-text paste: ${text}`);
  }
  result.markdownAllOrNothing = true;

  // Review regressions (#1844) use a document with labelled blocks and an endnote.
  const placesFile = [root, 'tmp', 'clipboard-places', 'places.md'].join(separator);
  await openPath(page, placesFile);
  await editor.locator('[data-block="table"]').waitFor();
  const refusedAt = async (text, offset, paste, message) => {
    await notice.waitFor({state:'detached', timeout:10000});
    await caretIn(text, offset);
    const before = await state();
    await paste();
    // Read before opening the notification list: leaving the editor ends endnote editing.
    const after = await state();
    assert(after.doc === before.doc && after.selection.join() === before.selection.join(), `${text}: a refused paste keeps the document and selection`);
    await showNotifications(page);
    await notice.filter({hasText:message}).waitFor({state:'visible'});
  };
  const lineBreaks = place => `A ${place} cannot contain line breaks. Paste into a paragraph to keep them.`;
  const oneLine = 'Only inline content can be pasted here. Paste blocks into a paragraph.';
  // A literal soft newline still cannot be pasted into a cell. Use a hard break there.
  await refusedAt('CellText', 4, () => textPaste('**bold**\nMore'), 'A table cell needs hard line breaks. Use Shift+Enter in the cell.');
  await refusedAt('CaptionText', 4, () => textPaste('**bold**\nMore'), lineBreaks('table caption'));
  await refusedAt('CaptionText', 4, () => textPaste('# Pasted\n\nAfter'), oneLine);
  await refusedAt('CaptionText', 4, () => syntheticPaste('<h1>Pasted</h1><p>After</p>'), oneLine);
  // A definition being edited does not take another endnote.
  await editor.locator('[data-testid="footnote-definition"]').getByTestId('endnote-edit').click();
  await refusedAt('NoteText', 4, () => textPaste('Other[^a].\n\n[^a]: Definition'), 'An endnote cannot contain another endnote.');
  result.markdownOneLinePlaces = true;

  // URLs: clipboard text that is one URL becomes a link (also with Ctrl+Shift+V and over a
  // selection), a URL in external HTML text too; a link already read keeps its target and title;
  // code stays text, and nothing outside the paste joins a link.
  const linksIn = marker => editor.evaluate((el, marker) => {
    let found;
    el.editor.state.doc.descendants(node => { if (!found && node.isTextblock && node.textContent.includes(marker)) found = node; });
    const runs = [];
    found?.forEach(child => runs.push([child.text, child.marks.map(mark => mark.type.name === 'link' ? `link ${mark.attrs.href} ${mark.attrs.title ?? ''}`.trim() : mark.type.name).join()]));
    return JSON.stringify(runs);
  }, marker);
  const url = 'https://example.com/path';
  for (const [name, place, paste, marker, expected] of [
    ['text', () => select('Omega.'), () => textPaste(url), 'example.com', [[url, `link ${url}`], ['Omega.', '']]],
    ['plain key', () => select('Omega.'), async () => { await writeText(url); await page.keyboard.press('Control+Shift+v'); }, 'example.com', [[url, `link ${url}`], ['Omega.', '']]],
    ['selection', () => caretIn('Omega.', 0).then(() => editor.evaluate(el => el.editor.commands.setTextSelection({from: el.editor.state.selection.from, to: el.editor.state.selection.from + 5}))),
      () => textPaste(url), 'example.com', [[url, `link ${url}`], ['.', '']]],
    ['html text', () => select('Omega.'), () => syntheticPaste(`<p>see ${url}</p>`), 'see', [['see ', ''], [url, `link ${url}`], ['Omega.', '']]],
    ['html link', () => select('Omega.'), () => syntheticPaste(`<a href="https://example.org/target" title="Keep">${url}</a>`), 'example.com',
      [[url, 'link https://example.org/target Keep'], ['Omega.', '']]],
    ['markdown link', () => select('Omega.'), () => textPaste(`[${url}](https://example.org/target "Keep")`), 'example.com',
      [[url, 'link https://example.org/target Keep'], ['Omega.', '']]],
    ['inline code', () => caretIn('Inline mono text.', 'Inline m'.length), () => textPaste(url), 'Inline', [['Inline ', ''], [`m${url}ono`, 'code'], [' text.', '']]],
    ['definition line', () => caretIn('LeftRIGHT', 'Left'.length), () => textPaste(`[url]: ${url}`), 'Left', [['Left[url]: ', ''], [url, `link ${url}`], ['RIGHT', '']]],
    // A URL inside pasted text links only itself: "RIGHT" right after it stays document text.
    ['sentence', () => caretIn('LeftRIGHT', 'Left'.length), () => textPaste(`see ${url}`), 'Left', [['Leftsee ', ''], [url, `link ${url}`], ['RIGHT', '']]],
    ['markdown sentence', () => select('Omega.'), () => textPaste(`**b** see ${url}`), 'see', [['b', 'bold'], [' see ', ''], [url, `link ${url}`], ['Omega.', '']]],
    // Formatting inside a URL keeps the formatting and the whole URL's one target.
    ['html split bold', () => select('Omega.'), () => syntheticPaste('<p><strong>https://</strong>example.com/path</p>'), 'example.com',
      [['https://', `link ${url},bold`], ['example.com/path', `link ${url}`], ['Omega.', '']]],
    ['html split italic', () => select('Omega.'), () => syntheticPaste('<p>https://example.com/<em>path</em></p>'), 'example.com',
      [['https://example.com/', `link ${url}`], ['path', `link ${url},italic`], ['Omega.', '']]],
    ['markdown split italic', () => select('Omega.'), () => textPaste('https://example.com/*path*'), 'example.com',
      [['https://example.com/', `link ${url}`], ['path', `link ${url},italic`], ['Omega.', '']]],
    ['drop', () => select('Omega.'), async () => {
      const box = await editor.locator('p').filter({hasText:'Omega.'}).boundingBox();
      await editor.evaluate((el, args) => {
        const data = new DataTransfer();
        data.setData('text/plain', `see ${args.url}`);
        el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
      }, {url, x:box.x + 1, y:box.y + box.height / 2});
    }, 'see', [['see ', ''], [url, `link ${url}`], ['Omega.', '']]],
  ]) {
    await place();
    const before = await state();
    await paste();
    await changedFrom(before);
    const runs = await linksIn(marker);
    assert(runs === JSON.stringify(expected), `${name}: ${runs}`);
    await editor.evaluate(el => el.editor.commands.undo());
    assert((await state()).doc === before.doc, `${name}: one Undo restores the URL paste`);
  }
  result.markdownUrl = true;

  // A paste is its own Undo step, apart from typing just before it.
  for (const [typed, paste] of [['!', () => textPaste('**bold**')], ['?', () => syntheticPaste('<p><b>bold</b></p>')]]) {
    await caretIn('LeftRIGHT', 'Left'.length);
    await page.keyboard.type(typed);
    await paste();
    const pastedText = await outline();
    assert(pastedText.includes(`paragraph|Left${typed}boldRIGHT|bold`), `The paste follows the typed text: ${JSON.stringify(pastedText)}`);
    await page.keyboard.press('Control+z');
    const once = await outline();
    assert(once.includes(`paragraph|Left${typed}RIGHT|`), `One Undo removes only the paste: ${JSON.stringify(once)}`);
    await page.keyboard.press('Control+z');
    assert((await outline()).includes('paragraph|LeftRIGHT|'), 'A second Undo removes the typing');
  }
  result.markdownHistory = true;

  // A paste skipped during composition leaves no state behind: a later text drop stays literal.
  await select('Omega.');
  const beforeDrop2 = await state();
  await editor.evaluate(el => {
    const dom = el.editor.view.dom, data = new DataTransfer();
    data.setData('text/plain', '**skipped**');
    dom.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true, data:''}));
    dom.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
    dom.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true, data:''}));
  });
  await page.waitForFunction(() => !document.querySelector('[data-document-tab][data-active=true] .document-editor').editor.view.composing);
  const omega = await editor.locator('p').filter({hasText:'Omega.'}).boundingBox();
  await editor.evaluate((el, args) => {
    const data = new DataTransfer();
    data.setData('text/plain', '## DragHeading');
    el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
  }, {x:omega.x + 5, y:omega.y + omega.height / 2});
  await changedFrom(beforeDrop2);
  const dropped = await outline();
  assert(dropped.some(block => block.startsWith('paragraph|') && block.includes('## DragHeading')) && !dropped.some(block => block.startsWith('heading2|')),
    `Dropped text stays literal after a skipped paste: ${JSON.stringify(dropped)}`);
  await editor.evaluate(el => el.editor.commands.undo());
  assert((await state()).doc === beforeDrop2.doc, 'One Undo restores the drop');
  result.markdownComposition = true;

  return result;
}
