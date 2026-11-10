// Footer toggle, shared Settings/commands and persistence; captures are manual only.
async (page, { expect, screenshots = false }) => {
  const settings = () => page.getByTestId('sidebar').locator('[data-open-settings]');
  const mode = () => page.getByRole('button',{name:/^(Color mode|색상 모드):/});
  const closeSettings = async () => { await page.locator('[data-tab-id="settings"] .document-tab-close').click(); await page.getByTestId('settings-dialog').waitFor({state:'detached'}); };
  const configure = async (language, theme) => {
    await settings().click();
    await page.getByTestId('theme').selectOption(theme);
    await page.getByTestId('ui-language').selectOption(language);
    await closeSettings();
  };
  const assertChoice = async value => {
    await expect(page.locator('html')).toHaveAttribute('data-theme',value);
    expect(await page.evaluate(() => localStorage.getItem('litzio.theme'))).toBe(value);
  };
  // First OS resolution is stored; subsequent OS changes leave that choice intact.
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(() => localStorage.removeItem('litzio.theme'));
  await page.reload();
  await assertChoice('dark');
  await page.emulateMedia({colorScheme:'light'});
  await assertChoice('dark');
  for (const [width, language, theme] of [[1440,'en','light'],[640,'ko','dark']]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.locator('.app-shell').evaluate(n=>n.classList.contains('app-shell--navigation-overlay'))).toBe(width<1100);
    await configure(language,theme);
    const expand=page.getByRole('button',{name:/^(Expand Explorer|탐색기 펼치기)$/});
    if(await expand.isVisible()) await expand.click();
    await expect(mode()).toHaveAttribute('title',`${language==='en'?'Color mode':'색상 모드'}: ${theme==='light'?'Light':'다크'}`);
    await expect(mode().locator('svg')).toHaveClass(new RegExp(theme==='light'?'lucide-sun':'lucide-moon'));
    const a = await settings().boundingBox(), b = await mode().boundingBox();
    expect(a.y + a.height/2).toBe(b.y + b.height/2);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);
    expect(b.x+b.width).toBeLessThanOrEqual(width);
    if (screenshots) { await page.evaluate(() => document.fonts.ready); await page.screenshot({path:`tmp/theme-1042/after-${width}.png`}); }
    await page.getByRole('button',{name:/^(Collapse Explorer|탐색기 접기)$/}).click();
    await settings().focus(); await page.keyboard.press('Tab');
    await expect(mode()).toBeFocused();
    await page.keyboard.press('Enter');
    await assertChoice(theme==='light'?'dark':'light');
    await expect(mode()).toBeFocused();
    await page.keyboard.press('Space');
    await assertChoice(theme);
    if (screenshots) await page.screenshot({path:`tmp/theme-1042/after-${width}-rail.png`});
    await page.getByRole('button',{name:/^(Expand Explorer|탐색기 펼치기)$/}).click();
    await settings().click();
    expect(await page.getByTestId('theme').locator('option').evaluateAll(nodes => nodes.map(n=>n.value))).toEqual(['light','dark']);
    await expect(page.getByTestId('theme')).toHaveValue(theme);
    if (screenshots) await page.screenshot({path:`tmp/theme-1042/after-${width}-settings.png`});
    await closeSettings();
  }
  for (const [language, labels] of [['en',['Light','Dark']],['ko',['라이트','다크']]]) {
    await configure(language,'light');
    for (const [index,value] of ['light','dark'].entries()) {
      await page.keyboard.press('Control+Slash');
      const input = page.getByRole('combobox');
      await expect(input).toBeFocused();
      await input.fill(`> ${language==='en'?'색상 모드':'color mode'} ${value}`);
      const option = page.getByRole('option',{name:`${language==='en'?'Color mode':'색상 모드'}: ${labels[index]}`,exact:true});
      await expect(option).toBeVisible();
      await page.keyboard.press('Enter');
      await option.waitFor({state:'detached'});
      await assertChoice(value);
    }
  }
  await page.reload();
  await assertChoice('dark');
  await settings().click(); await expect(page.getByTestId('theme')).toHaveValue('dark'); await closeSettings();
  // Storage refusal must preserve the live choice and expose the existing localized error.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreThemeStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) { if (key === 'litzio.theme') throw Error('Storage refused'); return original.call(this,key,value); };
  });
  await mode().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.getByText('테마를 저장하지 못했습니다. 이 페이지를 닫을 때까지 적용됩니다.',{exact:true})).toBeVisible();
  await settings().click();
  await expect(page.getByTestId('theme')).toHaveValue('light');
  await expect(page.getByRole('alert').filter({hasText:'테마를 저장하지 못했습니다.'})).toBeVisible();
  await closeSettings();
  await page.evaluate(() => window.__restoreThemeStorage());
  await mode().click();
  await expect(page.getByText('테마를 저장하지 못했습니다. 이 페이지를 닫을 때까지 적용됩니다.',{exact:true})).toHaveCount(0);

  // Exercise the real View Transition path once, and both immediate bypasses.
  await page.emulateMedia({reducedMotion:'no-preference'});
  const transitionResult = await page.evaluate(async () => {
    const theme = await import('/src/theme.ts');
    const original = document.startViewTransition.bind(document);
    let calls = 0;
    document.startViewTransition = callback => { calls++; return original(callback); };
    try {
      await theme.applyTheme('light'); // webdriver must bypass animation
      const automatedCalls = calls;
      Object.defineProperty(navigator,'webdriver',{configurable:true,value:false});
      await theme.applyTheme('dark');
      const transitions = document.getAnimations().filter(a => a.effect?.pseudoElement?.includes('view-transition'));
      await Promise.all(transitions.map(a => a.finished));
      return {automatedCalls, calls};
    } finally { document.startViewTransition = original; delete navigator.webdriver; }
  });
  expect(transitionResult).toEqual({automatedCalls:0,calls:1});
  await page.emulateMedia({reducedMotion:'reduce'});
  const reducedCalls = await page.evaluate(async () => {
    const theme = await import('/src/theme.ts');
    const original = document.startViewTransition;
    let calls = 0;
    document.startViewTransition = callback => { calls++; return original.call(document,callback); };
    Object.defineProperty(navigator,'webdriver',{configurable:true,value:false});
    try { await theme.applyTheme('light'); return calls; }
    finally { document.startViewTransition = original; delete navigator.webdriver; }
  });
  expect(reducedCalls).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});

  // Leave shared-context scenarios with their ordinary English/Light setup.
  await configure('en','light');

}
