// Protect the development entry's lazy module/CSS/provider connection, not primitive internals.
// pnpm browser:test ui-gallery
async (page, { expect, screenshots, withBlockHover }) => {
  await page.goto(page.url().split('/').slice(0, 3).join('/') + '/ui-gallery');
  await expect(page.getByRole('heading', { name: 'Litzio UI gallery' })).toBeVisible();
  await expect(page.locator('[data-testid="ui-gallery"]')).toHaveCSS('overflow-y', 'auto');
  // The plugin adapter must accept old code while the core exposes only outline.
  expect(await page.evaluate(async () => {
    const { screenUI } = await import('/src/views/screen-ui.ts');
    return screenUI.Button({variant:'secondary'}).props.variant === 'outline';
  })).toBe(true);
  const navigation = page.getByRole('navigation', { name: 'Gallery elements' });
  await expect(navigation.getByRole('button', {name:'Controls',exact:true})).toHaveAttribute('aria-current','page');
  await navigation.getByRole('button',{name:'Surfaces',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Button · Input · icons',exact:true})).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Open dialog', exact: true });
  if (screenshots) {
    await page.setViewportSize({width:1280,height:800});
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    // Sample the real CSS transitions at reproducible fractions of their own duration.
    // Pausing is evidence capture only, never a regression assertion or product path.
    const frames = async (name, target) => {
      const count = await target.evaluate(el => {
        const animations = el.getAnimations({subtree:true});
        animations.forEach(a => a.pause()); return animations.length;
      });
      expect(count, name + ' has a running transition').toBeGreaterThan(0);
      for (const [index, fraction] of [0.15,0.4,0.7,1].entries()) {
        await target.evaluate((el, fraction) => el.getAnimations({subtree:true}).forEach(a => {a.currentTime = Number(a.effect.getTiming().duration) * fraction;}),fraction);
        await page.screenshot({path:`docs/design/assets/motion-1681/${name}-${index+1}.png`});
      }
      await target.evaluate(el => el.getAnimations({subtree:true}).forEach(a => a.finish()));
    };
    await page.emulateMedia({reducedMotion:'no-preference'});
    await trigger.click();
    await frames('dialog',page.locator('[data-slot="dialog-content"]'));
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await page.emulateMedia({reducedMotion:'reduce'}); await trigger.click();
    await page.screenshot({path:'docs/design/assets/motion-1681/dialog-reduced.png'});
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await navigation.getByRole('button',{name:'Menus',exact:true}).click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByRole('button',{name:'Actions',exact:true}).click();
    await frames('menu',page.locator('[data-slot="dropdown-menu-content"]'));
    await page.getByRole('menuitem',{name:'Open',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Open selected');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'Actions',exact:true}).click();
    await page.screenshot({path:'docs/design/assets/motion-1681/menu-reduced.png'});
    await page.keyboard.press('Escape');
    await navigation.getByRole('button',{name:'Notifications',exact:true}).click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByRole('group',{name:'Example state',exact:true}).getByRole('button',{name:'Error',exact:true}).click();
    await frames('notification',page.locator('.notification-auto'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.screenshot({path:'docs/design/assets/motion-1681/notification-reduced.png'});
    await page.getByRole('group',{name:'Example state',exact:true}).getByRole('button',{name:'Default',exact:true}).click();
    await navigation.getByRole('button',{name:'Controls',exact:true}).click();
    const outline = page.getByRole('button',{name:'Outline',exact:true});
    await page.emulateMedia({reducedMotion:'no-preference'}); await outline.hover();
    await frames('hover',outline);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.screenshot({path:'docs/design/assets/motion-1681/hover-reduced.png'});
    await navigation.getByRole('button',{name:'Surfaces',exact:true}).click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:640,height:800});
    // Exercise the production theme crossfade path in this automation-only review.
    await page.evaluate(async () => {
      Object.defineProperty(navigator, 'webdriver', {configurable:true,get:()=>false});
      const {applyTheme} = await import('/src/theme.ts');
      await applyTheme('dark');
      await Promise.allSettled(document.getAnimations().map(a=>a.finished));
      delete navigator.webdriver;
    });
    await trigger.click();
    await page.locator('[data-slot="dialog-content"]').evaluate(async el => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.allSettled(el.getAnimations().map(a=>a.finished));
    });
    await page.screenshot({path:'tmp/motion-dark-640-dialog.png'});
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await navigation.getByRole('button',{name:'Menus',exact:true}).click();
    await page.getByRole('button',{name:'Actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Open',exact:true}).click();
    await page.getByRole('button',{name:'Hover or focus me',exact:true}).hover();
    await page.locator('[data-slot="tooltip-content"]').waitFor();
    await page.locator('[data-slot="tooltip-content"]').evaluate(async el => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.allSettled(el.getAnimations().map(a=>a.finished));
    });
    await page.screenshot({path:'tmp/motion-dark-640-tooltip.png'});
    await page.mouse.move(0,0);
    await page.evaluate(async () => { const {applyTheme} = await import('/src/theme.ts'); await applyTheme('light',false); });
    await page.setViewportSize({width:1280,height:720});
    await page.emulateMedia({reducedMotion:'reduce'});
    await navigation.getByRole('button',{name:'Surfaces',exact:true}).click();
  }
  // Reduced motion is the runner default; protect both a control and an overlay.
  await expect(trigger).toHaveCSS('transition-duration', '0s');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Example dialog' });
  expect(await dialog.evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(value => parseFloat(value) === 0))).toBe(true);
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  // Reuse the same public close/focus regression with motion enabled.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const durationUsesToken = (el, token) => {
    const style = getComputedStyle(el), value = style.getPropertyValue(token).trim();
    const seconds = parseFloat(value) / (value.endsWith('ms') ? 1000 : 1);
    return seconds > 0 && parseFloat(style.transitionDuration) === seconds;
  };
  expect(await trigger.evaluate(durationUsesToken, '--duration-fast')).toBe(true);
  const reopenPoint=await trigger.boundingBox();
  await trigger.evaluate(button=>button.addEventListener('click',()=>{
    window.__reopenedDuringExit=!!document.querySelector('[data-slot="dialog-content"][data-ending-style]');
  }));
  await trigger.click();
  expect(await dialog.evaluate(durationUsesToken, '--duration-normal')).toBe(true);
  // Exercise a complete entry/exit, not a close before the entry transition starts.
  await dialog.evaluate(async el=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.allSettled(el.getAnimations().map(a=>a.finished));
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveAttribute('data-ending-style','');
  // Raw pointer input must reach the underlying trigger before exit completion.
  await page.mouse.click(reopenPoint.x+reopenPoint.width/2,reopenPoint.y+reopenPoint.height/2);
  expect(await page.evaluate(()=>window.__reopenedDuringExit)).toBe(true);
  await expect(dialog).not.toHaveAttribute('data-ending-style');
  await expect(dialog.getByRole('textbox',{name:'Name'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  // Rapid reopening and menu handoff use the same production primitives.
  for (let index = 0; index < 3; index++) {
    await trigger.click(); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  }
  // Removed notifications stay present only for their CSS exit; live focus/count are immediate.
  await navigation.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.getByRole('group',{name:'Example state',exact:true}).getByRole('button',{name:'Error',exact:true}).click();
  const notifications=page.locator('.ui-gallery-section .notification-center');
  await expect(notifications.getByRole('alert')).toBeVisible();
  await notifications.locator('.notification-auto').evaluate(async el=>{
    await Promise.allSettled(el.getAnimations({subtree:true}).map(a=>a.finished));
  });
  await notifications.getByRole('button',{name:'Dismiss notification',exact:true}).click();
  const leaving=notifications.locator('li[data-ending-style]');
  await expect(leaving).toHaveCount(1);
  expect(await leaving.evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true')).toBe(true);
  await expect(notifications.getByRole('button',{name:'Notifications',exact:true})).toBeFocused();
  await expect(notifications.getByRole('button',{name:'Notifications',exact:true})).toHaveAccessibleDescription('Notifications: none');
  await leaving.evaluate(async el=>{await Promise.allSettled(el.getAnimations().map(a=>a.finished));});
  await expect(leaving).toHaveCount(0);
  await page.getByRole('group',{name:'Example state',exact:true}).getByRole('button',{name:'Default',exact:true}).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await navigation.getByRole('button',{name:'Controls',exact:true}).click();
  // ChoiceGroup owns required-single state; buttons retain native Tab/Enter/Space.
  const choices = page.getByRole('group', { name: 'Example numbering', exact: true });
  const automatic = choices.getByRole('button', { name: 'Automatic', exact: true });
  const fixed = choices.getByRole('button', { name: 'Fixed', exact: true });
  await automatic.focus();
  await page.keyboard.press('Tab');
  await expect(fixed).toBeFocused();
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(fixed).toHaveAttribute('aria-pressed', 'true');
  await expect(automatic).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(fixed).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Example state', exact: true }).getByRole('button', { name: 'Disabled', exact: true }).click();
  await expect(automatic).toBeDisabled();
  await expect(fixed).toBeDisabled();
  await page.getByRole('group', { name: 'Example state', exact: true }).getByRole('button', { name: 'Default', exact: true }).click();
  await navigation.getByRole('button',{name:'Shared parts',exact:true}).click();
  const shared = page.getByRole('region',{name:'공용 정보 부품',exact:true});
  const panelHeader = await shared.locator('.panel-header').evaluate(n => {
    const probe = document.createElement('div'); probe.style.height = 'calc(var(--layout-document-tab-height) + var(--border-width))'; n.append(probe);
    const expectedHeight = probe.getBoundingClientRect().height; probe.remove();
    const style = getComputedStyle(n), title = n.querySelector('h2').getBoundingClientRect(), actions = n.querySelector('.panel-header-actions').getBoundingClientRect();
    return { height: n.getBoundingClientRect().height, expectedHeight, paddingTop: style.paddingTop, paddingLeft: style.paddingLeft, border: style.borderBottom, titleCenter: title.top + title.height / 2, actionsCenter: actions.top + actions.height / 2 };
  });
  expect(panelHeader.height).toBe(panelHeader.expectedHeight);
  expect(panelHeader.titleCenter).toBe(panelHeader.actionsCenter);
  expect(await page.evaluate(async () => {
    const {screenUI} = await import('/src/views/screen-ui.ts');
    const {Row} = await import('/src/components/ui/row.tsx');
    const {SettingsRow} = await import('/src/components/ui/settings.tsx');
    return screenUI.Row === Row && SettingsRow === Row;
  })).toBe(true);
  const geometry = async section => section.locator('.shared-row').evaluateAll(rows => rows.map(row => {
    const label = row.querySelector('.settings-label').getBoundingClientRect();
    const value = row.querySelector('.settings-row-control').getBoundingClientRect();
    const children = [...row.querySelectorAll('button,select,input')].map(n=>n.getBoundingClientRect());
    return {valueWidth:value.width,rowWidth:row.getBoundingClientRect().width,left:label.left,right:value.right,top:value.top,labelBottom:label.bottom,valueLeft:value.left,overflow:row.scrollWidth>row.clientWidth,controlRight:children.at(-1)?.right,selectWidth:row.querySelector('select')?.getBoundingClientRect().width};
  }));
  await page.setViewportSize({width:1440,height:1100});
  const rows = shared.locator('.shared-section').first();
  const wide = await geometry(rows);
  expect(wide.every(r=>Math.abs(r.left-wide[0].left)<1 && Math.abs(r.right-wide[0].right)<1 && !r.overflow)).toBe(true);
  expect(wide.filter(r=>r.controlRight).every(r=>Math.abs(r.controlRight-r.right)<1)).toBe(true);
  expect(wide[0].selectWidth).toBe(wide[1].selectWidth);
  expect(wide.every(r=>r.valueWidth<=r.rowWidth*.6)).toBe(true);
  expect(wide[2].valueWidth).toBeLessThan(wide[0].valueWidth);
  // Gallery headings must retain the same production role as a Section outside it.
  const sectionStyles = await shared.locator('.shared-section > h2').evaluateAll(headings=>{
    const sample=document.createElement('h2');sample.className='type-group-title';document.body.append(sample);
    const recipe=n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontWeight,s.color,s.borderBottomStyle,s.borderBottomColor];};
    const reference=recipe(sample), actual=headings.map(recipe);sample.remove();return {reference,actual};
  });
  expect(sectionStyles.actual.length).toBeGreaterThan(0);
  for(const actual of sectionStyles.actual)expect(actual).toEqual(sectionStyles.reference);
  const path = rows.locator('code');
  const originalPath='/documents/research/measurements/long-directory-name/measurement-report.md';
  await expect(path).toHaveText(originalPath);
  const breaks = await path.evaluate(n=>[...n.childNodes].map(node=>{
    if(node.nodeName==='WBR')return {break:true,after:node.previousSibling?.textContent};
    const range=document.createRange();range.selectNodeContents(node);
    return {text:node.textContent,lines:[...range.getClientRects()].filter(r=>r.width>0).length};
  }));
  expect(breaks.filter(n=>n.break).length).toBeGreaterThan(0);
  expect(breaks.filter(n=>n.break).every(n=>/[\/\\.\-_]$/.test(n.after))).toBe(true);
  expect(breaks.filter(n=>n.text).every(n=>n.lines===1)).toBe(true);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await path.evaluate(n=>{const range=document.createRange();range.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(range);});
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(originalPath);
  await page.evaluate(()=>getSelection().removeAllRanges());
  const narrow = shared.getByRole('region',{name:'좁은 열',exact:true});
  expect((await geometry(narrow)).every(r=>r.top>=r.labelBottom && Math.abs(r.valueLeft-r.left)<1 && !r.overflow)).toBe(true);
  const hostDot = shared.locator('.host-status .screen-status > span').first();
  const pluginDot = shared.locator('.screen-status[data-tone="ok"][data-variant="pill"] > span').first();
  expect(await hostDot.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe(await pluginDot.evaluate(n=>getComputedStyle(n).backgroundColor));
  await page.setViewportSize({width:640,height:1100});
  expect((await geometry(rows)).every(r=>r.top>=r.labelBottom && Math.abs(r.valueLeft-r.left)<1 && !r.overflow)).toBe(true);
  if(screenshots) for(const [width,theme] of [[1440,'light'],[1440,'dark'],[640,'light']]) {
    await page.setViewportSize({width,height:1500});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await shared.screenshot({path:`docs/design/assets/settings-parts-1685/gallery-${width}-${theme}.png`});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.setViewportSize({width:1440,height:1000});
  await navigation.getByRole('button',{name:'Screen parts',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Target measurement',exact:true})).toBeVisible();
  const taskHeader = await page.locator('.task-header').evaluate(n => { const s = getComputedStyle(n); return { paddingTop: s.paddingTop, paddingBottom: s.paddingBottom, paddingLeft: s.paddingLeft, border: s.borderBottom }; });
  expect(taskHeader.paddingTop).toBe(taskHeader.paddingLeft);
  expect(taskHeader.paddingBottom).toBe(taskHeader.paddingTop);
  expect(taskHeader.paddingLeft).toBe(panelHeader.paddingLeft);
  expect(taskHeader.border).toBe(panelHeader.border);
  expect(taskHeader.paddingTop).not.toBe(panelHeader.paddingTop);
  // Progress remains distinguishable from success even without motion or color.
  const progressMark = page.locator('.screen-status[data-tone="progress"] svg').first();
  await expect(progressMark).toBeVisible();
  await expect(page.locator('.screen-status[data-tone="ok"] svg')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(progressMark).not.toHaveCSS('animation-name','none');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(progressMark).toBeVisible();
  await expect(progressMark).toHaveCSS('animation-name','none');
  const statusGeometry = await page.locator('.screen-status').evaluateAll(nodes => {
    return ['ok','progress'].map(tone => {
      const n = nodes.find(n => n.dataset.tone === tone);
      const pill = n.getBoundingClientRect();
      const range = document.createRange();range.selectNodeContents(n.lastChild);
      const label = range.getBoundingClientRect();
      return {height:pill.height,labelLeft:label.left-pill.left,labelTop:label.top-pill.top};
    });
  });
  expect(statusGeometry[1]).toEqual(statusGeometry[0]);
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const theme of ['light','dark']) for(const accent of ['plum','green']) {
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(({theme,accent})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.accent=accent;},{theme,accent});
    const ok=page.locator('.screen-status[data-tone="ok"]').first();
    await expect(ok).toHaveCSS('color',theme==='light'?'rgb(20, 115, 75)':'rgb(112, 212, 165)');
    await ok.scrollIntoViewIfNeeded();
    if(screenshots) {
      await page.screenshot({path:`tmp/status-gallery-${accent}-${theme}.png`});
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.screenshot({path:`tmp/status-gallery-${accent}-${theme}-reduced.png`});
      await page.emulateMedia({reducedMotion:'no-preference'});
    }
  }
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.dataset.accent='plum';});
  const selection=page.getByRole('region',{name:'Screen path selection'});
  await selection.getByRole('button',{name:'Choose document example'}).click();
  await page.getByRole('dialog').getByRole('option',{name:'report.md',exact:true}).click();
  await page.getByRole('dialog').getByTestId('folder-open').click();
  await expect(selection.locator('output')).toHaveText('{"path":"/example/report.md","kind":"document"}');
  await selection.getByRole('button',{name:'Choose file example'}).click();
  await expect(page.getByRole('dialog').getByRole('option',{name:'README',exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('option',{name:'data.CSV',exact:true}).click();
  await page.getByRole('dialog').getByTestId('folder-open').click();
  await expect(selection.locator('output')).toHaveText('{"path":"/example/data.CSV","kind":"file"}');
  await selection.getByRole('button',{name:'Choose CSV example'}).click();
  await expect(page.getByRole('dialog').getByRole('option',{name:'data.CSV',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('option',{name:'settings.json',exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('option',{name:'README',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(selection.locator('output')).toHaveText('null');
  await selection.getByRole('button',{name:'Pick while folder closes'}).click();
  await expect(selection.locator('output')).toHaveText('AbortError');await expect(page.getByRole('dialog')).toHaveCount(0);
  if (screenshots) for (const width of [1440,640]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
    await page.getByRole("heading",{name:"Screen parts",exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-${width}-${theme}.png`});
    await page.getByRole("figure",{name:"Long time labels",exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-long-${width}-${theme}.png`});
    await page.getByRole('region',{name:'Measurements',exact:true}).getByRole('table').scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-table-${width}-${theme}.png`});
    await page.getByRole('region',{name:'Wide measurements',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/parts-wide-${width}-${theme}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
  const tableWidth=await page.locator('.screen-data-table').first().evaluate(n=>({table:n.querySelector('table').getBoundingClientRect().width,parent:n.getBoundingClientRect().width}));
  expect(tableWidth.table).toBeLessThan(tableWidth.parent / 2);
  const longTable=page.getByRole('region',{name:'Long descriptions',exact:true});
  for (const cell of await longTable.locator('tbody td:first-child').all()) {
    expect(await cell.evaluate(n=>({wrapped:n.getBoundingClientRect().height>parseFloat(getComputedStyle(n).lineHeight)*2,contained:n.scrollWidth<=n.clientWidth}))).toEqual({wrapped:true,contained:true});
  }
  for(const heading of await page.getByRole('region',{name:'Measurements',exact:true}).getByRole('columnheader').all()) {
    expect(await heading.evaluate(n=>[...n.querySelectorAll('button')].every(b=>b.getBoundingClientRect().right<=n.getBoundingClientRect().right && b.scrollWidth<=b.clientWidth))).toBe(true);
  }
  // Sort/filter controls must not move the title away from its column's value edge.
  const alignedTable = page.getByRole('region',{name:'Measurements',exact:true});
  const columnEdges = (region = alignedTable) => region.getByRole('table').evaluate(table => {
    const textEdge = (element, right) => {
      const text = [...element.childNodes].find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim());
      const range = document.createRange(); range.selectNodeContents(text);
      const rect = range.getBoundingClientRect(); return right ? rect.right : rect.left;
    };
    return [...table.querySelectorAll('th')].map((th,index)=>{
      const td=table.querySelectorAll('tbody tr:first-child td')[index];
      const right=th.hasAttribute('data-numeric');
      return Math.abs(textEdge(th.querySelector('button'),right)-textEdge(td.querySelector('a')??td,right)) < 1;
    });
  });
  expect((await columnEdges()).every(Boolean)).toBe(true);
  expect((await columnEdges(page.getByRole('region',{name:'Wide measurements',exact:true}))).every(Boolean)).toBe(true);
  await alignedTable.getByRole('columnheader').first().getByRole('button').first().click();
  expect((await columnEdges()).every(Boolean)).toBe(true);
  const focusedRow = alignedTable.locator('tbody tr').nth(1);
  await focusedRow.getByRole('cell').last().click();
  await expect(focusedRow).toHaveAttribute('aria-selected','true');
  await alignedTable.getByRole('columnheader').first().getByRole('button').first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(alignedTable).toBeFocused();
  await expect(alignedTable).toHaveCSS('outline-style','none');
  await expect(focusedRow).toHaveCSS('outline-style','solid');
  for(const width of [1440,640]) {
    await page.setViewportSize({width,height:1000});
    const wide=page.getByRole('region',{name:'Wide measurements',exact:true});
    expect(await wide.evaluate(n=>n.scrollWidth>n.clientWidth && n.getBoundingClientRect().width<=n.closest('.screen-data-table').getBoundingClientRect().width)).toBe(true);
  }
  // Compare computed roles (tokens may use rem while computed styles use px).
  const summaryRole = await page.locator('.screen-summary-value').evaluateAll(nodes => {
    const reference=document.createElement('span');reference.className='type-category-title';reference.style.visibility='hidden';document.body.append(reference);
    const font=el=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.color];};
    const expected=font(reference),actual=nodes.map(font);reference.remove();return {actual,expected};
  });
  for(const actual of summaryRole.actual) expect(actual).toEqual(summaryRole.expected);
  const cards = page.locator('.screen-summary');
  const boxes = await cards.evaluateAll(nodes => nodes.map(n => ({height:n.getBoundingClientRect().height, label:n.firstElementChild.getBoundingClientRect().top,value:n.querySelector('.screen-summary-value').getBoundingClientRect().top})));
  expect(boxes[0]).toEqual(boxes[1]);
  for (const width of [1440,640]) {
  await page.setViewportSize({width,height:1000});
  const longFigure = page.getByRole('figure',{name:'Long time labels',exact:true});
  // Read ticks only after the chart surface has been re-laid out at this viewport width,
  // so the previous width's ticks cannot satisfy the endpoint assertions.
  let geometry;
  await expect.poll(async () => {
    geometry = await longFigure.evaluate(figure => {
      const surface = figure.querySelector('svg.recharts-surface');
      const container = figure.querySelector('.recharts-responsive-container')?.getBoundingClientRect().width;
      const nodes = [...figure.querySelectorAll('text')].filter(n => n.textContent.includes('2026-11-13T00:'));
      return {
        laidOut: !!surface && container > 0 && Math.abs(container - Number(surface.getAttribute('width'))) < 1,
        labels: nodes.map(n => n.textContent),
        lines: nodes.map(n => n.querySelectorAll('tspan').length),
        bounds: nodes.map(n => n.getBoundingClientRect().toJSON()),
        frame: figure.getBoundingClientRect().toJSON(),
      };
    });
    return geometry.laidOut;
  }).toBe(true);
  const { labels, lines, bounds, frame } = geometry;
  expect(labels[0]).toBe('2026-11-13T00:00:00Z');
  expect(labels.at(-1)).toBe('2026-11-13T00:59:00Z');
  for (const count of lines) expect(count).toBeLessThanOrEqual(1);
  expect(bounds.every(b => b.width > 0)).toBe(true);
  for(let i=1;i<bounds.length;i++) expect(bounds[i].left).toBeGreaterThanOrEqual(bounds[i-1].right);
  expect(bounds[0].left).toBeGreaterThanOrEqual(frame.x);
  expect(bounds.at(-1).right).toBeLessThanOrEqual(frame.x + frame.width);
  }
  const longChart=page.getByRole('figure',{name:'Long time labels',exact:true});
  await longChart.locator('.recharts-line-dot').last().hover();
  await expect(longChart.locator('.recharts-tooltip-wrapper')).toContainText('2026-11-13T00:59:00Z');
  await longChart.getByRole('application').focus(); await page.keyboard.press('ArrowRight');
  await expect(longChart.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await expect(longChart.locator('.recharts-tooltip-wrapper')).toContainText('2026-11-13T00:');
  const range = page.getByRole('slider', {name:'Visible range 1',exact:true});
  await range.focus(); await page.keyboard.press('ArrowRight');
  await expect(range).toHaveAttribute('aria-valuenow','1');
  await expect(page.getByRole('region',{name:'Measurements',exact:true}).locator('tbody tr')).toHaveCount(4);
  const chart = page.getByRole('figure',{name:'Measurements',exact:true});
  await expect(chart.locator('.recharts-line')).toBeVisible();
  await chart.locator('.recharts-line-dot').last().hover();
  await expect(chart.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await chart.getByRole('application').focus(); await page.keyboard.press('ArrowRight');
  await expect(chart.locator('.recharts-tooltip-wrapper')).toBeVisible();
  await page.getByRole('button',{name:'Switch chart',exact:true}).click();
  await expect(chart.locator('.recharts-bar')).toBeVisible();
  await expect(page.getByRole('figure',{name:'Empty measurements',exact:true})).toContainText('No data');
  const density = node => {const s=getComputedStyle(node);return {padding:s.padding,font:s.fontSize,lineHeight:s.lineHeight};};
  const screenDensity=await page.locator('.screen-data-table tbody td').first().evaluate(density);
  await navigation.getByRole('button',{name:'Tables',exact:true}).click();
  const table = page.getByRole('region', {name:'Table — 예시: 열별 정렬·필터',exact:true}).first();
  expect(await table.locator('tbody td').first().evaluate(density)).toEqual(screenDensity);
  await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Dark',exact:true}).click();
  await page.evaluate(() => { window.__openedLinks = []; window.open = (...args) => { window.__openedLinks.push(args); return null; }; });
  const link = table.getByRole('link', { name: 'Item 1', exact: true });
  await link.click();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__openedLinks)).toEqual([['https://example.test/issues/1','_blank','noopener'],['https://example.test/issues/1','_blank','noopener']]);
  await expect(table.getByRole('link', { name: 'Item 2', exact: true })).toHaveAttribute('href','http://example.test/issues/2');
  for (const n of [3,4,5,6,7,8]) {
    await expect(table.getByRole('cell',{name:`Item ${n}`,exact:true})).toBeVisible();
    await expect(table.getByRole('link',{name:`Item ${n}`,exact:true})).toHaveCount(0);
  }
  if (screenshots) {
    await page.setViewportSize({width:1440,height:1000});
    await link.focus();
    await page.screenshot({path:'tmp/parts-gallery-tables-1440-dark.png'});
    await page.evaluate(async () => { const {i18n} = await import('/src/i18n.ts'); await i18n.changeLanguage('ko'); });
    await page.setViewportSize({width:640,height:1000});
    await link.focus();
    await page.screenshot({path:'tmp/view-link-ko-dark-640.png'});
    await page.evaluate(async () => { const {i18n} = await import('/src/i18n.ts'); await i18n.changeLanguage('en'); });
  }
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  const activeFilter=page.locator('[data-slot="popover-content"]:not([data-ending-style]) .data-table-filter');
  const condition = activeFilter.locator('select').first();
  await expect(condition).toHaveValue('values');
  await activeFilter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('61 / 61');
  await expect(table.getByRole('button',{name:'Filter name',exact:true})).toHaveAttribute('aria-pressed','false');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await activeFilter.getByLabel('Item 1',{exact:true}).uncheck();
  await activeFilter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('60 / 61');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await expect(condition).toHaveValue('values');
  await expect(activeFilter.getByLabel('Item 1',{exact:true})).not.toBeChecked();

  // Native popup pixels are reviewed separately. Protect the shared paired roles.
  const option = condition.locator('option').last();
  await expect(option).toHaveCSS('background-color', await page.locator('[data-slot="popover-content"]').evaluate(el=>getComputedStyle(el).backgroundColor));
  await expect(option).toHaveCSS('color', await page.locator('.ui-gallery').evaluate(el=>getComputedStyle(el).color));
  await condition.selectOption('empty');
  await activeFilter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await condition.selectOption('contains');
  await activeFilter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('61 / 61');
  await expect(table.getByRole('button',{name:'Filter name',exact:true})).toHaveAttribute('aria-pressed','false');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await condition.selectOption('contains');
  await activeFilter.getByRole('textbox',{name:'Contains text',exact:true}).fill('Item 1');
  await activeFilter.getByRole('button',{name:'Apply',exact:true}).click();
  // The two empty name rows must not survive a new text condition.
  await expect(table.getByRole('status')).toHaveText('11 / 61');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await expect(condition).toHaveValue('contains');
  await expect(activeFilter.getByLabel('Include empty values',{exact:true})).not.toBeChecked();
  await activeFilter.getByLabel('Include empty values',{exact:true}).check();
  await condition.selectOption('values');
  await condition.selectOption('contains');
  await expect(activeFilter.getByLabel('Include empty values',{exact:true})).toBeChecked();
  await activeFilter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('13 / 61');
  await table.getByRole('button',{name:'Filter name',exact:true}).click();
  await expect(condition).toHaveValue('contains');
  await expect(activeFilter.getByLabel('Include empty values',{exact:true})).toBeChecked();
  await activeFilter.getByRole('button',{name:'Cancel',exact:true}).click();

  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await table.getByRole('button',{name:'score',exact:true}).click();
  await table.getByRole('button',{name:'score',exact:true}).click();
  await expect(table.locator('tbody tr').first()).toContainText('100');
  await table.getByRole('button',{name:'Filter score',exact:true}).click();
  // Closing popovers remain mounted during exit; query the active surface.
  const filter = page.locator('[data-slot="popover-content"]:not([data-ending-style])');
  await expect(filter.getByLabel('Include empty values',{exact:true})).not.toBeChecked();
  await filter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.getByRole('status')).toHaveText('61 / 61');
  await expect(table.getByRole('button',{name:'Filter score',exact:true})).toHaveAttribute('aria-pressed','false');
  await table.getByRole('button',{name:'Filter score',exact:true}).click();
  await filter.getByLabel('Minimum',{exact:true}).fill('99');
  await filter.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('status')).toHaveText('1 / 61');
  await table.getByRole('button',{name:'Clear all filters',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table.locator('tbody tr').first()).toContainText('100');


  await navigation.getByRole('button',{name:'Document view',exact:true}).click();
  const documentView=page.getByRole('region',{name:'Document preview content',exact:true});
  await expect(documentView).toContainText('Document view example');
  await expect(documentView.getByRole('table')).toContainText('18');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Toggle preview width',exact:true}).click();
  await withBlockHover(page, async () => {
    const paragraph=documentView.locator('.tiptap > p').first();
    await paragraph.hover();
    const outline=documentView.getByTestId('block-hover-outline');
    await expect(outline).toBeVisible();
    if(screenshots) await page.screenshot({path:'tmp/hover-1712-gallery-1440.png'});
    await expect.poll(()=>paragraph.evaluate(node=>{
      const block=node.getBoundingClientRect(),outline=node.closest('.document').querySelector('.block-hover-outline').getBoundingClientRect();
      const probe=document.createElement('span');probe.style.padding='var(--space-block-hover-block) var(--space-block-hover-inline)';probe.style.position='absolute';probe.style.visibility='hidden';node.closest('.document').append(probe);
      const style=getComputedStyle(probe),inline=parseFloat(style.paddingLeft),vertical=parseFloat(style.paddingTop);probe.remove();
      return Math.max(Math.abs(outline.left-block.left+inline),Math.abs(outline.right-block.right-inline),Math.abs(outline.top-block.top+vertical),Math.abs(outline.bottom-block.bottom-vertical));
    })).toBeLessThan(2);
  });
  await page.getByRole('button',{name:'Toggle preview width',exact:true}).click();

  await expect(page.getByTestId('document-view-highlight')).toHaveAttribute('data-target-kind','cell');
  await page.getByRole('button',{name:'Select other cell',exact:true}).click();
  await expect(page.getByTestId('document-view-highlight')).toHaveAttribute('data-target-kind','cell');
  await page.setViewportSize({width:640,height:1000});
  await page.getByRole('button',{name:'Select other cell',exact:true}).click();
  await expect.poll(()=>documentView.locator('.table-scroll').evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(()=>page.getByTestId('document-view-highlight').evaluate(node=>{const cell=node.getBoundingClientRect(),scroll=node.closest('.screen-document-view').querySelector('.table-scroll').getBoundingClientRect();return cell.left>=scroll.left&&cell.right<=scroll.right;})).toBe(true);
  expect(await documentView.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
  const reads=await page.getByLabel('Document reads',{exact:true}).textContent();
  await page.getByRole('button',{name:'Toggle unrelated folder',exact:true}).click();
  await expect(page.getByRole('button',{name:'Toggle unrelated folder',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.screen-document-view')).toHaveAttribute('data-state','ready');
  await expect(page.getByLabel('Document reads',{exact:true})).toHaveText(reads);
  const sourcePassages=page.getByRole('region',{name:'Source passages',exact:true});
  await sourcePassages.hover();await page.mouse.wheel(0,600);
  await expect(page.getByTestId('document-view-highlight')).toHaveCount(0);
  const sourcePosition=await sourcePassages.evaluate(node=>node.scrollTop);
  await documentView.hover();await page.mouse.wheel(0,400);
  await expect.poll(()=>sourcePassages.evaluate(node=>node.scrollTop)).toBeGreaterThan(sourcePosition);
  await sourcePassages.focus();await page.keyboard.press('Home');
  await expect.poll(()=>sourcePassages.evaluate(node=>node.scrollTop)).toBe(0);
  await page.waitForTimeout(250); // A previous pane's settled report cannot reclaim the source after Home.
  expect(await sourcePassages.evaluate(node=>node.scrollTop)).toBe(0);
  await documentView.getByText('Nested source item',{exact:true}).click();
  await expect.poll(()=>sourcePassages.evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop)).toBe(0);
  await page.getByRole('button',{name:'Toggle stale target',exact:true}).click();
  await expect(page.locator('.screen-document-view')).toHaveAttribute('data-state','stale-target');
  await expect(page.getByTestId('document-view-highlight')).toHaveCount(0);
  if (screenshots) {
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'Toggle stale target',exact:true}).click();
    await expect(page.locator('.screen-document-view')).toHaveAttribute('data-state','ready');
    const theme = page.getByRole('group',{name:'Theme',exact:true});
    const capture = async (width,height,mode,stage) => {
      await page.setViewportSize({width,height});
      await theme.getByRole('button',{name:mode === 'light' ? 'Light' : 'Dark',exact:true}).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',mode);
      await page.evaluate(() => document.querySelector('.ui-gallery').scrollTop = 0);
      await page.screenshot({path:`tmp/screen-fill-${stage}-${width}x${height}-${mode}.png`,animations:'disabled'});
    };
    await capture(1440,1000,'light','before');
    await page.getByRole('button',{name:'Fill available height',exact:true}).click();
    for (const [width,height,mode] of [[1440,1000,'light'],[1440,700,'light'],[640,700,'dark'],[1440,1000,'dark']]) {
      await capture(width,height,mode,'after');
    }
  }
}
