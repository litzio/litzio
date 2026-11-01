async (page, {openPath, expect}) => {
 const initial=await (await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document')).json();
 const sep=initial.path.includes('\\')?'\\':'/';
 const file=[...initial.path.split(sep).slice(0,-4),'tmp','quiet-document','quiet-document.md'].join(sep);
 for(const [width,language,theme] of [[1440,'en','light'],[640,'ko','dark']]) {
  await page.setViewportSize({width,height:1000});
  await page.evaluate(({theme})=>{localStorage.clear();localStorage.setItem('litzio.theme',theme);localStorage.setItem('litzio.uiLanguage','en');}, {theme});
  if(width===1440) await page.reload();
  else await page.evaluate(async theme=>{(await import('/src/theme.ts')).applyTheme(theme);await (await import('/src/i18n.ts')).i18n.changeLanguage('en');},theme);
  await expect(page.locator('html')).toHaveAttribute('data-accent','plum');
  const values=await page.evaluate(()=>{const r=document.documentElement;const read=()=>['interaction','accent-hover','surface-selected','surface-selected-hover'].map(x=>getComputedStyle(r).getPropertyValue('--id-color-'+x));const a=read();delete r.dataset.accent;const b=read();r.dataset.accent='plum';return {a,b};});
  expect(values.a).toEqual(values.b);
  await openPath(page,file);
  await page.getByRole('button',{name:'Document settings',exact:true}).click();
  await page.getByRole('checkbox',{name:'Number headings',exact:true}).check();
  await page.keyboard.press('Escape');
  await page.evaluate(async language=>{await (await import('/src/i18n.ts')).i18n.changeLanguage(language);},language);
  const block=page.locator('[data-document-tab][data-active=true] [data-block=heading]').first();
  await block.click();
  await page.evaluate(async()=>{await document.fonts.ready;document.querySelector('.document-scroll[data-active=true]').scrollTo(0,0);});
  await page.getByTestId("save").focus();
  await page.mouse.move(0,0);
  await page.screenshot({path:`tmp/accent-896/${width}-document.png`});
  await page.getByRole('button',{name:language==='ko'?'설정':'Settings',exact:true}).click();
  await expect(page.getByTestId('accent-color').locator('input[value=plum]')).toBeChecked();
  await page.getByTestId('accent-color').locator('input[value=plum]').focus();
  await page.screenshot({path:`tmp/accent-896/${width}-settings.png`});
  await page.keyboard.press('Escape');
  await page.locator('[data-document-tab][data-active=true] .document-editor').evaluate(n=>n.editor.commands.undo());
 }
}

