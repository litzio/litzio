// Reading-only UI: real caret/pointer actions retain the existing chip behavior.
async (page, {openPath, activeDocument, expect, screenshots}) => {
  const origin = page.url().split('/').slice(0,3).join('/');
  const loaded = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = loaded.path.includes('\\') ? '\\' : '/';
  const file = [...loaded.path.split(sep).slice(0,-4),'tmp','reference-preview','reference-preview.md'].join(sep);
  await page.setViewportSize({width:1440,height:900});
  await openPath(page,file);
  const surface = activeDocument(page);
  const editor = surface.locator('.ProseMirror');
  const preview = surface.getByTestId('reference-preview');
  const notes = editor.getByTestId('footnote-reference');
  const citations = editor.locator('[data-citation]');
  const hover = async target => { await page.mouse.move(0,0); await target.hover(); };
  const state = () => editor.evaluate(dom => ({json:dom.editor.getJSON(), selection:{...dom.editor.state.selection.toJSON(),from:dom.editor.state.selection.from,to:dom.editor.state.selection.to},
    focused:dom.editor.view.hasFocus(), active:document.activeElement===dom}));
  const settle = () => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const initial = await state();
  // Manual captures run separately from assertions, using this same real fixture/state.
  if (screenshots) {
    for (const [width, language, theme] of [[1440, 'en', 'light'], [640, 'ko', 'dark']]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(({language, theme}) => {
        localStorage.setItem('litzio.uiLanguage', language);
        localStorage.setItem('litzio.theme', theme);
      }, {language, theme});
      await page.reload();
      await surface.locator('.ProseMirror').waitFor();
      await page.locator(`html[data-theme="${theme}"]`).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await surface.evaluate(dom=>dom.closest('.document-scroll').scrollTo(0,0));
      await hover(notes.first()); await expect(preview).toBeVisible(); await settle();
      const phase = await preview.locator('.reference-preview-hint').count() ? 'before' : 'after';
      await page.screenshot({path:`tmp/reference-preview-evidence/${phase}-endnote-${width}-${theme}-${language}.png`});
    }
    // In-document target previews (#1958).
    for (const [width, height, language, theme, targets] of [
      [1440, 900, 'en', 'light', ['tbl-small', 'fig-diagram', 'eq-example', 'sec-method', 'tbl-long']],
      [1440, 900, 'ko', 'dark', ['fig-diagram', 'tbl-long']],
      [1920, 1080, 'en', 'light', ['sec-method']]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(({language, theme}) => {
        localStorage.setItem('litzio.uiLanguage', language);
        localStorage.setItem('litzio.theme', theme);
      }, {language, theme});
      await page.reload();
      await surface.locator('.ProseMirror').waitFor();
      await page.locator(`html[data-theme="${theme}"]`).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      for (const label of targets) {
        const link = surface.locator(`.ProseMirror a[href="#${label}"]`);
        await link.evaluate(node=>node.scrollIntoView({block:'center'}));
        await hover(link); await surface.getByTestId('target-preview').waitFor(); await settle();
        await page.waitForTimeout(300);
        await page.screenshot({path:`tmp/target-preview-1958/${label}-${width}-${theme}-${language}.png`});
      }
    }
    await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
    return {manualCaptures:true};
  }
  const bounds = async target => expect.poll(()=>target.evaluate(node=> {
    const p=node.getBoundingClientRect(), v=node.closest('.document-scroll').getBoundingClientRect();
    const header=document.querySelector('.app-header').getBoundingClientRect().bottom;
    const css=getComputedStyle(node);
    return p.left>=Math.max(0,v.left) && p.right<=Math.min(innerWidth,v.right) && p.top>=Math.max(v.top,header) && p.bottom<=Math.min(innerHeight,v.bottom)
      && p.width<=parseFloat(css.getPropertyValue('--layout-reading-preview-width'))*parseFloat(getComputedStyle(document.documentElement).fontSize)+1;
  })).toBe(true);
  for (const target of [notes.first(),citations.first()]) {
    await hover(target);
    await expect(preview).toBeVisible();
    expect(await state()).toEqual(initial);
    await expect(target.locator('.cross-reference-chip')).not.toHaveAttribute('title');
    await expect(target).not.toHaveAttribute('tabindex');
    await expect(preview.locator('button, input, textarea, select, a, [tabindex], [contenteditable=true]')).toHaveCount(0);
    await bounds(preview);
  }
  await hover(notes.first());
  await expect(preview).not.toContainText('Click to go to its definition.');
  await expect(notes.first().getByRole('link')).toHaveAccessibleName('Endnote 1. Click to go to its definition.');
  await expect(preview.locator('strong')).toHaveText('Formatted');
  await expect(preview.locator('em')).toHaveText('endnote');
  await expect(preview.locator('code')).toHaveText('code');
  await expect(preview.locator('.katex')).toHaveCount(1);
  await expect(preview.locator('.cross-reference-chip')).toHaveText(['(1)','[1]']);
  await expect(preview.locator('.reference-preview-link')).toHaveText('local diagram');
  // The preview uses the same formatted bibliography parts and statuses as References.
  await hover(citations.first());
  for (const key of ['article','standard']) {
    const reference=surface.locator(`.bibliography-list [data-key="${key}"]`);
    await expect(preview).toContainText((await reference.textContent()).replace(/^\[\d+\]/,''));
  }
  await hover(citations.nth(1));
  await expect(preview).toContainText('Citation key not found');
  await expect(preview).toContainText('missing');
  await hover(citations.nth(2));
  await expect(preview).toContainText('Incomplete reference');
  for (const target of [notes.nth(1),notes.nth(2),citations.nth(3),citations.nth(4)]) {
    await hover(target); await expect(preview).toBeVisible(); await bounds(preview);
  }
  // In-document links and local reference chips show their target block, read-only (#1958).
  const targetPreview = surface.getByTestId('target-preview');
  const body = targetPreview.locator('.reference-preview-document');
  const link = href => editor.locator(`a[href="${href}"]`);
  const chip = label => editor.locator(`.cross-reference[data-label="${label}"]:not(.citation) > .cross-reference-chip`).first();
  const showTarget = async anchor => {
    await hover(anchor); await expect(targetPreview).toBeVisible();
    expect(await state()).toEqual(initial);
    await expect(targetPreview.locator('button, input, textarea, select, a, [tabindex], [contenteditable=true], [data-testid]')).toHaveCount(0);
    await bounds(targetPreview);
  };
  for (const anchor of [link('#tbl-small'), chip('tbl-small')]) {
    await showTarget(anchor);
    await expect(targetPreview.locator('td')).toHaveText(['Alpha','1']);
    await expect(targetPreview).toContainText('Small results');
    await expect(body).not.toHaveAttribute('data-clipped');
  }
  await expect(chip('tbl-small')).not.toHaveAttribute('title');
  for (const anchor of [link('#fig-diagram'), chip('fig-diagram')]) {
    await showTarget(anchor);
    await expect.poll(()=>targetPreview.locator('img').evaluate(image=>image.complete && image.naturalWidth>0)).toBe(true);
    await expect(targetPreview.locator('figcaption')).toContainText('Signal flow caption.');
  }
  for (const anchor of [link('#eq-example'), chip('eq-example')]) {
    await showTarget(anchor);
    await expect(targetPreview.locator('.katex')).toHaveCount(1);
    await expect(targetPreview).toContainText('(1)');
  }
  // A heading shows its section until the next heading.
  for (const anchor of [link('#sec-method'), chip('sec-method')]) {
    await showTarget(anchor);
    await expect(targetPreview.locator('h2')).toHaveText('Method');
    await expect(targetPreview).toContainText('The method paragraph follows its heading.');
    await expect(targetPreview).not.toContainText('Results');
  }
  // A long, wide target is clipped from its top-left at the reading cap, with a bottom fade.
  await showTarget(link('#tbl-long'));
  await expect(body).toHaveAttribute('data-clipped', 'both');
  expect(await targetPreview.evaluate(card => {
    const box = card.getBoundingClientRect(), first = card.querySelector('th').getBoundingClientRect();
    return first.left >= box.left && first.top >= box.top && card.querySelector('.table').getBoundingClientRect().width > box.width;
  })).toBe(true);
  // Missing targets keep the unresolved chip display and show no card.
  for (const anchor of [link('#missing'), chip('missing')]) {
    await hover(anchor); await settle();
    await expect(targetPreview).toHaveCount(0); await expect(preview).toHaveCount(0);
  }
  await expect(chip('missing')).toHaveAttribute('title', /^Unresolved reference/);
  // Keyboard reading: a caret inside the link, then beside the chip.
  await editor.locator('p').filter({hasText:'See the table'}).click({position:{x:2,y:8}});
  await page.mouse.move(0,0);
  await page.keyboard.press('Home');
  for (const character of 'See t') await page.keyboard.press('ArrowRight');
  await expect(targetPreview).toContainText('Small results');
  for (const character of 'he table') await page.keyboard.press('ArrowRight');
  await expect(targetPreview).toHaveCount(0);
  for (const character of ', ') await page.keyboard.press('ArrowRight');
  await expect(targetPreview).toContainText('Small results');
  expect((await state()).json).toEqual(initial.json);
  await page.keyboard.press('Escape'); await expect(targetPreview).toHaveCount(0);
  // Read view uses the same preview.
  await page.getByTestId('view-read').click();
  await hover(link('#fig-diagram')); await expect(targetPreview.locator('figcaption')).toContainText('Signal flow caption.');
  await page.getByTestId('view-visual').click();
  await expect(targetPreview).toHaveCount(0);
  expect((await state()).json).toEqual(initial.json);
  await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);
  // Clicking an endnote still selects/reveals its read-only definition.
  await notes.first().locator('sup').click();
  await settle();
  const definition=editor.getByTestId('footnote-definition');
  await expect(definition).toHaveAttribute('data-selected','true');
  await expect(definition).toHaveAttribute('aria-readonly','true');
  await expect(preview).toHaveCount(0);
  // Pointer click -> native chip selection -> input: no engine focus/selection repair.
  await citations.first().locator('.cross-reference-chip').click();
  await page.mouse.move(0,0); await settle();
  const clicked=await state();
  expect(clicked).toMatchObject({focused:true,active:true,selection:{type:'node'}});
  const selected=await editor.evaluate(dom=>dom.editor.state.selection.node?.type.name);
  expect(selected).toBe('citation');
  await page.keyboard.type('ZZ'); await settle();
  expect(await editor.locator('p').filter({hasText:'Evidence ZZ supports this claim.'}).count()).toBe(1);
  await expect(preview).toHaveCount(0);
  await page.keyboard.press('Control+z'); await settle();
  expect((await state()).json).toEqual(initial.json);
  // Enter through actual navigation, from a click in adjacent prose.
  await editor.locator('p').filter({hasText:'Evidence'}).click({position:{x:2,y:8}});
  await page.mouse.move(0,0);
  await expect.poll(()=>editor.evaluate(dom=>({type:dom.editor.state.selection.toJSON().type, text:dom.editor.state.selection.$from.parent.textContent}))).toMatchObject({type:'text',text:expect.stringContaining('Evidence')});
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(preview).toHaveCount(0);
  for (const character of 'Evidence') await page.keyboard.press('ArrowRight');
  await expect(preview).toBeVisible();
  const atCitation=await state();
  expect(atCitation).toMatchObject({focused:true,active:true,selection:{type:'text'}});
  await settle(); expect(await state()).toEqual(atCitation);
  await page.keyboard.press('Shift+ArrowRight'); await settle();
  await expect(preview).toHaveCount(0);
  expect((await state()).selection.from).toBeLessThan((await state()).selection.to);
  await page.keyboard.press('ArrowLeft'); await expect(preview).toBeVisible();
  await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);
  await page.keyboard.press('ArrowRight'); await expect(preview).toBeVisible();
  expect((await state()).selection.type).toBe('node');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async ()=>(await state()).selection.type).toBe('text');
  await expect(preview).toBeVisible();
  // Protocol-driven Korean composition at the native text caret closes the overlay.
  const cdp=await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.imeSetComposition',{text:'ㅎ',selectionStart:1,selectionEnd:1});
    await expect(preview).toHaveCount(0);
    await cdp.send('Input.imeSetComposition',{text:'한글',selectionStart:2,selectionEnd:2});
    await expect(preview).toHaveCount(0);
    await cdp.send('Input.insertText',{text:'한글'}); await settle();
    await expect(preview).toHaveCount(0);
    expect(await editor.textContent()).toContain('한글');
  } finally { await cdp.detach(); }
  await page.keyboard.press('Control+z'); await settle();
  expect((await state()).json).toEqual(initial.json);
  // Text caret on both sides of a reference; plain input closes without changing focus.
  await editor.locator('p').filter({hasText:'Read this note'}).click({position:{x:2,y:8}});
  await page.mouse.move(0,0);
  await expect.poll(()=>editor.evaluate(dom=>({type:dom.editor.state.selection.toJSON().type, text:dom.editor.state.selection.$from.parent.textContent}))).toMatchObject({type:'text',text:expect.stringContaining('Read this note')});
  await page.keyboard.press('Home');
  for (const character of 'Read this note') await page.keyboard.press('ArrowRight');
  await expect(preview).toContainText('Formatted');
  expect(await editor.evaluate(dom=>dom.editor.state.selection.empty)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(preview).toContainText('Formatted');
  expect((await state()).selection.type).toBe('node');
  await page.keyboard.press('ArrowRight');
  await expect(preview).toContainText('Formatted');
  await page.keyboard.press('ArrowRight'); await expect(preview).toHaveCount(0);
  await page.keyboard.press('ArrowLeft'); await expect(preview).toBeVisible();
  await page.keyboard.type('Q'); await settle(); await expect(preview).toHaveCount(0);
  expect((await state()).active).toBe(true);
  expect(await editor.evaluate(dom=>dom.editor.state.selection.$from.parent.textContent)).toBe('Read this noteQ without leaving the paragraph.');
  await page.keyboard.press('Control+z'); await settle();
  expect((await state()).json).toEqual(initial.json);
  // Unresolved atoms can exist transiently while editing; no weaker Core admission.
  await editor.evaluate(dom=> {
    const e=dom.editor; const at=e.state.doc.child(0).nodeSize+1;
    e.view.dispatch(e.state.tr.insert(at,e.schema.nodes.footnoteReference.create({label:'absent'})));
  });
  await hover(notes.first());
  await expect(preview).toHaveText('Unresolved: no definition of footnote [^absent] in this document');
  await page.keyboard.press('Control+z'); await settle();
  expect((await state()).json).toEqual(initial.json);
  // Long document: follow scrolling, then dismiss when the anchor leaves its viewport.
  await editor.evaluate(dom=>dom.editor.commands.insertContentAt(dom.editor.state.doc.content.size,
    Array.from({length:24},()=>({type:'paragraph',content:[{type:'text',text:'Reading context.'}]})),{updateSelection:false}));
  await hover(notes.first()); await expect(preview).toBeVisible();
  await surface.evaluate(dom=>dom.closest('.document-scroll').scrollTo(0,1000));
  await expect(preview).toHaveCount(0);
  // Same content in split groups at the two supported review widths.
  await page.setViewportSize({width:1440,height:900});
  const id=await surface.getAttribute('data-document-tab');
  await page.locator(`#tab-${id}`).click({button:'right'});
  await page.getByRole('menuitem',{name:'Open to the right',exact:true}).click();
  await expect(page.locator('[data-editor-group]')).toHaveCount(2);
  const moved=page.locator(`[data-document-tab="${id}"]`);
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:900});
    for (const target of [moved.getByTestId('footnote-reference').first(),moved.locator('.ProseMirror [data-citation]').first()]) {
      await hover(target); await expect(moved.getByTestId('reference-preview')).toBeVisible(); await bounds(moved.getByTestId('reference-preview'));
    }
  }
  return {hover:true,caret:true,clickNavigation:true,nativeInput:true,koreanComposition:true,unresolved:true,split:true};
}
