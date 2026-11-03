// Manual capture body; temporarily replace quiet-document.browser.js, run
// pnpm browser:test quiet-document --screenshots, then restore its original bytes.
async (page, { screenshots }) => {
 if (!screenshots) throw new Error('Manual captures only');
 const origin=page.url().split('/').slice(0,3).join('/');
 for(const [width,theme] of [[1440,'light'],[640,'dark']]) {
  await page.setViewportSize({width,height:1100});
  await page.goto(`${origin}/template-gallery?variant=c&theme=${theme}`);
  await page.getByRole('heading',{name:'템플릿 갤러리',exact:true}).waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;});
  await page.screenshot({path:`docs/reviews/assets/template-gallery-936/c-${width}-${theme}.png`});
  const trigger=page.getByRole('button',{name:'AI 작업 보고서 미리보기',exact:true});
  const popup=page.getByRole('dialog',{name:'AI 작업 보고서 문서 미리보기',exact:true});
  await trigger.hover();
  await popup.locator('.katex').first().waitFor();
  await page.screenshot({path:`docs/reviews/assets/template-gallery-936/c-${width}-${theme}-hover.png`});
  // Pointer departure and focus opening use real interactions, no state injection.
  await page.mouse.move(5,5);
  await popup.waitFor({state:'hidden'});
  await page.getByRole('textbox',{name:'템플릿 찾기'}).focus();
  await page.keyboard.press('Tab');
  await popup.locator('.katex').first().waitFor();
  await page.screenshot({path:`docs/reviews/assets/template-gallery-936/c-${width}-${theme}-focus.png`});
  // Base UI retains sequential focus order into the portaled popup.
  for(let step=0;step<5;step++) {
   if(await page.getByRole('region',{name:'미리보기 내용 스크롤',exact:true}).evaluate(el=>el===document.activeElement)) break;
   await page.keyboard.press('Tab');
  }
  if (!await page.getByRole('region',{name:'미리보기 내용 스크롤',exact:true}).evaluate(el=>el===document.activeElement)) throw new Error('Scroll region not reachable by Tab');
  await page.keyboard.press('PageDown');
  await page.waitForFunction(()=>{ const el=document.querySelector('.tg-preview-scroll'); return el && el.scrollTop >= Math.min(el.clientHeight * .75, el.scrollHeight-el.clientHeight); });
  await page.screenshot({path:`docs/reviews/assets/template-gallery-936/c-${width}-${theme}-keyboard-scroll.png`});
  await page.keyboard.press('Escape');
  await popup.waitFor({state:'hidden'});
  await page.getByRole('button',{name:/고객 인터뷰.* 미리보기$/}).hover();
  const long=page.getByRole('dialog',{name:/고객 인터뷰.* 문서 미리보기$/});
  await long.locator('.katex').first().waitFor();
  await page.screenshot({path:`docs/reviews/assets/template-gallery-936/c-${width}-${theme}-long-hover.png`});
  await page.mouse.move(5,5);
  await long.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'이 템플릿으로 새 문서',exact:true}).first().click();
  await page.getByRole('dialog',{name:'새 문서의 저장 위치'}).waitFor();
  await page.screenshot({path:`docs/reviews/assets/template-gallery-936/c-${width}-${theme}-save.png`});
  await page.keyboard.press('Escape');
 }
}
