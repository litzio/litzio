// Manual capture only. Back up apps/editor/test/quiet-document.browser.js and copy here,
// then pnpm browser:test quiet-document --screenshots; restore the original immediately.
async (page, { screenshots }) => {
  if (!screenshots) throw new Error('Manual capture requires --screenshots');
  const origin = page.url().split('/').slice(0,3).join('/');
  for (const [width,theme] of [[1440,'light'],[640,'dark']]) {
    await page.setViewportSize({width,height:1100});
    for (const variant of ['a','b']) {
      await page.goto(`${origin}/template-gallery?variant=${variant}&theme=${theme}`);
      await page.getByRole('heading',{name:'템플릿 갤러리',exact:true}).waitFor();
      await page.evaluate(async()=>{await document.fonts.ready;});
      await page.screenshot({path:`docs/reviews/assets/template-gallery-936/${variant}-${width}-${theme}.png`,fullPage:true});
      if(variant==='b') await page.getByRole('button',{name:/AI 작업 보고서 요/}).click();
      await page.getByRole('button',{name:'이 템플릿으로 새 문서',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      await page.screenshot({path:`docs/reviews/assets/template-gallery-936/${variant}-${width}-${theme}-save.png`});
      await page.getByRole('combobox').selectOption('개인 / 노트');
      await page.getByRole('button',{name:'위치 선택 완료',exact:true}).click();
      if(variant==='b') await page.getByRole('button',{name:'목록으로',exact:true}).click();
      const long = page.getByRole('button',{name:/고객 인터뷰 및 제품 개선 제안 정리/});
      await long.click();
      if(variant==='b') await page.getByRole('button',{name:'목록으로',exact:true}).waitFor();
      await page.screenshot({path:`docs/reviews/assets/template-gallery-936/${variant}-${width}-${theme}-long.png`});
      await page.getByRole('button',{name:'빈 상태',exact:true}).click();
      await page.screenshot({path:`docs/reviews/assets/template-gallery-936/${variant}-${width}-${theme}-empty.png`});
    }
  }
}

