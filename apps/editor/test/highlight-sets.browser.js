// Highlight sets (#2020): Settings makes the sets, the tab row's highlighter chooses one per document
// or as a folder default, the command center chooses and turns off, and the words show in Edit and
// Read (not Source) without dirtying the document. The choice survives a reload; copy leaves it out.
// Matching rules and the per-block recalculation are covered by highlight-sets.test.ts.
// pnpm browser:test highlight-sets [--screenshots]
async (page, { openPath, expect, screenshots }) => {
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = name => [root, 'tmp', 'highlight-sets', name].join(sep);
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const shot = async name => { if (!screenshots) return; await page.mouse.move(4, 500); await page.screenshot({path: `tmp/highlight-sets-captures/${name}.png`}); };
  const configure = async (language, theme) => {
    await page.getByRole('button', {name:/^(Settings|설정)$/}).click();
    await page.getByTestId('ui-language').selectOption(language);
    await page.getByTestId('theme').selectOption(theme);
    await page.locator('[data-tab-id="settings"] .document-tab-close').click();
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  };
  await configure('en', 'light');
  await page.setViewportSize({width: 1440, height: 900});
  await openPath(page, file('requirements.md'));
  const editor = () => page.locator('[data-document-tab][data-active=true] .document-editor');
  const words = () => editor().locator('.highlight-word');
  const button = () => page.locator('section[data-focused="true"]').getByTestId('highlight-set-button');
  const menu = page.getByTestId('highlight-set-menu');
  const clean = async () => {
    await expect(page.getByTestId('status').locator('.document-status-dirty')).toHaveCount(0);
    check(await editor().evaluate(el => !el.editor.can().undo()), 'Highlights added an Undo step');
  };
  const opening = await editor().evaluate(el => JSON.stringify(el.editor.getJSON()));
  await expect(button()).toHaveAccessibleName('Highlights: off');
  await expect(words()).toHaveCount(0);

  // Manage sets… opens Settings at the new category; sets and words are made there.
  await button().click();
  await menu.getByRole('menuitem', {name:'Manage sets…'}).click();
  const settings = page.getByTestId('highlight-set-settings');
  await expect(settings).toBeVisible();
  await expect(page.getByRole('heading', {name:'Highlight sets', level:2})).toBeVisible();
  const addSet = async name => {
    await settings.getByRole('textbox', {name:'New set name'}).fill(name);
    await settings.getByRole('button', {name:'New set'}).click();
  };
  const section = name => settings.getByRole('region', {name});
  const addWord = async (set, word, color) => {
    await section(set).getByRole('textbox', {name:'Word or phrase'}).fill(word);
    await section(set).getByRole('radio', {name:color}).check();
    await section(set).getByRole('button', {name:/^(Add|Change color)$/}).click();
  };
  await addSet('Requirements');
  for (const [word, color] of [['shall', 'Violet'], ['must', 'Green'], ['해야 한다', 'Red'], ['Shall', 'Blue']]) await addWord('Requirements', word, color);
  await expect(section('Requirements').getByTestId('highlight-word')).toHaveCount(3);
  await expect(section('Requirements').getByRole('button', {name:'Color of shall: Blue'})).toBeVisible();
  await addSet('Contract');
  await addWord('Contract', '위약금', 'Red');

  // Two tabs save in turn: neither loses the other's sets, and each shows the other's change.
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await other.getByRole('button', {name:/^Settings$/}).click();
    await other.getByRole('button', {name:'Highlight sets'}).click();
    const otherSettings = other.getByTestId('highlight-set-settings');
    await expect(otherSettings.getByRole('region', {name:'Contract'})).toBeVisible();
    await otherSettings.getByRole('textbox', {name:'New set name'}).fill('Review');
    await otherSettings.getByRole('button', {name:'New set'}).click();
    await expect(section('Review')).toBeVisible();
    await addWord('Contract', '해지', 'Amber');
    await other.reload();
    await other.getByRole('button', {name:/^Settings$/}).click();
    await other.getByRole('button', {name:'Highlight sets'}).click();
    for (const name of ['Requirements', 'Contract', 'Review']) await expect(otherSettings.getByRole('region', {name})).toBeVisible();
    await expect(otherSettings.getByRole('region', {name:'Contract'}).getByTestId('highlight-word')).toHaveCount(2);
  } finally { await other.close(); }
  await section('Review').getByRole('button', {name:'Delete set'}).click();
  await page.getByRole('dialog').getByRole('button', {name:'Delete set'}).click();
  await expect(section('Review')).toHaveCount(0);
  await shot('settings-1440-light');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();

  // The tab row chooses a set for this document; words show in Edit with their colors, not in code.
  await button().click();
  await menu.getByRole('menuitemradio', {name:'Requirements'}).click();
  await expect(button()).toHaveAccessibleName('Highlights: Requirements');
  await expect(button()).toContainText('Requirements');
  const shown = () => words().evaluateAll(nodes => nodes.map(node => `${node.textContent}:${node.dataset.highlight}`));
  await expect.poll(shown).toEqual([
    'shall:blue', 'SHALL:blue', 'must:green', '해야 한다:red', 'shall:blue',
    ...Array.from({length: 12}, () => ['shall:blue', 'must:green']).flat(),
  ]);
  const style = await words().first().evaluate(node => ({ color: getComputedStyle(node).color, weight: getComputedStyle(node).fontWeight,
    token: (() => { const probe = document.createElement('span'); probe.style.color = 'var(--id-color-highlight-blue)'; document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; })() }));
  check(style.color === style.token && style.weight === '650', `highlight style ${JSON.stringify(style)}`);
  await clean();
  check(await editor().evaluate(el => JSON.stringify(el.editor.getJSON())) === opening, 'Highlights changed the document');
  // Copy serializes the document, never the decorations.
  const copied = await editor().evaluate(el => { const { view } = el.editor; return view.serializeForClipboard(view.state.doc.slice(0, view.state.doc.content.size)).dom.innerHTML; });
  check(copied.includes('SHALL') && !/highlight/i.test(copied), 'Copied HTML carries highlights');
  await shot('document-1440-light');
  await button().click();
  await expect(menu.getByRole('menuitemradio', {name:'Requirements'})).toHaveAttribute('aria-checked', 'true');
  await shot('menu-1440-light');

  // Default for this folder turns the set on for the folder's other documents.
  await menu.getByRole('menuitemcheckbox', {name:'Default for this folder'}).click();
  await openPath(page, file('other.md'));
  await expect(button()).toHaveAccessibleName('Highlights: Requirements (folder default)');
  await expect(words()).toHaveCount(1);
  await button().click();
  await expect(menu.getByText('Folder default', {exact:true})).toBeVisible();
  await menu.getByRole('menuitemradio', {name:'Off'}).click();
  await expect(words()).toHaveCount(0);
  await expect(button()).toHaveAccessibleName('Highlights: off');

  // Both choices survive a reload; Read shows the words and Source does not.
  await page.reload();
  await openPath(page, file('requirements.md'));
  await expect(words()).toHaveCount(29);
  await page.getByTestId('view-read').filter({visible:true}).click();
  await expect(words()).toHaveCount(29);
  await page.getByTestId('view-source').filter({visible:true}).click();
  await expect(page.locator('[data-document-tab][data-active=true] .highlight-word').filter({visible:true})).toHaveCount(0);
  await expect(page.locator('[data-document-tab][data-active=true]').getByTestId('source-view')).toContainText('SHALL');
  await page.getByTestId('view-visual').filter({visible:true}).click();
  await openPath(page, file('other.md'));
  await expect(button()).toHaveAccessibleName('Highlights: off');
  await expect(words()).toHaveCount(0);

  // The command center chooses another set and turns highlights off.
  await openPath(page, file('requirements.md'));
  const command = async label => {
    await page.keyboard.press('Control+Slash');
    const center = page.getByRole('dialog', {name:'Command center', exact:true});
    await center.getByRole('combobox').fill('> ' + label);
    await center.getByRole('option', {name:label, exact:true}).click();
    await center.waitFor({state:'detached'});
  };
  await expect(editor()).toBeVisible();
  await command('Highlight set: Contract');
  await expect.poll(shown).toEqual(['위약금:red']);
  await command('Turn off highlights');
  await expect(words()).toHaveCount(0);
  await button().click();
  await menu.getByRole('menuitemradio', {name:'Requirements'}).click();
  await expect(words()).toHaveCount(29);
  await clean();

  // Dark, the main 1920 screen and the 640 minimum: the button never covers Save or the file actions.
  const fits = () => page.evaluate(() => {
    const row = document.querySelector('section[data-focused="true"] .top-bar-actions');
    const rect = node => node.getBoundingClientRect();
    const own = row.querySelector('[data-testid="highlight-set-button"]');
    const others = [...row.querySelectorAll('button')].filter(node => node !== own && node.checkVisibility());
    const r = rect(own);
    return r.right <= innerWidth && others.every(node => { const o = rect(node); return o.right <= r.left || o.left >= r.right; });
  });
  await configure('en', 'dark');
  await openPath(page, file('requirements.md'));
  await shot('document-1440-dark');
  await button().click();
  await shot('menu-1440-dark');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name:/^Settings$/}).click();
  await page.getByRole('button', {name:'Highlight sets'}).click();
  await shot('settings-1440-dark');
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await page.setViewportSize({width: 1920, height: 1080});
  await openPath(page, file('requirements.md'));
  check(await fits(), '1920 tab row overlaps');
  await shot('document-1920-dark');
  await configure('ko', 'dark');
  await page.getByRole('tab', {name:/requirements\.md/}).click();
  await page.setViewportSize({width: 640, height: 900});
  await expect(button()).toHaveAccessibleName('강조: Requirements');
  await expect(button().locator('.highlight-set-name')).toHaveCount(0);
  await expect(button().locator('.highlight-swatch')).toHaveCount(3);
  check(await fits(), '640 tab row overlaps');
  await shot('document-640-dark-ko');
  await button().click();
  await shot('menu-640-dark-ko');
  await page.keyboard.press('Escape');

  // Deleting a set turns it off wherever it was chosen or a folder default.
  await page.setViewportSize({width: 1440, height: 900});
  await configure('en', 'light');
  await button().click();
  await menu.getByRole('menuitem', {name:'Manage sets…'}).click();
  await section('Requirements').getByRole('button', {name:'Delete set'}).click();
  await page.getByRole('dialog').getByRole('button', {name:'Delete set'}).click();
  await expect(section('Requirements')).toHaveCount(0);
  await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  await expect(words()).toHaveCount(0);
  await expect(button()).toHaveAccessibleName('Highlights: off');
  await clean();
  return { highlighted: 29 };
}
