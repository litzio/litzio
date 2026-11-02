// Manual visual review; copy to apps/editor/test/manual-table-wrap.browser.js and run with pnpm browser:test.
async (page, {openPath}) => {
  const captures = [];
  const capture = async path => {
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path});
    captures.push({path, ...await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
      theme:document.documentElement.dataset.theme,language:document.documentElement.lang,userAgent:navigator.userAgent,
      tables:[...document.querySelectorAll('[data-document-tab][data-active=true] .table-scroll,.docling-tab[data-active=true] .table-scroll')].map(n=>({width:n.clientWidth,scrollWidth:n.scrollWidth,scrollLeft:n.scrollLeft}))}))});
  };
  const initial = await (await page.request.get(page.url().split('/').slice(0,3).join('/') + '/api/document')).json();
  const sep = initial.path.includes('\\') ? '\\' : '/';
  const root = initial.path.split(sep).slice(0,-4).join(sep);
  const file = [root,'tmp','table-authoring','wrapping.md'].join(sep);
  await openPath(page,file);
  const phase = 'after';
  const table = page.locator('[data-document-tab][data-active=true] [data-block=table]').first();
  const second = page.locator('[data-document-tab][data-active=true] [data-block=table]').nth(1);
  for (const [width,theme,lang] of [[1440,'light','en'],[640,'dark','ko']]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(async ({theme,lang}) => {
      (await import('/src/theme.ts')).applyTheme(theme);
      await (await import('/src/i18n.ts')).i18n.changeLanguage(lang);
      await document.fonts.ready;
    },{theme,lang});
    await table.locator('td').first().click();
    await table.evaluate(el=>el.scrollIntoView({block:'start'}));
    await capture(`docs/design/assets/table-wrap-897/${phase}-${width}.png`);
    if (phase === 'after') {
      await second.locator('td').first().click();
      await second.scrollIntoViewIfNeeded();
      await capture(`docs/design/assets/table-wrap-897/after-${width}-korean.png`);
    }
  }
  if (phase === 'after') {
    await second.scrollIntoViewIfNeeded();
    await second.locator('td').first().click();
    await capture(`docs/design/assets/table-wrap-897/after-640-korean.png`);
    await page.getByTestId('view-read').click();
    await table.evaluate(el=>el.scrollIntoView({block:'start'}));
    await capture(`docs/design/assets/table-wrap-897/after-640-read.png`);
    await page.getByTestId('view-visual').click();
    await page.evaluate(async () => { await (await import('/src/i18n.ts')).i18n.changeLanguage('en'); });
    await openPath(page,file.replace('wrapping.md','tables.md'));
    const wide = page.locator('[data-document-tab][data-active=true] [data-block=table]').first();
    await wide.locator('td').first().click();
    for (let i=0;i<7;i++) await wide.getByRole('button',{name:'Append column',exact:true}).click();
    for (const width of [1440,640]) {
      await page.setViewportSize({width,height:1000});
      await wide.scrollIntoViewIfNeeded();
      for (const edge of ['start','end']) {
        await wide.locator('.table-scroll').evaluate((el,edge)=>el.scrollLeft=edge==='end'?el.scrollWidth:0,edge);
        await wide.hover({position:{x:8,y:8}});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await capture(`docs/design/assets/table-wrap-897/after-${width}-wide-${edge}.png`);
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.getByTestId('sidebar').getByRole('button',{name:'Docling',exact:true}).click();
    await page.getByRole('button',{name:'Open conversion folder…',exact:true}).click();
    await page.getByTestId('folder-path').fill([root,'tmp','docling-compare','nist-sp1108r4'].join(sep));
    await page.getByTestId('folder-open').click();
    const compared = page.locator('.docling-tab[data-active=true] .table-block').first();
    await compared.evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.locator('.docling-tab[data-active=true] .docling-source img').first().waitFor({state:'visible'});
    await page.waitForFunction(()=>[...document.querySelectorAll('.docling-tab[data-active=true] .docling-source img')].every(img=>img.complete));
    await page.evaluate(()=>document.fonts.ready);
    await capture('docs/design/assets/table-wrap-897/after-1440-compare.png');
  }
  return {phase, captures, environment:await page.evaluate(()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio}))};
}
