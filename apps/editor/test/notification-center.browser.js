// Window-scoped notifications: applied Core numbering, render failures, lifecycle and navigation.
async (page, { openPath, expect, screenshots }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => localStorage.setItem('litzio.uiLanguage','en'));
  await page.reload();
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor();
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const file = [root, 'tmp', 'reference-save-reload', 'fixed.md'].join(sep);
  await openPath(page, file);
  const ownerId = await page.locator('[data-document-tab][data-active=true]').getAttribute('data-document-tab');
  const engine = page.locator('[data-document-tab][data-active=true] .document-editor');
  const center = page.locator('.notification-center');
  const toggle = () => center.locator(':scope > button');
  const expectEmpty = async (target = center, name = 'Notifications: none') => {
    await expect(target).toBeVisible();
    await expect(target.locator(':scope > button')).toHaveAccessibleName(name);
    await expect(target.locator(':scope > button')).toHaveText('');
    expect(await target.getAttribute('data-severity')).toBeNull();
    expect(await target.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--id-color-text-muted)';
      el.append(probe);
      const neutral = getComputedStyle(probe).color === getComputedStyle(el).color;
      probe.remove();
      return neutral;
    })).toBe(true);
    await expect(target.locator('li[data-severity]')).toHaveCount(0);
  };
  // Opening/closing Outline preserves notification controls; overlap is allowed.
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    // Resizing crosses the docked/overlay boundary. Wait for that state transition
    // before deciding whether the user's Outline toggle needs to be clicked.
    if (width === 1440) await expect(page.locator('.document-panel')).toBeVisible();
    else await expect(page.locator('.document-panel')).toBeHidden();
    for (const open of [true, false]) {
      const panel = page.locator('.document-panel');
      if (await panel.isVisible() !== open) await page.getByRole('button', { name: 'Outline', exact: true }).click();
      for (const expanded of [false, true]) {
        if (await toggle().getAttribute('aria-expanded') !== String(expanded)) await toggle().click();
        await expect(center).toBeVisible();
        await expect(toggle()).toHaveAttribute('aria-expanded', String(expanded));
        await expect(center.locator('ul')).toBeVisible({ visible: expanded });
        const bounds = await center.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
        if (screenshots) await page.screenshot({ path: `tmp/970-outline-${width}-${open ? 'panel' : 'closed'}-${expanded ? 'list' : 'bell'}.png` });
      }
    }
  }
  await toggle().click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectEmpty();
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(page.getByTestId('notification-announcement')).toBeEmpty();
  await engine.locator('p.paragraph').first().click();
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  expect(await engine.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await toggle().click();
  await expect(center.locator('ul')).toHaveText('No notifications');
  await expect(center.locator('ul')).toBeVisible();
  await toggle().click();
  if (screenshots) {
    for (const language of ['en','ko']) {
      if (language === 'ko') {
        await page.getByRole('button', {name:'Settings',exact:true}).click();
        await page.getByTestId('ui-language').selectOption('ko');
        await page.keyboard.press('Escape');
        await page.getByTestId('settings-dialog').waitFor({state:'detached'});
      }
      const theme = language === 'ko' ? 'dark' : 'light';
      await page.emulateMedia({colorScheme:theme});
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        await page.evaluate(async () => {
          await document.fonts.ready;
          document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0);
        });
        await expectEmpty(center, language === 'ko' ? '알림: 없음' : 'Notifications: none');
        for (const state of ['closed','open']) {
          if (state === 'open') await toggle().click();
          await expect(toggle()).toHaveAttribute('aria-expanded',String(state === 'open'));
          if (state === 'open') await expect(center.locator('ul')).toHaveText(language === 'ko' ? '알림 없음' : 'No notifications');
          const bounds = await center.boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 16);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
          expect(await center.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
          await page.mouse.move(0,0);
          await page.screenshot({path:`tmp/notification-837-after-${width}-${theme}-${language}-${state}.png`});
        }
        await toggle().click();
        // End-of-document selection still opens its toolbar. Notifications may overlap.
        await engine.evaluate(el => el.editor.commands.focus('end'));
        await engine.evaluate(el => {
          const e = el.editor;
          let range;
          e.state.doc.descendants((node,pos) => {
            if (node.isTextblock && node.textContent.length > 5) range = {from:pos+1,to:pos+6};
          });
          e.commands.setTextSelection(range);
        });
        const toolbar = page.locator('.selection-toolbar');
        await expect(toolbar).toBeVisible();
        await engine.evaluate(el => el.editor.commands.setTextSelection(el.editor.state.selection.to));
      }
    }
    await page.getByRole('button', {name:'설정',exact:true}).click();
    await page.getByTestId('ui-language').selectOption('en');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({colorScheme:'light'});
    await page.evaluate(() => document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0));

  }
  const change = async value => engine.evaluate((el, value) => {
    const e = el.editor;
    e.state.doc.forEach((node, pos) => {
      if (node.attrs.label === 'fixed-table') e.view.dispatch(e.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, enumerator: value }));
    });
  }, value);
  const diagram = async source => engine.evaluate((el, source) => {
    const e = el.editor;
    e.state.doc.forEach((node, pos) => {
      if (node.attrs.label === 'fixed-diagram') e.view.dispatch(e.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, mermaidSource: source }));
    });
  }, source);
  await engine.locator('p.paragraph').first().click();
  // Comparison-tab focus restoration can still be queued when its tab becomes active.
  // Read the selection only after the pointer click has reached the engine's first paragraph.
  await expect.poll(() => engine.evaluate(el => el.editor.state.selection.$from.parent.textContent))
    .toBe(await engine.locator('p.paragraph').first().textContent());
  const selection = await engine.evaluate(el => JSON.stringify(el.editor.state.selection.toJSON()));
  await change(null);
  await expect(center).toContainText('Applied document');
  await expect(center).toHaveAttribute('data-severity', 'warning');
  await expect(toggle()).toHaveAccessibleName('Notifications: Warning, 1');
  await expect(page.getByTestId('notification-announcement')).toHaveText('Notifications: Warning, 1');
  await expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  expect(await engine.evaluate(el => el.contains(document.activeElement))).toBe(true);
  expect(await engine.evaluate(el => JSON.stringify(el.editor.state.selection.toJSON()))).toBe(selection);
  if (screenshots) {
    await engine.locator('[data-testid=mermaid-preview] img').first().waitFor();
    for (const language of ['en', 'ko']) {
      if (language === 'ko') {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByTestId('ui-language').selectOption('ko');
        await page.keyboard.press('Escape');
        await page.getByTestId('settings-dialog').waitFor({ state: 'detached' });
      }
      for (const width of [1440, 640]) for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0); });
        await page.mouse.move(0,0);
        const geometry = await center.evaluate(el => {
          const list = el.querySelector('ul'), rect = el.getBoundingClientRect();
          return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
            width:innerWidth, height:innerHeight, contentFits:list.scrollWidth === list.clientWidth,
            pageFits:document.documentElement.scrollWidth <= innerWidth };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(geometry.width - 16);
        expect(geometry.top).toBeGreaterThanOrEqual(0);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
        expect(geometry.contentFits && geometry.pageFits).toBe(true);
        const sidebar = await page.getByTestId('sidebar').boundingBox();
        expect(geometry.left).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
        const alignment = await center.getByTestId('numbering-warning').evaluate(el => {
          const range = document.createRange(); range.selectNodeContents(el.querySelector('button'));
          return Math.abs(range.getBoundingClientRect().left - el.querySelector('p').getBoundingClientRect().left);
        });
        expect(alignment).toBeLessThan(1);
        await page.screenshot({ path: `tmp/notification-792-after-${width}-${theme}-${language}.png` });
      }
    }
    await page.getByRole('button', { name:'설정', exact:true }).click();
    await page.getByTestId('ui-language').selectOption('en');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({colorScheme:'light'});
  }
  await center.getByRole('button', { name:'Go to problem', exact:true }).click();
  // NotificationScope reveals the document before navigating on the next animation frame.
  // Observe that completed navigation, rather than the selection before its callback runs.
  await expect.poll(() => engine.evaluate(el => el.editor.state.selection.$from.parent.type.name)).toBe('tableCell');
  await diagram('this is not Mermaid');
  await expect(center.getByTestId('mermaid-error')).toBeVisible();
  await expect(center).toHaveAttribute('data-severity', 'error');
  await expect(toggle()).toContainText('Error · 2');
  await toggle().click();
  await diagram('graph LR\n  A --> B');
  await expect(center.getByTestId('mermaid-error')).toHaveCount(0);
  await expect(center.locator('ul')).toBeHidden(); // Removing an error must not reopen the remaining warning.
  await change('A.3');
  await expectEmpty();
  await change(null);
  await expect(center.locator('ul')).toBeVisible();
  await center.getByRole('button', { name:'Dismiss notification' }).click();
  await expectEmpty();
  await engine.evaluate(el => el.editor.commands.insertContent('unrelated'));
  await expectEmpty();
  await change('A.3');
  await change(null);
  await expect(center.locator('ul')).toBeVisible();
  // Hidden tabs keep their unresolved causes and navigation returns to the owning document.
  await openPath(page, initial.path);
  await expect(center.getByTestId('numbering-warning')).toHaveCount(1);
  await center.getByRole('button', {name:'Go to problem',exact:true}).click();
  await expect(page.locator(`[data-document-tab="${ownerId}"]`)).toHaveAttribute('data-active','true');
  await expect(engine).toBeFocused();
  const other = await page.context().newPage();
  try {
    await other.goto(`${origin}/?path=${encodeURIComponent(initial.path)}`);
    await other.locator('[data-testid="status"][data-operation="ready"]').waitFor();
    await expectEmpty(other.locator('.notification-center'));
  } finally { await other.close(); }
  await toggle().click();
  await change('A.3');
  await expectEmpty();
  // Pending Mermaid has no applied source. Only its draft preview reports input feedback.
  await diagram(null);
  await engine.getByRole('button', {name:'Write Mermaid',exact:true}).click();
  await page.getByTestId('mermaid-source').fill('this is not Mermaid');
  await expect(page.getByTestId('mermaid-edit-preview').getByTestId('mermaid-error')).toBeVisible();
  await expect(center.getByTestId('mermaid-error')).toHaveCount(0);
  await page.getByTestId('mermaid-cancel').click();
  await expectEmpty();
  await page.getByRole('button', {name:'File actions',exact:true}).click();
  await page.getByRole('menuitem', {name:'Copy path',exact:true}).click();
  await expect(center).toHaveAttribute('data-severity','info');
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(center.getByTestId('notice')).toBeHidden();
  await expect(toggle()).toHaveAccessibleName('Notifications: Information, 1');
  await expect(page.getByTestId('notification-announcement')).toHaveText('Notifications: Information, 1');
  await toggle().click();
  await expect(center.getByTestId('notice')).toContainText('Copied the file path.');
  await expect(center.getByTestId('notice')).toHaveCount(0, {timeout:6500});
  await expectEmpty(); // Existing one-shot lifetime, no focus change.
  // Localizing an unresolved app cause must not revive a dismissed item.
  await page.evaluate(() => {
    window.__notificationClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    Object.defineProperty(Navigator.prototype, 'clipboard', {configurable:true,get:()=>undefined});
  });
  try {
    await page.getByRole('button', {name:'File actions',exact:true}).click();
    await page.getByRole('menuitem', {name:'Copy path',exact:true}).click();
    await expect(center.getByTestId('error')).toBeVisible();
    await center.getByRole('button', {name:'Dismiss error',exact:true}).click();
    await page.getByRole('button', {name:'Settings',exact:true}).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    await expectEmpty(center, '알림: 없음');
  } finally {
    await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'clipboard', window.__notificationClipboard));
  }
  await page.getByRole('button', {name:'설정',exact:true}).click();
  await page.getByTestId('ui-language').selectOption('en');
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-dialog').waitFor({state:'detached'});
  await expectEmpty();
  // Independently caused standing warnings must never share a dismissal identity.
  const warningWindow = await page.context().newPage();
  try {
    await warningWindow.addInitScript(() => { localStorage.removeItem(JSON.stringify(["local", "litzio.openTabs"])); localStorage.setItem('litzio.uiLanguage','en'); });
    await warningWindow.route('**/api/document', route => route.fulfill({json:{start:true,sampleProblem:'unavailable'}}));
    await warningWindow.goto(origin);
    const warnings = warningWindow.locator('.notification-center');
    await expect(warnings.getByTestId('writeability-warning')).toContainText('Sample documents could not be prepared');
    await warnings.getByRole('button', {name:'Dismiss notification',exact:true}).click();
    await expectEmpty(warnings);
    const settings = warningWindow.getByRole('button', {name:'Settings',exact:true});
    await settings.focus();
    await warningWindow.evaluate(async () => {
      const {recoveryStorage} = await import('/src/recovery-storage.ts');
      window.originalRecoveryList = recoveryStorage.list;
      window.originalAnnouncement = document.querySelector('[data-testid=notification-announcement] span');
      recoveryStorage.list = async () => { throw new Error('New independent storage fault'); };
      window.dispatchEvent(new Event('focus'));
    });
    await expect(warnings.getByTestId('writeability-warning')).toContainText('New independent storage fault');
    await expect(warnings.getByTestId('writeability-warning')).toBeVisible();
    await expect(warnings.locator(':scope > button')).toHaveAttribute('aria-expanded','true');
    await expect(settings).toBeFocused();
    expect(await warningWindow.evaluate(() => document.querySelector('[data-testid=notification-announcement] span') !== window.originalAnnouncement)).toBe(true);
    await warningWindow.evaluate(async () => {
      const {recoveryStorage} = await import('/src/recovery-storage.ts');
      recoveryStorage.list = window.originalRecoveryList;
      window.dispatchEvent(new Event('focus'));
    });
    await expectEmpty(warnings);
  } finally { await warningWindow.close(); }
  // #1005/#986: load real applied warnings, then operate only visible controls.
  await openPath(page, [root, 'tmp', 'reference-save-reload', 'groups.md'].join(sep));
  const group = center.getByRole('button', {name:'Numbering warnings · 2', exact:true});
  await expect(group).toHaveAttribute('aria-expanded','false');
  await expect(center.getByTestId('numbering-warning').first()).toBeHidden();
  await group.click();
  await expect(center.getByTestId('numbering-warning').first()).toBeVisible();
  await expect(center.locator('.notification-context')).toHaveText(['groups.md']);
  await page.keyboard.press('Space');
  await expect(group).toHaveAttribute('aria-expanded','false');
  await expect(group).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('aria-expanded','true');
  await center.getByRole('button', {name:'Go to problem',exact:true}).last().click();
  await expect(engine).toBeFocused();
  expect(await engine.evaluate(el => el.editor.state.selection.node?.attrs.label)).toBe('group-two');
  await center.getByRole('button', {name:'Dismiss notification',exact:true}).first().click();
  await expect(group).toHaveCount(0); // A singleton uses the original row.
  await expect(center.getByTestId('numbering-warning')).toBeVisible();
  await expect(center.locator('.notification-context')).toHaveText(['groups.md']);
  expect(await center.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await center.getByRole('button', {name:'Dismiss notification',exact:true}).click();
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(toggle()).toBeFocused();
  await toggle().click();
  await expect(center.locator(':scope > ul')).toHaveText('No notifications');
  // Reload clears window memory; dismiss the earlier fixture's unsaved-work prompt.
  await page.reload();
  await page.getByRole('dialog', {name:'Restore unsaved work?',exact:true}).getByRole('button', {name:'Not now',exact:true}).click();
  await expect(page.getByRole('dialog', {name:'Restore unsaved work?',exact:true})).toHaveCount(0);
  await expect(group).toHaveAttribute('aria-expanded','false');
  await center.getByRole('button', {name:'Dismiss group: Numbering warnings · 2',exact:true}).click();
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(toggle()).toBeFocused();
  return { lifecycle:true, focusPreserved:true, inactiveNavigation:true, windowIsolation:true };
}
