// Native bridge stand-in; real deletion/lifetime is checked by offline/helper tests.
async (page, { expect, assistantFixture, openPath }) => {
  await page.addInitScript(() => {
    let restartCheck;
    window.__resetCalls = [];
    window.litzioDesktop = {
      registeredHosts: async () => ({ hosts: [], allowedHostIds: [], productVersion: 'test' }), reportPendingWork: () => {}, reportHostWork: async () => {},
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
  await page.reload();
  const file = assistantFixture.document.replace(/([\\/])assistant[\\/]document\.md$/, '$1app-reset$1document.md');
  await openPath(page, file);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Saving & recovery', exact: true }).click();
  const review = page.getByRole('button', { name: 'Review app reset…', exact: true });
  await review.click();
  const confirmation = page.getByRole('dialog', { name: 'Reset app?', exact: true });
  await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await expect(confirmation).toContainText('other browser profiles');
  await confirmation.getByText('Deletion locations', { exact: true }).click();
  await expect(confirmation).toContainText('C:/isolated-fixture/Litzio/profile');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__resetCalls.length)).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.locator('[data-document-tab][data-active=true] .tiptap[contenteditable=true]');
  await editor.click(); await page.keyboard.type('Unsaved reset protection');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Saving & recovery', exact: true }).click();
  await review.click();
  await confirmation.getByRole('checkbox', { name: 'Also remove empty settings folders', exact: true }).check();
  await confirmation.getByRole('button', { name: 'Delete data and restart', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__resetCalls)).toEqual([{ removeFolders: true, revision: 'reviewed-fixture' }]);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  return { resetCalls: await page.evaluate(() => window.__resetCalls) };
}
