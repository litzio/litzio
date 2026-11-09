// Real shared Host, textarea input, Save acknowledgement and kind-specific local recovery.
async (page, { openPath, activeDocument, expect, recoveryRecords, screenshots, textFixture }) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const initial = await (await page.request.get(origin + '/api/document', { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = [...initial.path.split(sep).slice(0,-4), 'tmp', 'text-mode'].join(sep);
  const file = name => root + sep + name;
  const read = async path => (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(path), { headers: { Connection: "close" } })).json();
  const input = () => activeDocument(page).getByTestId('text-editor');
  const save = async () => {
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().split('?')[0].endsWith('/api/document'));
    await page.keyboard.press('Control+s');
    expect((await response).status()).toBe(200);
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','saved');
  };
  const reload = async () => {
    await page.getByRole('button',{name:'File actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Reload',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','ready');
  };
  const unloadBlocked = () => page.evaluate(() => {
    const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented;
  });
  const configure = async (language,theme,pageStyle = 'paper') => {
    await page.getByRole('button',{name:/^(Settings|설정)$/,exact:true}).click();
    await page.getByTestId('theme').selectOption(theme);
    await page.getByTestId('page-background').selectOption(pageStyle);
    await page.getByTestId('ui-language').selectOption(language);
    await page.locator('[data-tab-id="settings"] .document-tab-close').click();
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.evaluate(async () => { await document.fonts.ready; });
  };
  const nativeBefore = await read(file('native.md'));
  if (screenshots) {
    const comparison = '# 같은 문서 · Reading\n\n본문은 같은 글꼴과 여백으로 읽힙니다. **강조**와 `inline code`, $x+1$을 확인합니다.\n\n## 목록과 인용\n\n- 첫 번째 항목\n- 두 번째 항목\n\n> 인용한 문장입니다.\n\n| Header | Value |\n| --- | --- |\n| Cell | 42 |\n\n```js\nconst reading = true;\n```\n';
    const original = (await read(file('foreign.md'))).source;
    textFixture.replaceNative('---\nlitzio: 1\n---\n\n' + comparison);
    for (const [language,theme,width] of [['en','light',1440],['ko','dark',640]]) {
      await configure('en','light');
      await page.setViewportSize({width,height:900});
      await openPath(page,file('native.md'));
      await page.getByTestId('view-read').click();
      await configure(language,theme);
      await page.getByTestId('sidebar').locator(`[role="treeitem"][data-path=${JSON.stringify(file('native.md'))}]`).click();
      await expect(activeDocument(page).locator('[data-read-only="true"] .document-editor')).toBeVisible();
      await page.screenshot({mask:[page.locator(".sidebar-footer")],path:`tmp/text-mode-captures/compare-native-${width}.png`});
      await configure('en','light');
      await openPath(page,file('foreign.md'));
      await page.getByTestId('view-visual').click();
      await input().fill(comparison);
      await configure(language,theme);
      await page.getByTestId('sidebar').locator(`[role="treeitem"][data-path=${JSON.stringify(file('foreign.md'))}]`).click();
      await page.getByTestId('view-read').click();
      await page.screenshot({mask:[page.locator(".sidebar-footer")],path:`tmp/text-mode-captures/compare-markdown-${width}.png`});
      await page.getByTestId('view-visual').click();
      await input().fill('긴 문장과 공백 없는 식별자도 화면 안에서 편집합니다. '.repeat(25) + 'identifier'.repeat(80));
      await input().press('Control+Home');
      await activeDocument(page).evaluate(node => node.scrollTo(0,0));
      await expect.poll(() => activeDocument(page).evaluate(node => node.scrollTop)).toBe(0);
      await page.screenshot({mask:[page.locator(".sidebar-footer")],path:`tmp/text-mode-captures/compare-edit-${width}.png`});
      await input().fill(original);
      await page.getByTestId('view-read').click();
    }
    textFixture.replaceNative(nativeBefore.source);
    await configure('en','light');
  }
  await openPath(page,file('foreign.md'));
  await expect(page.getByTestId('view-read')).toHaveAttribute('aria-pressed', 'true');
  const preview = () => activeDocument(page).getByTestId('plain-markdown');
  await expect(input()).toBeHidden();
  await expect(preview()).toHaveClass(/document-editor/);
  await expect(preview().locator('..')).toHaveClass('document');
  await expect(preview().locator('../..')).toHaveClass(/document-column/);
  await expect(preview().getByRole('heading', {name:'일반 Markdown'})).toBeVisible();
  await expect(preview().locator('table')).toContainText('Cell');
  for (const selector of ['.paragraph', 'li', 'td']) {
    expect(await preview().locator(selector).first().evaluate(node => getComputedStyle(node).wordBreak)).toBe('keep-all');
  }
  await expect(preview().locator('img')).toBeVisible();
  await expect(preview().locator('img')).toHaveJSProperty('complete',true);
  expect(await preview().locator('img').evaluate(node => node.naturalWidth > 0)).toBe(true);
  await configure('en','light','flat');
  expect(await preview().locator('..').evaluate(node => getComputedStyle(node).borderRadius)).toBe('0px');
  await configure('en','light');
  expect(await preview().locator('..').evaluate(node => getComputedStyle(node).borderRadius)).not.toBe('0px');
  if (screenshots) {
    for (const [language,theme] of [['en','light'],['ko','dark']]) {
      await configure(language,theme);
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        const geometry = await preview().evaluate(node => { const r=node.getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth,scroll:document.documentElement.scrollWidth}; });
        expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.width);
        expect(geometry.scroll).toBe(geometry.width);
        await page.screenshot({path:`tmp/text-mode-captures/read-${language}-${theme}-${width}.png`});
      }
    }
    await configure('en','light');
  }
  const readGeometry = await preview().locator('..').boundingBox();
  await page.getByTestId('view-visual').click();
  const textGeometry = await input().locator('..').boundingBox();
  expect(textGeometry.x).toBe(readGeometry.x);
  expect(textGeometry.y).toBe(readGeometry.y);
  expect(textGeometry.width).toBe(readGeometry.width);
  await page.keyboard.press('Control+Slash');
  const commandCenter = page.getByRole('dialog', {name:'Command center',exact:true});
  await commandCenter.getByRole('combobox').fill('> View:');
  await expect(commandCenter.getByRole('option', {name:/^View: (Read|Edit|Source)$/})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(input()).toHaveValue('# 일반 Markdown\n\n**서식이 아닌 텍스트**와 <kbd>Ctrl</kbd>\n\n| Header |\n| --- |\n| Cell |\n\n![Diagram](diagram.svg)\n\n- [x] Done\n\n$x+1$ and note[^a].\n\n[^a]: Footnote.\n');
  await expect(activeDocument(page).locator('.document-editor')).toHaveCount(0);
  await expect(activeDocument(page).locator('.heading-level')).toHaveCount(0);
  await expect(page.getByTestId('view-source')).toHaveCount(0);
  await expect(page.getByTestId('text-mode-notice')).toBeVisible();
  await expect(page.getByTestId('save')).toBeEnabled();
  if (screenshots) {
    await configure('ko','dark');
    await expect(page.getByTestId('text-mode-notice').filter({visible:true})).toHaveText('텍스트 모드 · Litzio 문서가 아닙니다');
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:900});
      await page.screenshot({path:`tmp/text-mode-captures/after-open-ko-dark-${width}.png`});
    }
    await configure('en','light');
  }
  await input().fill('```mermaid\ngraph LR\n  A --> B\n```\n\n    indented\n');
  await page.getByTestId('view-read').click();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copies = preview().getByRole('button', {name:'Copy code',exact:true});
  await expect(copies).toHaveCount(2);
  for (const [index, body] of ['graph LR\n  A --> B\n', 'indented\n'].entries()) {
    await copies.nth(index).click();
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(body);
    await expect(copies.nth(index)).toHaveText('Copied');
  }
  await page.getByTestId('view-visual').click();
  await expect(input()).toHaveValue('```mermaid\ngraph LR\n  A --> B\n```\n\n    indented\n');
  const content = '\t  한글 😀 **literal** <div>\n' + '긴 문장 soft wrap '.repeat(40) + 'identifier'.repeat(100) + '\n\n마지막 줄  \n';
  await input().fill(content);
  await expect(input().locator('..')).toHaveClass('document');
  expect(await input().evaluate(node => ({border:getComputedStyle(node).borderWidth,background:getComputedStyle(node).backgroundColor,outline:getComputedStyle(node).outlineStyle}))).toEqual({border:'0px',background:'rgba(0, 0, 0, 0)',outline:'none'});
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    expect(await input().evaluate(node => getComputedStyle(node).wordBreak)).toBe('keep-all');
    expect(await input().evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await input().press('End');
  await input().pressSequentially('X');
  await input().press('Control+z');
  await expect(input()).toHaveValue(content);
  await page.getByTestId('view-read').click();
  await expect(preview()).toContainText('literal');
  expect(await unloadBlocked()).toBe(true);
  await page.getByTestId('view-visual').click();
  await input().focus();
  expect(await unloadBlocked()).toBe(true);
  const element = await input().elementHandle();
  await save();
  // Inspect the first Saved commit directly, without a poll/reload hiding stale dirty state.
  expect(await unloadBlocked()).toBe(false);
  expect(await input().evaluate((node,old) => node === old,element)).toBe(true);
  await expect(input()).toBeFocused();
  expect((await read(file('foreign.md'))).source).toBe(content);
  await reload();
  await expect(preview()).toBeVisible();
  await page.getByTestId('view-visual').click();
  await expect(input()).toHaveValue(content);

  // External edits can change admission in either direction, only when Reload accepts them.
  await openPath(page,file('native.md'));
  await expect(activeDocument(page).locator('.document-editor')).toBeVisible();
  textFixture.replaceNative('external plain Markdown\n');
  await reload();
  await expect(preview()).toContainText('external plain Markdown');
  await page.getByTestId('view-visual').click();
  await expect(input()).toHaveValue('external plain Markdown\n');
  await input().fill(nativeBefore.source);
  await save();
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation','save-failed');
  expect((await read(file('native.md'))).source).toBe(nativeBefore.source);
  await reload();
  await expect(activeDocument(page).locator('.document-editor')).toBeVisible();

  await openPath(page,file('notes.txt'));
  await input().fill('txt-long-line'.repeat(100));
  expect(await input().evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await input().fill('닫기 전에 유지할 글자');
  await page.getByRole('button',{name:'Close notes.txt',exact:true}).click();
  await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(input()).toHaveValue('닫기 전에 유지할 글자');
  expect((await read(file('notes.txt'))).source).toContain('일반 텍스트 파일');
  await page.getByRole('button',{name:'Close notes.txt',exact:true}).click();
  await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('tab',{name:/^notes\.txt/})).toHaveCount(0);
  expect((await read(file('notes.txt'))).source).toBe('닫기 전에 유지할 글자');
  await openPath(page,file('notes.txt'));

  // A held real Save acknowledgement cannot mark input typed later as saved.
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { arrived = resolve; });
  const hold = async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } }); arrived(); await gate; await route.fulfill({response});
  };
  await input().fill('submitted text');
  await page.route('**/api/document',hold);
  try {
    await page.keyboard.press('Control+s'); await started;
    await input().fill('newer pending text\n복구할 내용');
    expect(await unloadBlocked()).toBe(true);
    release();
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','saved-pending');
  } finally { release(); await page.unroute('**/api/document',hold); }
  await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file('notes.txt') && r.snapshot.kind === 'text' && r.snapshot.text === 'newer pending text\n복구할 내용' && r.snapshot.savedSource === 'submitted text')).toBe(true);
  expect((await read(file('notes.txt'))).source).toBe('submitted text');
  page.once('dialog',dialog => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('recovery-prompt')).toBeVisible();
  await page.getByRole('button',{name:'Compare',exact:true}).click();
  await expect(page.locator('.recovery-diff')).toContainText('복구할 내용');
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await expect(page.getByTestId('recovery-prompt')).toBeHidden();
  await expect(input()).toHaveValue('newer pending text\n복구할 내용');
  expect((await read(file('notes.txt'))).source).toBe('submitted text');
  await input().focus(); await save();
  expect((await read(file('notes.txt'))).source).toBe('newer pending text\n복구할 내용');

  // A second writer changes the disk; restored text retains the old revision and conflicts.
  const checkpoint = await read(file('notes.txt'));
  await input().fill('local recovery after conflict');
  await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file('notes.txt') && r.recoveryText === 'local recovery after conflict')).toBe(true);
  const external = await page.request.post(origin + '/api/document',{ headers: { Connection: "close" },data:{kind:'text',path:file('notes.txt'),revision:checkpoint.revision,source:'external writer'}});
  expect(external.status()).toBe(200);
  page.once('dialog',dialog => dialog.accept()); await page.reload();
  await expect(page.getByTestId('recovery-prompt')).toBeVisible();
  await page.getByRole('button',{name:'Restore work',exact:true}).click();
  await input().focus(); await page.keyboard.press('Control+s');
  await expect(page.getByTestId('status')).toHaveAttribute('data-operation','save-conflict');
  await expect(input()).toHaveValue('local recovery after conflict');
  expect((await read(file('notes.txt'))).source).toBe('external writer');
  await input().pressSequentially(' review-latest-input');
  const latestConflictText = await input().inputValue();
  expect(latestConflictText).toContain('review-latest-input');
  await page.getByTestId('external-change').getByRole('button', { name: 'Compare with disk', exact: true }).click();
  const conflictComparison = page.getByTestId('save-comparison');
  await conflictComparison.getByRole('region', { name: 'Source differences', exact: true }).waitFor();
  await expect(conflictComparison).toContainText('local recovery after conflict');
  await expect(conflictComparison).toContainText(latestConflictText);
  await expect(conflictComparison).toContainText('external writer');
  await page.keyboard.press('Escape');
  await conflictComparison.waitFor({ state: 'detached' });
  await expect(input()).toHaveValue(latestConflictText);
  expect(await unloadBlocked()).toBe(true);
  expect((await read(file('native.md'))).source).toBe(nativeBefore.source);
  if (screenshots) {
    await page.getByRole('button',{name:'File actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Reload',exact:true}).click();
    await page.getByRole('button',{name:'Discard and reload',exact:true}).click();
    await expect(page.getByTestId('status')).toHaveAttribute('data-operation','ready');
    await input().fill('일반 텍스트 파일을 편집합니다.\n\n# 제목과 **강조**도 입력한 글자 그대로입니다.\n블록이나 미리보기 없이 텍스트만 다룹니다.\n\n한글 줄바꿈과 탭·저장 버튼 영역을 확인합니다.');

    for (const [language,theme] of [['en','light'],['ko','dark']]) {
      await configure(language,theme);
      await expect(page.getByTestId('text-mode-notice').filter({visible:true})).toHaveText(language === 'ko' ? '텍스트 모드 · Litzio 문서가 아닙니다' : 'Text mode · Not a Litzio document');
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        const geometry = await input().evaluate(node => { const r=node.getBoundingClientRect(); return {left:r.left,right:r.right,window:innerWidth}; });
        expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.window);
        await page.screenshot({path:`tmp/text-mode-captures/after-${language}-${theme}-${width}.png`});
      }
    }
    await configure('en','light');
  }
  await page.getByRole('button',{name:'Close notes.txt',exact:true}).click();
  await page.getByRole('dialog',{name:'Save changes?',exact:true}).getByRole('button',{name:"Don't save",exact:true}).click();
  await expect(page.getByRole('tab',{name:/^notes\.txt/})).toHaveCount(0);
  expect((await read(file('notes.txt'))).source).toBe('external writer');
  return {textSave:true,delayedAcknowledgement:true,closeProtection:true,textRecovery:true,externalConflict:true};
}
