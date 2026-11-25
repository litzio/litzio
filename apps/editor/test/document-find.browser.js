// Find in document (#1982): Ctrl+F opens the bar over the document area, matches are decorations,
// Enter/F3 and the buttons step and wrap, Esc returns the caret and focus to the document, and
// finding never dirties the document. Edit, Read, a plugin document view and IME composition.
// pnpm browser:test document-find [--screenshots]
async (page, { openPath, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'document-find', name].join(sep);
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const configure = async (language, theme) => {
    await page.getByRole('button', {name:/^(Settings|설정)$/}).click();
    await page.getByTestId('ui-language').selectOption(language);
    await page.getByTestId('theme').selectOption(theme);
    await page.locator('[data-tab-id="settings"] .document-tab-close').click();
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  };
  const shot = async name => { if (screenshots) await page.screenshot({path: `tmp/document-find-captures/${name}.png`}); };
  await configure('en', 'light');
  await page.setViewportSize({width: 1440, height: 900});
  await openPath(page, file('find.md'));
  const panel = page.locator('[data-document-tab][data-active=true]');
  const editor = panel.locator('.document-editor');
  const bar = page.getByTestId('document-find').filter({visible: true});
  const input = bar.getByTestId('document-find-input');
  const count = bar.getByTestId('document-find-count');
  const matches = editor.locator('.ProseMirror-search-match, .ProseMirror-active-search-match');
  const active = editor.locator('.ProseMirror-active-search-match');
  const json = () => editor.evaluate(el => JSON.stringify(el.editor.getJSON()));
  const clean = async () => {
    await expect(page.getByTestId('status').locator('.document-status-dirty')).toHaveCount(0);
    check(await editor.evaluate(el => !el.editor.can().undo()), 'Find added an Undo step');
  };
  const caretAt = text => editor.evaluate((el, text) => {
    let at;
    el.editor.state.doc.descendants((node, pos) => {
      if (at === undefined && node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text);
    });
    el.editor.commands.setTextSelection(at);
    // Read has no editable focus target; a click focuses the root, as here.
    el.editor.view.dom.focus({preventScroll: true});
    el.editor.view.focus();
  }, text);
  // The current match is inside the viewport, near the middle, and not under the bar.
  const centered = () => page.evaluate(() => {
    const match = document.querySelector('[data-document-tab][data-active=true] .ProseMirror-active-search-match').getBoundingClientRect();
    const viewport = document.querySelector('[data-document-tab][data-active=true]').getBoundingClientRect();
    const finder = [...document.querySelectorAll('[data-testid="document-find"]')].find(n => n.checkVisibility()).getBoundingClientRect();
    const middle = (viewport.top + viewport.bottom) / 2;
    return match.top >= finder.bottom && match.bottom <= viewport.bottom && Math.abs((match.top + match.bottom) / 2 - middle) < viewport.height / 4;
  });
  const opening = await json();
  const result = {};

  // Ctrl+F from the document: focus goes to the bar; typing shows every match and the current one.
  await caretAt('The opening paragraph');
  await shot('before-1440');
  await page.keyboard.press('Control+f');
  await expect(bar).toBeVisible();
  await expect(input).toBeFocused();
  const toolbarRect = await page.locator('.document-tab-row').first().boundingBox();
  const barRect = await bar.boundingBox();
  check(barRect.y >= toolbarRect.y + toolbarRect.height, 'Find bar covers the tab row and document actions');
  await page.keyboard.type('alpha');
  await expect(count).toHaveText('1 / 6');
  await expect(matches).toHaveCount(6);
  await expect(active).toHaveCount(1);
  await expect(active).toHaveText('alpha');
  check(await editor.evaluate(el => el.editor.view.hasFocus()) === false, 'Typing in Find moved focus to the document');
  await shot('light-1440');
  // Enter / Shift+Enter, F3 / Shift+F3 and the buttons step and wrap at both ends.
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('2 / 6');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await expect(count).toHaveText('6 / 6');
  check(await centered(), 'Wrapping to the last match did not bring it near the middle of the view');
  await page.keyboard.press('F3');
  await expect(count).toHaveText('1 / 6');
  await page.keyboard.press('Shift+F3');
  await expect(count).toHaveText('6 / 6');
  await bar.getByTestId('document-find-next').click();
  await expect(count).toHaveText('1 / 6');
  await bar.getByTestId('document-find-previous').click();
  await expect(count).toHaveText('6 / 6');
  await bar.getByTestId('document-find-next').click();
  await bar.getByTestId('document-find-next').click();
  await expect(count).toHaveText('2 / 6');
  check(await centered(), 'The next match did not come into view');
  // Case: off by default; on, "Alpha" no longer matches.
  await bar.getByTestId('document-find-case').click();
  await expect(bar.getByTestId('document-find-case')).toHaveAttribute('aria-pressed', 'true');
  await expect(matches).toHaveCount(5);
  await bar.getByTestId('document-find-case').click();
  await expect(matches).toHaveCount(6);
  // Ctrl+F again selects the search text.
  await input.focus();
  await page.keyboard.press('Control+f');
  check(await input.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length), 'Ctrl+F did not select the search text');
  // A table cell and an endnote definition.
  await page.keyboard.type('cellword');
  await expect(count).toHaveText('1 / 1');
  check(await active.evaluate(n => !!n.closest('td, th')), 'The match is not in the table cell');
  await shot('table-cell');
  await input.fill('endnoteword');
  await expect(count).toHaveText('1 / 1');
  check(await active.evaluate(n => !!n.closest('.footnote-definition-body')), 'The match is not in the endnote definition');
  // No match: 0 and an invalid field.
  await input.fill('zzzz');
  await expect(count).toContainText('0');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(matches).toHaveCount(0);
  await shot('no-results');

  // Esc: highlights go, the caret stays at the last current match, the document has focus and nothing changed.
  await input.fill('alpha');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('3 / 6');
  const lastMatch = await editor.evaluate(el => el.editor.state.selection.from);
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(matches).toHaveCount(0);
  check(await editor.evaluate((el, at) => el.editor.view.hasFocus() && el.editor.state.selection.empty && el.editor.state.selection.from === at, lastMatch),
    'Esc did not return the caret and focus to the last match');
  check(await json() === opening, 'Find changed the document');
  await clean();

  // Korean composition keeps the bar's focus and its results.
  await page.keyboard.press('Control+f');
  await expect(input).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {text: '전', selectionStart: 1, selectionEnd: 1});
  await expect(count).toHaveText('1 / 1');
  await cdp.send('Input.imeSetComposition', {text: '전려', selectionStart: 2, selectionEnd: 2});
  await expect(count).toHaveText(/^0 No results$/);
  await cdp.send('Input.imeSetComposition', {text: '전력', selectionStart: 2, selectionEnd: 2});
  await expect(count).toHaveText('1 / 1');
  await expect(input).toBeFocused();
  await cdp.send('Input.insertText', {text: '전력'});
  await expect(input).toHaveValue('전력');
  await expect(count).toHaveText('1 / 1');
  await expect(active).toHaveText('전력');
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await clean();

  // Read: the same bar and keys; Esc places the reading caret.
  await page.getByTestId('view-read').click();
  await caretAt('The opening paragraph');
  await page.keyboard.press('Control+f');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('전력');
  // Reopening searched the previous text from the caret; a new text continues from that match.
  await expect(count).toHaveText('1 / 1');
  await input.fill('alpha');
  await expect(count).toHaveText('6 / 6');
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('1 / 6');
  const readMatch = await editor.evaluate(el => el.editor.state.selection.from);
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  check(await editor.evaluate((el, at) => el.editor.view.hasFocus() && el.editor.state.selection.from === at, readMatch), 'Read Esc did not keep the caret');
  // A single-line selection becomes the search text.
  await editor.evaluate(el => {
    let at;
    el.editor.state.doc.descendants((node, pos) => { if (at === undefined && node.isText && node.text.includes('endnoteword')) at = pos + node.text.indexOf('endnoteword'); });
    el.editor.commands.setTextSelection({from: at, to: at + 'endnoteword'.length});
    el.editor.view.dom.focus();
  });
  await page.keyboard.press('Control+f');
  await expect(input).toHaveValue('endnoteword');
  await expect(count).toHaveText('1 / 1');
  await page.keyboard.press('Escape');
  check(await json() === opening, 'Find in Read changed the document');
  await page.getByTestId('view-visual').click();

  // Source keeps the browser's own Ctrl+F; the command center opens Find in Edit.
  await page.getByTestId('view-source').click();
  await page.getByTestId('source-view').click();
  const sourceKey = page.evaluate(() => new Promise(resolve => window.addEventListener('keydown', event => resolve(event.defaultPrevented), {once: true})));
  await page.keyboard.press('Control+f');
  check(await sourceKey === false, 'Source view took over the browser Find');
  await expect(bar).toHaveCount(0);
  await page.getByTestId('view-visual').click();
  await caretAt('The opening paragraph');
  await page.keyboard.press('Control+Slash');
  const center = page.getByRole('dialog', {name: 'Command center', exact: true});
  await center.getByRole('combobox').fill('> Find in document');
  await center.getByRole('option', {name: 'Find in document', exact: true}).click();
  await expect(center).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('endnoteword');
  await expect(count).toHaveText('1 / 1');
  await input.fill('alpha');
  await expect(count).toHaveText('1 / 6');

  if (screenshots) {
    await page.setViewportSize({width: 1920, height: 1080});
    await page.keyboard.press('Enter');
    await shot('light-1920');
    await page.setViewportSize({width: 640, height: 900});
    await shot('light-640');
    await page.setViewportSize({width: 1440, height: 900});
    await configure('ko', 'dark');
    await caretAt('The opening paragraph');
    await page.keyboard.press('Control+f');
    await page.keyboard.press('Enter');
    await shot('dark-1440-ko');
    await page.setViewportSize({width: 640, height: 900});
    await shot('dark-640-ko');
    await page.setViewportSize({width: 1440, height: 900});
    await configure('en', 'light');
  }
  await page.keyboard.press('Escape');

  // A large document (about 2,000 blocks): per key, the time until the next frame shows the typed
  // field, and after the last key, the time until the count and highlights show the result.
  // Recorded for the PR; CI does not judge times.
  await openPath(page, file('large.md'));
  await caretAt('Paragraph 1 ');
  await page.keyboard.press('Control+f');
  await expect(input).toBeFocused();
  await input.evaluate((el, counter) => {
    window.__find = {field: [], shown: []};
    el.addEventListener('keydown', () => {
      const start = window.__find.key = performance.now();
      requestAnimationFrame(() => setTimeout(() => window.__find.field.push(Math.round(performance.now() - start))));
    }, true);
    new MutationObserver(() => requestAnimationFrame(() => setTimeout(() => window.__find.shown.push(Math.round(performance.now() - window.__find.key)))))
      .observe(document.querySelector(counter), {childList: true, characterData: true, subtree: true});
  }, '[data-document-tab][data-active=true] ~ [data-testid="document-find"], [data-testid="document-find"]');
  const typeTimed = async (text, expected) => {
    for (const key of text) { await page.keyboard.press(key); await page.waitForTimeout(80); }
    await expect(count).toHaveText(expected);
    await page.waitForTimeout(300);
    const times = await page.evaluate(() => { const value = {...window.__find}; window.__find.field = []; window.__find.shown = []; return value; });
    return {fieldPerKeyMs: times.field, resultAfterLastKeyMs: times.shown.at(-1)};
  };
  result.largeDocumentCommonTerm = await typeTimed('voltage', / 1960$/);
  await page.keyboard.press('Control+a');
  result.largeDocumentRareTerm = await typeTimed('block 1999', '1 / 1');
  await page.keyboard.press('Escape');

  // A plugin screen's document view (gallery example of ui.LinkedDocumentView) opens the same Find.
  await page.goto(`${origin}/ui-gallery`);
  await page.getByRole('navigation', {name: 'Gallery elements'}).getByRole('button', {name: 'Linked document view', exact: true}).click();
  const preview = page.getByRole('region', {name: 'Document preview content', exact: true});
  await preview.locator('.document-editor p').first().click();
  await page.keyboard.press('Control+f');
  const viewBar = page.getByTestId('document-find');
  await expect(viewBar.getByTestId('document-find-input')).toBeFocused();
  const word = await preview.locator('.document-editor p').first().evaluate(n => n.textContent.trim().split(/\s+/)[0]);
  await page.keyboard.type(word);
  await expect(viewBar.getByTestId('document-find-count')).toHaveText(/^[1-9]\d* \/ [1-9]\d*$/);
  const inside = await page.evaluate(() => {
    const view = document.querySelector('.screen-document-view-scroll').getBoundingClientRect();
    const finder = document.querySelector('[data-testid="document-find"]').getBoundingClientRect();
    return finder.top >= view.top && finder.right <= view.right && finder.left >= view.left;
  });
  check(inside, 'The find bar is outside the document view');
  await shot('document-view');
  await page.keyboard.press('Escape');
  await expect(viewBar).toHaveCount(0);
  return result;
}
