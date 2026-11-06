// Native bridge stand-in; real deletion/lifetime is checked by offline/helper tests.
async (page, { expect, assistantFixture, openPath }) => {
  await page.addInitScript(() => {
    let restartCheck;
    window.__resetCalls = [];
    window.litzioDesktop = {
      registeredHosts: async () => ({ hosts: [], allowedHostIds: [], productVersion: 'test' }), reportHostWork: async () => {},
      hostConnection: async () => ({ url: location.origin, productVersion: 'test', desktopVersion: 'test' }),
      info: async () => ({ version: 'test', channel: 'beta', updatesSupported: false, update: { phase: 'idle' }, seenUpdate: null }),
      setTheme: async () => false, setWindowBackground: async () => {}, onUpdateState: () => () => {},
      onRestartCheck: check => { restartCheck = check; return () => { restartCheck = undefined; }; },
      resetPlan: async () => ({ operation: 'app-reset', scope: 'local-app-and-host', revision: 'reviewed-fixture',
        targets: [{ path: 'C:/isolated-fixture/Litzio/profile', kind: 'directory', contents: 'Fixture data' }], retained: [] }),
      resetApp: async (removeFolders, revision) => {
        window.__resetCalls.push({ removeFolders, revision });
        return restartCheck ? restartCheck() : { ok: false, reason: 'Not ready' };
      },
    };
  });
  await page.route("**/api/host-capabilities", route => route.fulfill({json:{fileDeletion:"trash",identity:{runAs:"fixture-user"}}}));
  await page.reload();
  const file = assistantFixture.document.replace(/([\\/])assistant[\\/]document\.md$/, '$1app-reset$1document.md');
  await openPath(page, file);
  const captureRoot = 'docs/design/assets/app-reset-1285';
  for (const [width, language, theme] of [[1440, 'en', 'light'], [640, 'ko', 'dark']]) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(async ({language, theme}) => {
      const {i18n} = await import('/src/i18n.ts'); await i18n.changeLanguage(language);
      document.documentElement.dataset.theme = theme;
      window.__savedResetPlan = window.litzioDesktop.resetPlan;
      window.__savedResetApp = window.litzioDesktop.resetApp;
      delete window.litzioDesktop.resetPlan; delete window.litzioDesktop.resetApp;
    }, {language, theme});
    const settings = page.getByRole('button',{name:language==='ko'?'설정':'Settings',exact:true});
    await settings.click();
    await page.getByRole('button',{name:language==='ko'?'저장·복구':'Saving & recovery',exact:true}).click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: captureRoot + '/before-' + width + '.png'});
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.litzioDesktop.resetPlan=window.__savedResetPlan; window.litzioDesktop.resetApp=window.__savedResetApp; });
    await settings.click();
    await page.getByRole('button',{name:language==='ko'?'저장·복구':'Saving & recovery',exact:true}).click();
    await page.getByRole('button',{name:language==='ko'?'초기화 항목 확인…':'Review app reset…',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: captureRoot + '/after-' + width + '.png'});
    await page.getByRole('button',{name:language==='ko'?'초기화 항목 확인…':'Review app reset…',exact:true}).click();
    const modal = page.getByRole('dialog',{name:language==='ko'?'앱을 초기화할까요?':'Reset app?',exact:true});
    await modal.getByText(language==='ko'?'삭제할 위치':'Deletion locations',{exact:true}).click();
    await page.screenshot({path:captureRoot + '/confirm-' + width + '.png'});
    await modal.getByRole('button',{name:language==='ko'?'취소':'Cancel',exact:true}).click();
    await page.keyboard.press('Escape');
  }
  return {manualCapture: true};
}
