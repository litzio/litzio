// External (web, Notion, Word) HTML clipboard normalized to supported blocks: the OS clipboard
// with notice, one Undo/Redo, Save/Reload and canonical Markdown; representative sources; refusals.
// Plain-text Markdown read by Core: structure, Undo, Save/Reload, Ctrl+Shift+V and literal places.
async (page, { showNotifications, openPath, reloadDocument }) => {
  await page.unrouteAll();
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const defaultPath = (await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json()).path;
  const separator = defaultPath.includes('\\') ? '\\' : '/';
  const root = defaultPath.split(separator).slice(0, -4).join(separator);
  const file = [root, 'tmp', 'external-html-paste', 'external.md'].join(separator);
  await openPath(page, file);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const editor = page.locator('[data-document-tab][data-active=true] .document-editor');
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
  // A drop at the start of the "Omega." paragraph, from outside the editor's own drag.
  const syntheticDrop = async (type, value) => {
    const box = await editor.locator('p').filter({hasText:'Omega.'}).boundingBox();
    await editor.evaluate((el, args) => {
      const data = new DataTransfer();
      data.setData(args.type, args.value);
      el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
    }, {type, value, x:box.x + 1, y:box.y + box.height / 2});
  };
  const source = async marker => {
    await page.getByTestId('view-source').click();
    await page.waitForFunction(marker => document.querySelector('[data-testid="source-view"] pre')?.textContent.includes(marker), marker);
    const text = (await page.locator('[data-document-tab][data-active=true]').getByTestId('source-view').locator('pre').textContent()).replaceAll('\r\n', '\n');
    await page.getByTestId('view-visual').click();
    return text;
  };
  const result = {};

  // A. The OS clipboard: a single paste transaction, its notice, one Undo/Redo, Save and Reload.
  const web = '<meta charset="utf-8"><h2>Web <em>heading</em></h2>' +
    '<p>Text with <strong>bold <em>both</em></strong>, <s>gone</s>, <code>x = 1</code> and <a href="https://example.com/a" title="Example">a link</a>.</p>' +
    '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol start="3"><li>Third</li></ol>' +
    '<blockquote><p>Quoted <span style="color:#c00">red</span> text.</p></blockquote>' +
    // Inline semantics Litzio cannot express keep their text, with a notice.
    '<p>Press <kbd>Ctrl+C</kbd> and see <cite>Example</cite>.</p>' +
    '<pre><code class="language-python">def f():\n    return 1\n</code></pre><hr>' +
    '<table><thead><tr><th align="right">Key</th><th>Value</th></tr></thead><tbody><tr><td align="right">a</td><td>1</td></tr></tbody></table>';
  await select('Alpha.', true);
  const before = await state();
  await page.evaluate(async html => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], {type:'text/html'}), 'text/plain': new Blob(['Web heading'], {type:'text/plain'}),
  })]), web);
  await page.keyboard.press('Control+v');
  await showNotifications(page);
  await notice.filter({hasText:'Pasted with normalization: unsupported semantic formatting became plain text; unsupported visual styles were removed.'}).waitFor({state:'visible'});
  const pasted = await state();
  assert(pasted.doc !== before.doc, 'External HTML must paste');
  assert(await editor.locator('[data-block="table"]').getByLabel('Table caption', {exact:true}).count() === 1,
    'Pasted tables must expose the empty caption immediately, before Save/Reload');
  await page.keyboard.press('Control+z');
  const undone = await state();
  assert(undone.doc === before.doc && undone.selection.join() === before.selection.join(), `One Undo must restore content and selection: ${JSON.stringify({before, undone})}`);
  await page.keyboard.press('Control+Shift+z');
  assert((await state()).doc === pasted.doc, 'Redo must restore the whole paste');
  result.osClipboardHistory = true;
  const preview = await source('def f():');
  await page.getByRole('button', {name:'Save', exact:true}).click();
  await page.locator('[data-testid="status"]:is([data-operation="saved"], [data-operation="save-failed"])').waitFor();
  assert(await page.getByTestId('status').getAttribute('data-operation') === 'saved', `Save failed: ${await page.locator('body').innerText()}`);
  const disk = (await (await page.request.get(`${origin}/api/document?path=${encodeURIComponent(file)}`, { headers: { Connection: "close" } })).json()).source.replaceAll('\r\n', '\n');
  const saved = '---\nlitzio: 1\n---\n\n# External\n\n## Web *heading*\n\n' +
    'Text with **bold *both***, {del}`gone`, `x = 1` and [a link](https://example.com/a "Example").\n\n' +
    '*   One\n\n    *   Nested\n*   Two\n\n3.  Third\n\n> Quoted red text.\n\nPress Ctrl+C and see Example.\n\n' +
    '```python\ndef f():\n    return 1\n```\n\n---\n\n:::{table}\n\n| Key | Value |\n| --: | ----- |\n|   a | 1     |\n:::\n\nOmega.\n';
  assert(disk === preview && disk === saved, `Save writes the canonical Markdown Source showed: ${JSON.stringify(disk)}`);
  await page.getByRole('button', {name:'File actions', exact:true}).click();
  await page.getByRole('menuitem', {name:'Reload', exact:true}).click();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
  assert((await state()).doc === pasted.doc, 'Reload must retain the pasted structure');
  result.saveReload = true;

  // B. Representative sources, pasted before "Omega." and undone; Source shows Core's Markdown.
  const cases = {
    // Vendor wrappers, classes, ids, data attributes and layout styles are noise: no notice.
    noisy: ['<div class="post" data-v-1a2b><section id="s"><p class="lead" data-track="x" style="margin:0;line-height:1.6"><span class="a"><span>Noisy <b class="k">bold</b> text</span></span></p></section></div>',
      'Noisy **bold** textOmega.\n', ''],
    notion: ['<meta charset="utf-8"><h3 id="1f" class="">Notion heading</h3><p id="2a" class=""><span class="notranslate">Plain <strong>strong</strong> <code>code</code></span></p>' +
      '<ul id="3b" class="bulleted-list"><li style="list-style-type:disc"><div>Item</div><ul class="bulleted-list"><li style="list-style-type:circle">Child</li></ul></li></ul>' +
      '<pre id="4c" class="code"><code class="language-JavaScript">const a = 1;\n\n  a++;</code></pre>',
      // A trailing code block stays whole rather than absorbing the paragraph after the caret.
      '### Notion heading\n\nPlain **strong** `code`\n\n*   Item\n\n    *   Child\n\n```JavaScript\nconst a = 1;\n\n  a++;\n```\n\nOmega.\n', ''],
    word: ['<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->' +
      `<h1><a name="_Toc1"></a><span style='font-family:"Calibri Light"'>Word heading</span></h1>` +
      `<p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>First<o:p></o:p></p>` +
      `<p class=MsoListParagraphCxSpLast style='margin-left:72.0pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span>&nbsp; </span></span></span><![endif]>Second<o:p></o:p></p>` +
      `<p class=MsoNormal><o:p>&nbsp;</o:p></p>` +
      `<table class=MsoTableGrid border=1><tr><td width=200 valign=top><p class=MsoNormal><b>Name</b><o:p></o:p></p></td><td><p class=MsoNormal>Size</p></td></tr><tr><td><p class=MsoNormal>A</p></td><td><p class=MsoNormal>1</p></td></tr></table><!--EndFragment--></body></html>`,
      '# Word heading\n\n*   First\n\n    *   Second\n\n:::{table}\n\n| **Name** | Size |\n| -------- | ---- |\n| A        | 1    |\n:::\n\nOmega.\n',
      'Pasted with normalization: unsupported visual styles were removed; table headers now use the first row only.'],
    // A fragment link stays an ordinary link, never a cross-reference. Sub/superscript tags
    // and Word's vertical-align spans are kept.
    styled: ['<p><span style="font-family:Georgia;color:rgb(200,0,0)">Styled</span> x<sup>2</sup> H<span style="vertical-align:sub">2</span>O <a href="javascript:alert(1)">unsafe</a> <a href="#local">local</a></p>',
      'Styled x{sup}`2` H{sub}`2`O unsafe [local](#local)Omega.\n',
      'Pasted with normalization: unsupported visual styles were removed; unsupported links became plain text.'],
    // The visible text survives; the expansion and machine-readable date do not, so they are reported.
    metadata: ['<p><abbr title="Alternating Current">AC</abbr> since <time datetime="2026-10-02">today</time></p>',
      'AC since todayOmega.\n', 'Pasted with normalization: unsupported semantic formatting became plain text.'],
  };
  for (const [name, [html, expected, message]] of Object.entries(cases)) {
    await select('Omega.');
    const before = await state();
    await notice.waitFor({state:'detached', timeout:10000});
    await syntheticPaste(html);
    let shown = '';
    if (message) {
      await showNotifications(page);
      assert(await messageBody.isVisible(), `${name}: normalization message must be visible`);
      shown = await messageBody.innerText();
    } else assert(await notice.count() === 0, `${name}: vendor layout noise must not produce a notice`);
    const markdown = (await source('Omega.')).slice(saved.length - 'Omega.\n'.length);
    assert(markdown === expected && shown === message, `${name}: ${JSON.stringify({markdown, shown})}`);
    await editor.evaluate(el => el.editor.commands.undo());
    assert((await state()).doc === before.doc, `${name}: one Undo restores the document`);
    result[name] = true;
  }

  // C. Structure Litzio cannot represent refuses the whole paste; document and selection stay.
  const refused = {
    'merged table cells are not supported': '<table><tr><th colspan="2">Merged</th></tr><tr><td>a</td><td>b</td></tr></table>',
    'nested tables are not supported': '<table><tr><th><table><tr><td>x</td></tr></table></th></tr></table>',
    'embedded media and objects are not supported': '<p>Clip</p><iframe src="about:blank"></iframe>',
    'form controls are not supported': '<p>Name <input type="text"></p>',
    'a list item holds one paragraph, optionally followed by one nested list': '<ul><li><p>One</p><p>Two</p></li></ul>',
    'a heading holds one line of inline content': '<h2>Line<br>break</h2>',
    'ruby annotations cannot become plain text': '<p><ruby>漢<rt>kan</rt></ruby></p>',
    // Word level 1 → level 3 has no exact nested-list form; it is not lowered to level 2.
    'a Word list skips a nesting level or goes above its first item':
      `<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>·</span>Top</p>` +
      `<p class=MsoListParagraph style='mso-list:l0 level3 lfo1'><span style='mso-list:Ignore'>§</span>Deep</p>`,
    'images can be added only as image files': '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></p>',
  };
  for (const [reason, html] of Object.entries(refused)) {
    await select('Omega.', true);
    const before = await state();
    await syntheticPaste(html);
    await showNotifications(page);
    await notice.filter({hasText:`Nothing was pasted: ${reason}. The clipboard and your selection are kept.`}).waitFor({state:'visible'});
    const after = await state();
    assert(after.doc === before.doc && after.selection.join() === before.selection.join(), `${reason}: document and selection must stay`);
  }
  // Dropped external HTML goes through the same normalization and refusal.
  const target = await page.locator('[data-document-tab][data-active=true] .document-editor > p').filter({hasText:'Omega.'}).boundingBox();
  const beforeDrop = await state();
  await editor.evaluate((el, args) => {
    const data = new DataTransfer();
    data.setData('text/html', args.html); data.setData('text/plain', 'Merged');
    el.dispatchEvent(new DragEvent('drop', {dataTransfer:data, clientX:args.x, clientY:args.y, bubbles:true, cancelable:true}));
  }, {html:refused['merged table cells are not supported'], x:target.x + 5, y:target.y + target.height / 2});
  await showNotifications(page);
  await notice.filter({hasText:'Nothing was pasted: merged table cells are not supported.'}).waitFor({state:'visible'});
  assert((await state()).doc === beforeDrop.doc, 'A refused drop must keep the document');
  result.refused = true;

  // D. Clipboard text without HTML is read as Markdown by Core, as when opening a document (#1843).
  const markdownFile = [root, 'tmp', 'external-html-paste', 'markdown.md'].join(separator);
  await openPath(page, markdownFile);
  await editor.locator('[data-block="table"]').waitFor();
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

  // E. Review regressions (#1844): one-line places, endnotes, URLs, history, composition.
  const placesFile = [root, 'tmp', 'external-html-paste', 'places.md'].join(separator);
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
  const oneLine = 'Only one line of text can be pasted here. Paste blocks into a paragraph.';
  // A soft line break and blocks are refused in a cell and a caption, from Markdown and from HTML alike.
  await refusedAt('CellText', 4, () => textPaste('**bold**\nMore'), lineBreaks('table cell'));
  await refusedAt('CaptionText', 4, () => textPaste('**bold**\nMore'), lineBreaks('table caption'));
  await refusedAt('CaptionText', 4, () => textPaste('# Pasted\n\nAfter'), oneLine);
  await refusedAt('CaptionText', 4, () => syntheticPaste('<h1>Pasted</h1><p>After</p>'), oneLine);
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
