// Product identity, localized copy and pre-paint preferences share one build setting.
async (page, { brand, expect, screenshots }) => {
  const previousLanguage = await page.evaluate(prefix => localStorage.getItem(`${prefix}.uiLanguage`), brand.storagePrefix);
  try {
    await page.route(/\/api\/document$/, route => route.request().method() === 'GET'
      ? route.fulfill({json:{start:true}}) : route.continue());
    for (const language of ['en','ko']) {
      for (const theme of ['light', 'dark']) {
      await page.emulateMedia({colorScheme: theme});
      await page.evaluate(({brand,language,theme}) => {
        localStorage.clear();
        localStorage.setItem(`${brand.storagePrefix}.uiLanguage`, language);
        localStorage.setItem(`${brand.storagePrefix}.theme`, theme);
        localStorage.setItem(`${brand.storagePrefix}.pageBackground`, 'flat');
      }, {brand,language,theme});
      await page.reload();
      const start = page.getByTestId('document-start');
      await expect(start).toBeVisible();
      await expect(start.locator('.document-start-product')).toHaveText(brand.name[language]);
      await expect(start.getByRole('heading',{level:1})).toContainText(brand.name[language]);
      await expect(page).toHaveTitle(brand.name[language]);
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await expect(page.locator('html')).toHaveAttribute('data-page','flat');
      // Switching the saved background survives the same startup path; captures match the baseline.
      await page.evaluate(prefix => localStorage.setItem(`${prefix}.pageBackground`, 'paper'), brand.storagePrefix);
      await page.reload();
      await expect(start).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-page','paper');
      await page.evaluate(() => document.fonts.ready);
      for (const [selector, source] of [['.document-start-mark', theme === 'dark' ? brand.icons.darkSvg : brand.icons.svg], ['.app-brand img', theme === 'dark' ? brand.icons.darkSvg : brand.icons.svg]]) {
        const mark = page.locator(selector + (theme === 'dark' ? '[data-brand-dark]' : '[data-brand-light]'));
        await expect(mark).toBeVisible();
        if (!(await mark.getAttribute('src')).includes(source.split('/').pop())) throw Error('Product mark ignores the configured SVG: ' + source + ' => ' + await mark.getAttribute('src'));
        if (!await mark.evaluate(async image => { await image.decode(); return image.naturalWidth > 0 && image.naturalWidth === image.naturalHeight; })) throw Error('Product SVG did not decode');
      }
      const favicon = page.locator('link[type="image/svg+xml"]');
      await expect(favicon).toHaveAttribute('type', 'image/svg+xml');
      await expect(favicon).toHaveAttribute('href', '/favicon.svg');
      const svg = await page.evaluate(async () => (await fetch('/favicon.svg')).text());
      if (svg.length > 32768 || !svg.includes('prefers-color-scheme:dark')) throw Error('Adaptive favicon contract violated');
      const color = await page.evaluate(async () => {
        const image = new Image(); image.src = '/favicon.svg'; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) return Array.from(data.slice(i, i + 3));
        throw Error('Favicon is blank');
      });
      expect(color).toEqual(theme === 'dark' ? [224,36,79] : [165,0,52]);
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:900});
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Brand copy overflows the viewport');
        const aligned = await page.locator('.app-brand img' + (theme === 'dark' ? '[data-brand-dark]' : '[data-brand-light]')).evaluate(image => {
          const icon = image.getBoundingClientRect(), row = image.parentElement.getBoundingClientRect();
          return icon.left >= row.left && icon.right <= row.right && icon.top >= row.top && icon.bottom <= row.bottom
            && Math.abs((icon.top + icon.bottom - row.top - row.bottom) / 2) <= 1;
        });
        if (!aligned) throw Error('Header mark is clipped or vertically misaligned');
        if (screenshots && language === 'en') {
          await page.evaluate(() => {
            const preview = document.createElement('div'); preview.id = 'favicon-preview';
            preview.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:12px;background:Canvas;color:CanvasText;border:1px solid gray;z-index:9999';
            preview.innerHTML = 'Tab favicon resource: <img src="/favicon.svg" width="16" height="16"> <img src="/favicon.svg" width="32" height="32">';
            document.body.append(preview);
          });
          await page.locator('#favicon-preview img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
          await page.screenshot({path:`tmp/905-icon/editor-${width}-${language}-${theme}.png`});
          await page.locator('#favicon-preview').evaluate(element => element.remove());
        }
      }
    }
    }
  } finally {
    await page.evaluate(({prefix,language}) => {
      if (language === null) localStorage.removeItem(`${prefix}.uiLanguage`);
      else localStorage.setItem(`${prefix}.uiLanguage`, language);
    }, {prefix:brand.storagePrefix, language:previousLanguage});
  }
}
