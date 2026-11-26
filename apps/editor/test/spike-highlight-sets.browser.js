// Spike #2020 only: capture highlight set drafts A and B with a synthetic requirements document.
// pnpm browser:test spike-highlight-sets --screenshots
async (page, { expect, openPath }) => {
  const OUT = 'docs/spikes/assets/2020-highlight-sets';
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document', { headers: { Connection: 'close' } })).json();
  const root = initial.allowedRoots[0];
  const sep = root.includes('\\') ? '\\' : '/';
  const documentPath = [root, 'spike-2020', 'power-requirements.md'].join(sep);
  const notesPath = [root, 'spike-2020', 'notes.md'].join(sep);
  const compareCode = `export default function(React){return function Screen({ui}){
    const boxes=Array.from({length:7},(_,i)=>React.createElement('div',{key:i,style:{height:i%3===0?28:64,margin:'var(--space-3) var(--space-4)',borderInlineStart:'var(--space-1) solid var(--id-color-info)',background:'var(--id-color-surface-muted)'}}));
    return React.createElement(ui.ScreenLayout,{fillHeight:true,
      description:'원본 자료와 문서를 나란히 놓고 확인합니다.',
      status:React.createElement(ui.Status,{tone:'warning',label:'검토 중'})},
      React.createElement('div',{style:{display:'flex',flex:1,minHeight:0,gap:'var(--space-4)'}},
        React.createElement('section',{'aria-label':'원본 자료',style:{flex:'1 1 0',minWidth:0,overflow:'auto',border:'var(--border-width) solid var(--id-color-border-subtle)',borderRadius:'var(--id-radius-md)'}},boxes),
        React.createElement('div',{style:{flex:'1 1 0',minWidth:0,display:'flex',flexDirection:'column'}},React.createElement(ui.DocumentView,{path:${JSON.stringify(documentPath)},height:'fill'}))));}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({ json: { screens: [
    { plugin: 'fixture.spike', id: 'compare', entry: 'compare.jsx', title: '원본 대조', icon: 'Columns2', primary: true, code: compareCode, codeRevision: '1' },
  ], receipt: { outcome: 'success' } } }));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPath(page, notesPath);
  await openPath(page, documentPath);
  await page.evaluate(() => localStorage.setItem('litzio.uiLanguage', 'ko'));
  await page.reload();
  await page.getByTestId('activity-bar').waitFor();
  const tab = page.getByRole('tab', { name: /power-requirements/ });
  await expect(tab).toBeVisible();
  await tab.click();
  const theme = value => page.evaluate(value => { document.documentElement.dataset.theme = value; }, value);
  const draft = value => page.evaluate(value => { document.documentElement.dataset.highlightDraft = value; }, value);
  const size = (width, height) => page.setViewportSize({ width, height });
  const editor = page.locator('.ProseMirror:visible').first();
  const settle = async () => { await page.mouse.move(0, 0); await page.waitForTimeout(300); };
  const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const results = {};

  // Draft A: choose the set from the tab row button.
  await draft('a'); await theme('light');
  // Re-render the row after the dataset switch.
  await page.getByTestId('view-read').click(); await page.getByTestId('view-visual').click();
  await page.getByTestId('spike-hl-button').click();
  await page.getByTestId('spike-hl-set-requirements').click();
  await expect(editor.locator('[data-spike-word]').first()).toBeVisible();
  await page.getByTestId('spike-hl-button').click();
  await page.getByTestId('spike-hl-folder-default').click();
  results.highlighted = await editor.locator('[data-spike-word]').count();
  results.words = await editor.locator('[data-spike-word]').evaluateAll(nodes => nodes.map(node => node.textContent));
  await settle();
  await shot('a-document-1440x900-light');
  await page.getByTestId('spike-hl-button').click();
  await expect(page.getByTestId('spike-hl-menu')).toBeVisible();
  await settle();
  await shot('a-menu-1440x900-light');
  await page.keyboard.press('Escape');

  // Read view keeps the decorations.
  await page.getByTestId('view-read').click();
  await settle();
  await shot('a-read-1440x900-light');
  await page.getByTestId('view-visual').click();

  // Selection toolbar: add "record" with a color.
  const box = await editor.evaluate(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const index = node.data.indexOf('record the time');
      if (index < 0) continue;
      const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 6);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  });
  await page.mouse.dblclick(box.x, box.y);
  await page.getByTestId('spike-hl-toolbar').click();
  await expect(page.getByTestId('spike-hl-picker')).toBeVisible();
  await page.mouse.move(0, 0); await page.waitForTimeout(200);
  await shot('toolbar-color-1440x900-light');
  await page.getByTestId('spike-hl-picker').getByRole('radio', { name: '청록' }).click();
  await expect(editor.locator('[data-spike-word="record"]').first()).toBeVisible();
  // Leave no text selection over the new word.
  await page.keyboard.press('ArrowRight');

  // Secondary click on a highlighted word.
  const word = editor.locator('[data-spike-word="should"]').first();
  await word.scrollIntoViewIfNeeded();
  await word.click({ button: 'right' });
  await expect(page.getByTestId('spike-hl-word-menu')).toBeVisible();
  await page.waitForTimeout(200);
  await shot('word-menu-1440x900-light');
  await page.keyboard.press('Escape');
  await editor.evaluate(node => node.closest('.document-scroll, [data-testid="document-scroll"]')?.scrollTo?.(0, 0));
  await page.evaluate(() => document.querySelectorAll('*').forEach(node => { if (node.scrollTop > 0 && node.closest('[data-editor-group], main, .app-main')) node.scrollTop = 0; }));

  // Draft A at the other conditions.
  await theme('dark'); await settle(); await shot('a-document-1440x900-dark');
  await theme('light'); await size(1920, 1080); await settle(); await shot('a-document-1920x1080-light');
  await theme('dark'); await size(640, 900); await settle(); await shot('a-document-640x900-dark');
  await page.getByTestId('spike-hl-button').click(); await settle(); await shot('a-menu-640x900-dark'); await page.keyboard.press('Escape');

  // Draft B: status in the row, the menu inside ⋯ File actions.
  await draft('b'); await theme('light'); await size(1440, 900);
  await page.getByTestId('view-read').click(); await page.getByTestId('view-visual').click();
  await expect(page.getByTestId('spike-hl-status')).toBeVisible();
  await settle(); await shot('b-document-1440x900-light');
  const more = page.locator('.top-bar-actions:visible button:has(svg.lucide-ellipsis)').first();
  await more.click();
  await page.getByTestId('spike-hl-submenu').click();
  await expect(page.getByTestId('spike-hl-menu')).toBeVisible();
  await page.waitForTimeout(250);
  await shot('b-menu-1440x900-light');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await theme('dark'); await settle(); await shot('b-document-1440x900-dark');
  await theme('light'); await size(1920, 1080); await settle(); await shot('b-document-1920x1080-light');
  await theme('dark'); await size(640, 900); await settle(); await shot('b-document-640x900-dark');

  // Folder default: the other document in the folder is highlighted without its own choice.
  await theme('light'); await size(1440, 900); await draft('a');
  await page.getByRole('tab', { name: /notes/ }).click();
  results.folderDefaultOn = await page.getByTestId('spike-hl-button').getAttribute('aria-label');

  // Plugin document view.
  await page.getByTestId('activity-bar').getByRole('button', { name: '원본 대조', exact: true }).click();
  const surface = page.locator('.task-surface:visible').first();
  await expect(surface.locator('[data-spike-word]').first()).toBeVisible();
  await settle(); await shot('plugin-view-1440x900-light');

  // Settings: manage sets (from the menu's "Manage sets…").
  await page.getByRole('tab', { name: /power-requirements/ }).click();
  await page.getByTestId('spike-hl-button').click();
  await page.getByTestId('spike-hl-manage').click();
  await expect(page.getByTestId('spike-hl-settings-requirements')).toBeVisible();
  await settle(); await shot('settings-1440x900-light');
  await theme('dark'); await settle(); await shot('settings-1440x900-dark');
  await theme('light');
  return results;
}
