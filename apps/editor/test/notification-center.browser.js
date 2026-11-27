// Window-scoped notifications: applied Core numbering, render failures, lifecycle and navigation.
async (page, { openPath, expect }) => {
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
    await expect(target.locator(':scope > button')).toHaveAccessibleName(name.startsWith("알림") ? "알림" : "Notifications");
    await expect(target.locator(':scope > button')).toHaveAccessibleDescription(name);
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
  for (const {width, reserved} of [{width:1440,reserved:0},{width:1024,reserved:0},{width:640,reserved:0},{width:640,reserved:138}]) {
    await page.evaluate(value => document.documentElement.style.setProperty("--window-controls-width", `${value}px`), reserved);
    await page.setViewportSize({ width, height: 900 });
    // Resizing crosses the docked/overlay boundary. Wait for that state transition
    // before deciding whether the user's Outline toggle needs to be clicked.
    if (width === 1440) await expect(page.locator('.document-panel')).toBeVisible();
    else await expect(page.locator('.document-panel')).toBeHidden();
    for (const open of [true, false]) {
      if (await toggle().getAttribute('aria-expanded') === 'true') await toggle().click();
      const panel = page.locator('.document-panel');
      if (await panel.isVisible() !== open) await page.getByRole('button', { name: 'Outline', exact: true }).click();
      for (const expanded of [false, true]) {
        if (await toggle().getAttribute('aria-expanded') !== String(expanded)) await toggle().click();
        await expect(center).toBeVisible();
        await expect(toggle()).toHaveAttribute('aria-expanded', String(expanded));
        await expect(center.locator('ul')).toBeVisible({ visible: expanded });
        const documentRect = await page.locator('.app-main').boundingBox();
        const bellRect = await toggle().boundingBox();
        const chrome = await page.locator('.top-bar').evaluate(header => {
          const boxes = ['.command-center-trigger','.assistant-trigger'].map(selector=>{
            const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};
          });
          return {boxes,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y))),
            reserved:!!header.querySelector('.notification-slot')};
        });
        expect(chrome.overlap,JSON.stringify(chrome)).toBe(false);
        expect(chrome.reserved,'The title strip keeps no notification slot').toBe(false);
        for (const box of chrome.boxes) expect(box.right).toBeLessThanOrEqual(width-reserved);
        if (reserved) expect(chrome.boxes[0].width).toBeGreaterThanOrEqual(160);
        if (width === 1440) await expect(page.locator('.assistant-trigger-label')).toBeVisible();
        // #1994: the bell occupies the Activity bar's bottom group directly above Settings, at its size.
        const place = await toggle().evaluate(bell => {
          const r=bell.getBoundingClientRect(), bar=document.querySelector('.activity-bar').getBoundingClientRect();
          const settings=document.querySelector('.activity-bar [data-activity-id="settings"]').getBoundingClientRect();
          return {inBar:r.left>=bar.left&&r.right<=bar.right&&r.top>=bar.top&&r.bottom<=bar.bottom,
            aboveSettings:r.bottom<=settings.top&&settings.top-r.bottom<=8&&Math.abs(r.left+r.width/2-(settings.left+settings.width/2))<=0.5,
            sameSize:Math.abs(r.width-settings.width)<=0.5&&Math.abs(r.height-settings.height)<=0.5,
            hit:bell.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
        });
        expect(place,JSON.stringify(place)).toEqual({inBar:true,aboveSettings:true,sameSize:true,hit:true});
        expect(bellRect.x + bellRect.width, 'Closed bell must remain outside document content').toBeLessThanOrEqual(documentRect.x);
        if (expanded) {
          // The manual list opens to the bell's right with its lower edge at the bell's; its left edge
          // matches the automatic cards: 8px right of the Activity bar.
          const popup = await center.locator('.notification-popover').boundingBox();
          const barRight = await page.getByTestId('activity-bar').evaluate(bar => bar.getBoundingClientRect().right);
          expect(Math.abs(popup.x - (barRight + 8)), JSON.stringify({popup, barRight})).toBeLessThanOrEqual(0.5);
          expect(Math.abs(popup.y + popup.height - (bellRect.y + bellRect.height))).toBeLessThanOrEqual(1);
          expect(popup.x + popup.width).toBeLessThanOrEqual(width);
          expect(popup.y).toBeGreaterThanOrEqual(0);
        }
        const bounds = await center.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
      }
    }
  }
  await toggle().click();
  await page.evaluate(() => document.documentElement.style.removeProperty('--window-controls-width'));
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
  await expect(toggle()).toHaveAccessibleDescription('Notifications: Warning, 1');
  await expect(page.getByTestId('notification-announcement')).toHaveText('Notifications: Warning, 1');
  await expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  expect(await engine.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await expect(center).toHaveAttribute('data-presentation','automatic');
  await expect(center.locator('.notification-auto')).toBeVisible();
  await expect(center.locator('.notification-popover')).toHaveCount(0);
  const saveHit = await page.getByTestId('save').evaluate(button => {
    const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  });
  expect(saveHit,'Automatic cards must leave the original Save action clickable').toBe(true);
  // Automatic cards rise from the window's lower edge just right of the Activity bar, beside the bell:
  // every title-strip and tab-row action keeps its rectangle and pointer hit.
  await center.locator('.notification-auto').evaluate(el => Promise.allSettled(el.getAnimations({subtree:true}).map(a => a.finished)));
  const autoPlacement = await center.locator('.notification-auto > ul').evaluate(card => {
    const c=card.getBoundingClientRect(), header=document.querySelector('.app-header').getBoundingClientRect();
    const bar=document.querySelector('.activity-bar').getBoundingClientRect();
    const actions=[...document.querySelectorAll('.app-titlebar button, .app-header button')].filter(button => button.getClientRects().length).map(button => {
      const r=button.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
      const visible=x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&button.contains(document.elementFromPoint(x,y));
      return {name:button.getAttribute('aria-label')||button.textContent.trim(),covered:Math.min(r.right,c.right)>Math.max(r.x,c.x)&&Math.min(r.bottom,c.bottom)>Math.max(r.y,c.y),visible};
    });
    return {card:{top:c.top,bottom:c.bottom,left:c.left},headerBottom:header.bottom,barRight:bar.right,actions};
  });
  expect(autoPlacement.card.top,JSON.stringify(autoPlacement)).toBeGreaterThanOrEqual(autoPlacement.headerBottom);
  expect(900 - autoPlacement.card.bottom,'Automatic cards sit at the window bottom, not below the tab strip').toBe(16);
  expect(autoPlacement.card.left - autoPlacement.barRight,'Automatic cards start 8px right of the Activity bar, like the manual list').toBe(8);
  expect(autoPlacement.actions.length).toBeGreaterThan(0);
  expect(autoPlacement.actions.filter(action => action.covered || !action.visible),JSON.stringify(autoPlacement.actions)).toEqual([]);
  await toggle().click();
  await expect(center).toHaveAttribute('data-presentation','closed');
  await toggle().click();
  await expect(center).toHaveAttribute('data-presentation','manual');
  expect(await engine.evaluate(el => JSON.stringify(el.editor.state.selection.toJSON()))).toBe(selection);
  await center.getByRole('button', {name:'Dismiss notification',exact:true}).focus();
  await page.keyboard.press('Escape');
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(toggle()).toBeFocused();
  await toggle().click();
  await center.getByRole('button', { name:'Go to problem', exact:true }).click();
  // NotificationScope reveals the document before navigating on the next animation frame.
  // Observe that completed navigation, rather than the selection before its callback runs.
  await expect.poll(() => engine.evaluate(el => el.editor.state.selection.$from.node(-1).type.name)).toBe('tableCell');
  if (await toggle().getAttribute('aria-expanded') === 'true') await toggle().click();
  await expect(center.locator('.notification-popover')).toHaveCount(0);
  await page.keyboard.press('F11');
  await expect(page.locator('.app-header')).toBeHidden();
  await diagram('this is not Mermaid');
  await expect(center.getByTestId('mermaid-error')).toBeVisible();
  await expect(center).toHaveAttribute('data-severity', 'error');
  await expect(toggle()).toContainText('2');
  const fullScreenCard = await center.locator('.notification-auto > ul').boundingBox();
  const fullScreenBell = await toggle().boundingBox();
  expect(fullScreenBell.x).toBe(8);
  expect(fullScreenCard.x).toBe(fullScreenBell.x + fullScreenBell.width + 8);
  await page.keyboard.press('F11');
  await expect(page.getByTestId('save')).toBeVisible();
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
  // Opening a document dismisses the nonmodal popover; causes remain in the registry.
  if (await toggle().getAttribute('aria-expanded') === 'false') await toggle().click();
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
  await expect(toggle()).toHaveAccessibleDescription('Notifications: Information, 1');
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
    await warningWindow.addInitScript(() => { localStorage.removeItem("litzio.openTabs.v2"); localStorage.setItem('litzio.uiLanguage','en'); });
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
  await expect(center.locator('#notification-list')).toHaveText('No notifications');
  // Reload clears window memory; dismiss the earlier fixture's unsaved-work prompt.
  await page.reload();
  await page.getByRole('dialog', {name:'Restore unsaved work?',exact:true}).getByRole('button', {name:'Not now',exact:true}).click();
  await expect(page.getByRole('dialog', {name:'Restore unsaved work?',exact:true})).toHaveCount(0);
  // Closing recovery is an outside click for the notification popover.
  await expect(toggle()).toHaveAccessibleDescription('Notifications: Warning, 2');
  if (await toggle().getAttribute('aria-expanded') === 'false') await toggle().click();
  await expect(group).toHaveAttribute('aria-expanded','false');
  // #1803/#1994: a short window keeps the expanded manual list right of the bell and scrolls it inside.
  // The list may use the whole window height beside the bell, so the two-warning fixture overflows at 280px;
  // that window also folds the screen entries into More.
  if (await center.getAttribute('data-presentation') === 'automatic') await toggle().click();
  if (await center.getAttribute('data-presentation') === 'closed') await toggle().click();
  await expect(center).toHaveAttribute('data-presentation','manual');
  await page.setViewportSize({ width: 1440, height: 280 });
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded','true');
  await expect.poll(async () => {
    const bell = await toggle().boundingBox();
    return center.locator('.notification-popover').evaluate((popup, bellRight) => {
      const r = popup.getBoundingClientRect(), list = popup.querySelector('ul');
      return { right: r.left >= bellRight, inside: r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        scrolls: list.scrollHeight > list.clientHeight };
    }, bell.x + bell.width);
  }).toEqual({ right: true, inside: true, scrolls: true });
  await group.click();
  // Screen entries fold into More in this window; the bell stays in the bottom group and joins
  // the bar's Up/Down order between More and Settings while keeping its own Tab stop.
  await toggle().click();
  await expect(center).toHaveAttribute('data-presentation','closed');
  const bar = page.getByTestId('activity-bar');
  const more = bar.getByRole('button', {name:'More', exact:true}), settings = bar.getByRole('button', {name:'Settings', exact:true});
  await expect(more).toBeVisible();
  expect(await toggle().evaluate(bell => { const r=bell.getBoundingClientRect(); return bell.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
  await settings.focus();
  await page.keyboard.press('ArrowUp');
  await expect(toggle()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(more).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(toggle()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(settings).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  if (await toggle().getAttribute('aria-expanded') === 'false') await toggle().click();
  await center.getByRole('button', {name:'Dismiss group: Numbering warnings · 2',exact:true}).click();
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(toggle()).toBeFocused();
  return { lifecycle:true, focusPreserved:true, inactiveNavigation:true, windowIsolation:true };
}
